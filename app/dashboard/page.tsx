// app/dashboard/page.tsx — Main dashboard (Server Component)
//
// Data flow:
//   1. Auth check — redirect to sign-in if unauthenticated
//   2. Parallel Supabase queries: portfolio + holdings + snapshots
//   3. Parallel price fetches for each holding ticker + SPY (Promise.allSettled)
//      — individual failures fall back to average_cost_basis; page never breaks
//   4. Compute summary values, sort holdings, pass props to client components

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getClosingPrice } from "@/lib/market";
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  formatLongDate,
  calcGainLossDollar,
  calcGainLossPercent,
} from "@/lib/calculations";
import { Nav } from "@/components/ui/Nav";
import {
  PerformanceChart,
  type SnapshotPoint,
} from "@/components/charts/PerformanceChart";

export const metadata = {
  title: "Dashboard — Vesti",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoldingWithPrice {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  gainLossDollar: number;
  gainLossPercent: number;
  priceFresh: boolean; // false = fell back to avg_cost_basis
}

// ---------------------------------------------------------------------------
// MetricCard — a single summary stat in the header grid
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p
        className={`text-2xl font-bold tabular-nums ${colorClass ?? "text-gray-900"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ?? "Investor";

  // ── Parallel Supabase queries ─────────────────────────────────────────────
  const [portfolioResult, holdingsResult, snapshotsResult] = await Promise.all(
    [
      supabase
        .from("portfolios")
        .select("cash_balance, sp500_baseline_price")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("holdings")
        .select("ticker, shares, average_cost_basis")
        .eq("user_id", user.id),
      supabase
        .from("daily_snapshots")
        .select("date, portfolio_value, sp500_value")
        .eq("user_id", user.id)
        .order("date", { ascending: true }),
    ]
  );

  const cashBalance: number = portfolioResult.data?.cash_balance ?? 0;
  const sp500Baseline: number = portfolioResult.data?.sp500_baseline_price ?? 1;
  const rawHoldings = holdingsResult.data ?? [];
  const snapshots: SnapshotPoint[] = snapshotsResult.data ?? [];
  const latestSnapshot = snapshots.at(-1);

  // ── Parallel price fetches (individual failures are non-fatal) ────────────
  const uniqueTickers = Array.from(
    new Set(["SPY", ...rawHoldings.map((h) => h.ticker)])
  );

  const priceResults = await Promise.allSettled(
    uniqueTickers.map(async (ticker) => ({
      ticker,
      price: await getClosingPrice(ticker),
    }))
  );

  const prices = new Map<string, number>();
  for (const result of priceResults) {
    if (result.status === "fulfilled") {
      prices.set(result.value.ticker, result.value.price);
    }
  }

  // ── Summary calculations ──────────────────────────────────────────────────
  const spyPrice = prices.get("SPY");

  // S&P benchmark — fall back to latest snapshot value if SPY price fetch failed
  const sp500Benchmark =
    spyPrice !== undefined
      ? 100_000 * (spyPrice / sp500Baseline)
      : (latestSnapshot?.sp500_value ?? 100_000);

  // Enrich each holding with current price (fall back to avg_cost if fetch failed)
  const holdingsWithPrices: HoldingWithPrice[] = rawHoldings.map((h) => {
    const freshPrice = prices.get(h.ticker);
    const currentPrice = freshPrice ?? h.average_cost_basis;
    const currentValue = h.shares * currentPrice;
    return {
      ticker: h.ticker,
      shares: h.shares,
      avgCost: h.average_cost_basis,
      currentPrice,
      currentValue,
      gainLossDollar: calcGainLossDollar(currentPrice, h.average_cost_basis, h.shares),
      gainLossPercent: calcGainLossPercent(currentPrice, h.average_cost_basis),
      priceFresh: freshPrice !== undefined,
    };
  });

  // Sort by current value descending (largest positions first)
  holdingsWithPrices.sort((a, b) => b.currentValue - a.currentValue);

  const holdingsValue = holdingsWithPrices.reduce(
    (sum, h) => sum + h.currentValue,
    0
  );
  const totalPortfolioValue = cashBalance + holdingsValue;
  const score = totalPortfolioValue - sp500Benchmark;
  const totalHoldingsValue = holdingsValue;

  // "As of" label — most recent snapshot date, or today if no snapshots yet
  const asOfDate =
    latestSnapshot?.date ?? new Date().toISOString().split("T")[0];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {displayName}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            As of market close {formatLongDate(asOfDate)}
          </p>
        </div>

        {/* ── Summary metric cards ─────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="Portfolio Value"
            value={formatCurrency(totalPortfolioValue)}
          />
          <MetricCard
            label="S&P 500 Benchmark"
            value={formatCurrency(sp500Benchmark)}
            sub="Your $100k in SPY"
          />
          <MetricCard
            label="vs S&P 500"
            value={formatSignedCurrency(score)}
            colorClass={
              score > 0
                ? "text-emerald-600"
                : score < 0
                  ? "text-red-600"
                  : "text-gray-400"
            }
          />
          <MetricCard
            label="Available Cash"
            value={formatCurrency(cashBalance)}
          />
        </div>

        {/* ── Performance chart ────────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-700">
                Performance
              </h2>
            </div>
            <div className="px-2 pb-4 pt-4">
              <PerformanceChart snapshots={snapshots} />
            </div>
          </div>
        </section>

        {/* ── Holdings table ───────────────────────────────────────────────── */}
        <section>
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-700">
                Holdings
              </h2>
            </div>

            {holdingsWithPrices.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-gray-500">You have no open positions.</p>
                <p className="mt-1 text-sm text-gray-400">
                  Head to the{" "}
                  <Link
                    href="/trade"
                    className="font-medium text-black underline underline-offset-2"
                  >
                    trade page
                  </Link>{" "}
                  to make your first investment.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                        Ticker
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                        Shares
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                        Avg Cost
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                        Current Price
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                        Value
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                        Gain / Loss
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {holdingsWithPrices.map((h) => {
                      const glPositive = h.gainLossDollar > 0;
                      const glNegative = h.gainLossDollar < 0;
                      const glColor = glPositive
                        ? "text-emerald-600"
                        : glNegative
                          ? "text-red-600"
                          : "text-gray-500";

                      return (
                        <tr
                          key={h.ticker}
                          className="transition-colors hover:bg-gray-50"
                        >
                          <td className="px-6 py-4">
                            <Link
                              href={`/trade?ticker=${h.ticker}`}
                              className="font-mono font-semibold text-black hover:underline"
                            >
                              {h.ticker}
                            </Link>
                            {!h.priceFresh && (
                              <span
                                title="Live price unavailable — showing avg cost"
                                className="ml-1.5 text-xs text-amber-500"
                              >
                                ~
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                            {h.shares.toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                            {formatCurrency(h.avgCost)}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                            {formatCurrency(h.currentPrice)}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums font-medium text-gray-900">
                            {formatCurrency(h.currentValue)}
                          </td>
                          <td
                            className={`px-4 py-4 text-right tabular-nums font-medium ${glColor}`}
                          >
                            {formatSignedCurrency(h.gainLossDollar)}
                          </td>
                          <td
                            className={`px-6 py-4 text-right tabular-nums font-medium ${glColor}`}
                          >
                            {formatSignedPercent(h.gainLossPercent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td
                        colSpan={4}
                        className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400"
                      >
                        Total holdings
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {formatCurrency(totalHoldingsValue)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
