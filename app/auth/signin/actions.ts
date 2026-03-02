"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export type SignInState = {
  error: string | null;
};

export async function signInAction(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (
      error.message.toLowerCase().includes("invalid login credentials") ||
      error.message.toLowerCase().includes("invalid credentials") ||
      error.code === "invalid_credentials"
    ) {
      return { error: "Incorrect email or password." };
    }
    if (
      error.message.toLowerCase().includes("email not confirmed") ||
      error.code === "email_not_confirmed"
    ) {
      return {
        error:
          "Please confirm your email address before signing in. " +
          "Check your inbox for a confirmation link.",
      };
    }
    return { error: error.message };
  }

  // redirect() throws NEXT_REDIRECT — must not be inside try/catch.
  redirect("/dashboard");
}
