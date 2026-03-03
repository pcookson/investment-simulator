"use server";

// -----------------------------------------------------------------------------
// lib/trading.ts — Server actions for trade submission and cancellation
// -----------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validateTicker } from "@/lib/market";
import { getExecutionDate } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradeResult =
  | { success: false; error: string }
  | {
      success: true;
      tradeId: string;
      ticker: string;
      name: string;
      tradeType: "buy" | "sell";
      shares: number;
      price: number;
      executionDate: string; // YYYY-MM-DD
    };


// ---------------------------------------------------------------------------
// submitTradeAction
// ---------------------------------------------------------------------------

export async function submitTradeAction(
  _prevState: TradeResult,
  formData: FormData
): Promise<TradeResult> {
  const supabase = await createServerSupabaseClient();

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in to place an order." };
  }

  // 2. Parse form fields
  const rawTicker = (formData.get("ticker") as string | null)?.trim() ?? "";
  const rawType = (formData.get("tradeType") as string | null) ?? "";
  const rawShares = (formData.get("shares") as string | null) ?? "";

  if (!rawTicker) {
    return { success: false, error: "Please enter a ticker symbol." };
  }
  if (rawType !== "buy" && rawType !== "sell") {
    return { success: false, error: "Please select buy or sell." };
  }
  const shares = parseFloat(rawShares);
  if (isNaN(shares) || shares <= 0) {
    return { success: false, error: "Shares must be a positive number." };
  }
  // Whole shares only in V1 (simpler UX, avoids fractional-share edge cases)
  if (!Number.isInteger(shares)) {
    return { success: false, error: "Please enter a whole number of shares." };
  }

  const tradeType = rawType as "buy" | "sell";

  // 3. Validate ticker and get current price
  let tickerInfo: Awaited<ReturnType<typeof validateTicker>>;
  try {
    tickerInfo = await validateTicker(rawTicker);
  } catch {
    return {
      success: false,
      error: `"${rawTicker.toUpperCase()}" is not a valid ticker. Please check the symbol and try again.`,
    };
  }

  const { ticker, name, price } = tickerInfo;
  const estimatedCost = shares * price;

  // 4. Load portfolio
  const { data: portfolio, error: portfolioErr } = await supabase
    .from("portfolios")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  if (portfolioErr || !portfolio) {
    return { success: false, error: "Could not load your portfolio. Please try again." };
  }

  // 5. Trade-type-specific validation
  if (tradeType === "buy") {
    if (estimatedCost > portfolio.cash_balance) {
      const available = portfolio.cash_balance.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });
      return {
        success: false,
        error: `Insufficient funds. You have ${available} available, but this order would cost approximately $${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      };
    }
  } else {
    // sell — check holdings
    const { data: holding } = await supabase
      .from("holdings")
      .select("shares")
      .eq("user_id", user.id)
      .eq("ticker", ticker)
      .maybeSingle();

    const heldShares = holding?.shares ?? 0;
    if (shares > heldShares) {
      return {
        success: false,
        error: `Insufficient shares. You hold ${heldShares} share${heldShares === 1 ? "" : "s"} of ${ticker}, but tried to sell ${shares}.`,
      };
    }
  }

  // 6. Insert the trade (status = pending, executed_price/executed_at left null)
  const { data: trade, error: insertErr } = await supabase
    .from("trades")
    .insert({
      user_id: user.id,
      ticker,
      trade_type: tradeType,
      shares,
      status: "pending",
    })
    .select("id, submitted_at")
    .single();

  if (insertErr || !trade) {
    return { success: false, error: "Failed to submit your order. Please try again." };
  }

  // 7. Compute execution date from submission time
  const executionDate = getExecutionDate(new Date(trade.submitted_at));

  revalidatePath("/trade");
  revalidatePath("/trade/pending");

  return {
    success: true,
    tradeId: trade.id,
    ticker,
    name,
    tradeType,
    shares,
    price,
    executionDate,
  };
}

// ---------------------------------------------------------------------------
// cancelTradeAction
// ---------------------------------------------------------------------------

export async function cancelTradeAction(tradeId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // Only cancel if the trade is still pending AND belongs to this user
  await supabase
    .from("trades")
    .update({ status: "cancelled" })
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .eq("status", "pending");

  revalidatePath("/trade/pending");
}
