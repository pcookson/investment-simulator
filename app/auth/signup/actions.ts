"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { getSpyClosingPrice, MarketDataError } from "@/lib/market";
import { redirect } from "next/navigation";

export type SignUpState = {
  error: string | null;
  confirmEmail?: boolean; // true when Supabase requires email confirmation before login
};

export async function signUpAction(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const displayName = (formData.get("displayName") as string | null)?.trim() ?? "";

  // ── Client-side-style validation on the server ──────────────────────────
  if (!email || !password || !displayName) {
    return { error: "All fields are required." };
  }
  if (displayName.length < 2) {
    return { error: "Display name must be at least 2 characters." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  // ── Step 1: Create the Supabase Auth user ────────────────────────────────
  const supabase = await createServerSupabaseClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });

  if (authError) {
    if (
      authError.message.toLowerCase().includes("already registered") ||
      authError.message.toLowerCase().includes("already been registered") ||
      authError.code === "user_already_exists"
    ) {
      return { error: "An account with this email already exists. Try signing in." };
    }
    if (
      authError.message.toLowerCase().includes("password") ||
      authError.code === "weak_password"
    ) {
      return { error: "Password is too weak. Use at least 6 characters." };
    }
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Sign up failed. Please try again." };
  }

  const userId = authData.user.id;

  // ── Step 2: Fetch SPY baseline price ────────────────────────────────────
  // All subsequent writes use the service role client so they bypass RLS
  // (users only have SELECT on portfolios and daily_snapshots).
  const service = createServiceClient();

  let spyPrice: number;
  try {
    spyPrice = await getSpyClosingPrice();
  } catch (err) {
    // Market data failed — delete the orphaned auth user and surface the error.
    await service.auth.admin.deleteUser(userId);

    if (err instanceof MarketDataError) {
      return {
        error:
          "Could not fetch market data to set up your portfolio. " +
          "Please try again in a moment.",
      };
    }
    return { error: "An unexpected error occurred. Please try again." };
  }

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // ── Step 3: Insert portfolio row ─────────────────────────────────────────
  const { error: portfolioError } = await service.from("portfolios").insert({
    user_id: userId,
    cash_balance: 100000.0,
    sp500_baseline_price: spyPrice,
  });

  if (portfolioError) {
    await service.auth.admin.deleteUser(userId);
    return { error: "Failed to create your portfolio. Please try again." };
  }

  // ── Step 4: Insert initial daily snapshot ────────────────────────────────
  const { error: snapshotError } = await service
    .from("daily_snapshots")
    .insert({
      user_id: userId,
      date: today,
      portfolio_value: 100000.0,
      sp500_value: 100000.0,
    });

  if (snapshotError) {
    // Roll back both the portfolio and the auth user.
    await service.from("portfolios").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
    return { error: "Failed to initialize your account. Please try again." };
  }

  // ── Success ──────────────────────────────────────────────────────────────
  // If email confirmation is enabled, Supabase returns session: null and the
  // user must click the confirmation link before they can sign in.
  if (!authData.session) {
    return { error: null, confirmEmail: true };
  }

  // redirect() throws a NEXT_REDIRECT — must not be inside try/catch.
  redirect("/dashboard");
}
