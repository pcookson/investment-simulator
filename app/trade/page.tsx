// app/trade/page.tsx — Trade submission page (Server Component)

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Nav } from "@/components/ui/Nav";
import { TradeFormWrapper } from "./TradeFormWrapper";

export const metadata = {
  title: "Place an Order — Vesti",
};

export interface HoldingRow {
  ticker: string;
  shares: number;
}

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  const { ticker: initialTicker } = await searchParams;

  // Fetch cash balance
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("cash_balance")
    .eq("user_id", user.id)
    .single();

  // Fetch current holdings (for sell validation display)
  const { data: holdingsData } = await supabase
    .from("holdings")
    .select("ticker, shares")
    .eq("user_id", user.id)
    .order("ticker");

  const cashBalance: number = portfolio?.cash_balance ?? 0;
  const holdings: HoldingRow[] = holdingsData ?? [];

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-bold text-black mb-1">Place an Order</h1>
        <p className="text-sm text-gray-500 mb-8">
          Orders execute at market close on the next trading day at or after
          your submission time.
        </p>
        <TradeFormWrapper
          cashBalance={cashBalance}
          holdings={holdings}
          initialTicker={initialTicker}
        />
      </div>
    </div>
  );
}
