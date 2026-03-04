// app/history/page.tsx — Trade History (Server Component)
//
// Fetches all executed and cancelled trades for the current user,
// computes aggregate summary stats, then hands the full list to
// TradeHistoryTable for client-side filtering, sorting, and pagination.

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Nav } from "@/components/ui/Nav";
import { formatCurrency, formatSignedCurrency } from "@/lib/calculations";
import { TradeHistoryTable } from "./TradeHistoryTable";

export const metadata = {
  title: "Trade History — Vesti",
};

// ---------------------------------------------------------------------------
// Shared type — also imported by TradeHistoryTable
// ---------------------------------------------------------------------------

export interface HistoryTrade {
  id: string;
  ticker: string;
  trade_type: "buy" | "sell";
  shares: number;
  executed_price: number | null;
  status: "executed" | "cancelled";
  submitted_at: string; // ISO string
  executed_at: string | null; // ISO string
  cancellation_reason: string | null;
}

// ---------------------------------------------------------------------------
// Summary card — server-rendered metric above the table
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p
        className={`text-xl font-bold tabular-nums ${colorClass ?? "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  const { data } = await supabase
    .from("trades")
    .select(
      "id, ticker, trade_type, shares, executed_price, status, submitted_at, executed_at, cancellation_reason"
    )
    .eq("user_id", user.id)
    .in("status", ["executed", "cancelled"])
    .order("submitted_at", { ascending: false });

  const trades: HistoryTrade[] = data ?? [];

  // Summary stats — computed server-side over the full unfiltered dataset
  const executedTrades = trades.filter((t) => t.status === "executed");
  const totalExecuted = executedTrades.length;

  const totalBuyValue = executedTrades
    .filter((t) => t.trade_type === "buy")
    .reduce((sum, t) => sum + t.shares * (t.executed_price ?? 0), 0);

  const totalSellValue = executedTrades
    .filter((t) => t.trade_type === "sell")
    .reduce((sum, t) => sum + t.shares * (t.executed_price ?? 0), 0);

  const netCashFlow = totalSellValue - totalBuyValue;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Trade History</h1>
          <p className="mt-1 text-sm text-gray-400">
            All executed and cancelled orders
          </p>
        </div>

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Trades Executed"
            value={totalExecuted.toLocaleString()}
          />
          <SummaryCard
            label="Total Bought"
            value={formatCurrency(totalBuyValue)}
          />
          <SummaryCard
            label="Total Sold"
            value={formatCurrency(totalSellValue)}
          />
          <SummaryCard
            label="Net Cash Flow"
            value={formatSignedCurrency(netCashFlow)}
            colorClass={
              netCashFlow > 0
                ? "text-emerald-600"
                : netCashFlow < 0
                  ? "text-red-600"
                  : "text-gray-900"
            }
          />
        </div>

        {/* ── Trade history table (client component) ────────────────────────── */}
        <TradeHistoryTable trades={trades} />
      </main>
    </div>
  );
}
