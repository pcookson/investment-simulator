// app/holdings/page.tsx — Dedicated Holdings Page (Server Component)
//
// Data flow:
//   1. Auth check
//   2. Parallel Supabase queries: portfolio + holdings + all executed trades
//   3. Parallel price fetches for each holding ticker + SPY (Promise.allSettled)
//      — individual failures fall back to average_cost_basis; page never breaks
//   4. Compute enriched holding rows, realized gains, and allocation slices
//   5. Pass pre-computed data to AllocationChart (client component)

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getClosingPrice } from "@/lib/market";
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  calcGainLossDollar,
  calcGainLossPercent,
} from "@/lib/calculations";
import { Nav } from "@/components/ui/Nav";
import {
  AllocationChart,
  type AllocationSlice,
} from "@/components/charts/AllocationChart";

export const metadata = {
  title: "Holdings — Vesti",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawHolding {
  ticker: string;
  shares: number;
  average_cost_basis: number;
}

interface ExecutedTrade {
  id: string;
  ticker: string;
  trade_type: "buy" | "sell";
  shares: number;
  executed_price: number;
  executed_at: string;
}

interface HoldingWithPrice {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  unrealizedDollar: number;
  unrealizedPercent: number;
  priceFresh: boolean;
}

interface RealizedGainRow {
  id: string;
  ticker: string;
  soldAt: string;
  shares: number;
  salePrice: number;
  estimatedCostBasis: number;
  realizedGain: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatShares(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function glColor(val: number): string {
  return val > 0
    ? "text-emerald-600"
    : val < 0
      ? "text-red-600"
      : "text-gray-400";
}

/**
 * Reconstruct weighted-average cost basis for each executed sell
 * from all prior buys of the same ticker — average cost method.
 * Best-effort for V1.
 */
function computeRealizedGains(trades: ExecutedTrade[]): RealizedGainRow[] {
  const sells = trades.filter((t) => t.trade_type === "sell");
  return sells
    .map((sell) => {
      const priorBuys = trades.filter(
        (t) =>
          t.trade_type === "buy" &&
          t.ticker === sell.ticker &&
          t.executed_at <= sell.executed_at
      );
      const totalShares = priorBuys.reduce((s, b) => s + b.shares, 0);
      const totalCost = priorBuys.reduce(
        (s, b) => s + b.shares * b.executed_price,
        0
      );
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
      return {
        id: sell.id,
        ticker: sell.ticker,
        soldAt: sell.executed_at,
        shares: sell.shares,
        salePrice: sell.executed_price,
        estimatedCostBasis: avgCost,
        realizedGain: (sell.executed_price - avgCost) * sell.shares,
      };
    })
    .reverse(); // most recent first
}

// ---------------------------------------------------------------------------
// MetricCard
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
        className={`text-xl font-bold tabular-nums ${colorClass ?? "text-gray-900"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HoldingsPage
// ---------------------------------------------------------------------------

export default async function HoldingsPage() {
  const supabase = await createServerSupabaseClient();

  // ── Auth ─────────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  // ── Parallel Supabase queries ─────────────────────────────────────────────
  const [portfolioResult, holdingsResult, tradesResult] = await Promise.all([
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
      .from("trades")
      .select("id, ticker, trade_type, shares, executed_price, executed_at")
      .eq("user_id", user.id)
      .eq("status", "executed")
      .order("executed_at", { ascending: true }),
  ]);

  const cashBalance: number = portfolioResult.data?.cash_balance ?? 0;
  const sp500Baseline: number = portfolioResult.data?.sp500_baseline_price ?? 1;
  const rawHoldings: RawHolding[] = holdingsResult.data ?? [];
  const executedTrades: ExecutedTrade[] =
    (tradesResult.data ?? []) as ExecutedTrade[];

  // ── Parallel price fetches ────────────────────────────────────────────────
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

  // ── Enriched holdings ─────────────────────────────────────────────────────
  const spyPrice = prices.get("SPY");
  const sp500Benchmark =
    spyPrice !== undefined ? 100_000 * (spyPrice / sp500Baseline) : null;

  const holdingsWithPrices: HoldingWithPrice[] = rawHoldings
    .map((h) => {
      const freshPrice = prices.get(h.ticker);
      const currentPrice = freshPrice ?? h.average_cost_basis;
      return {
        ticker: h.ticker,
        shares: h.shares,
        avgCost: h.average_cost_basis,
        currentPrice,
        currentValue: h.shares * currentPrice,
        unrealizedDollar: calcGainLossDollar(
          currentPrice,
          h.average_cost_basis,
          h.shares
        ),
        unrealizedPercent: calcGainLossPercent(currentPrice, h.average_cost_basis),
        priceFresh: freshPrice !== undefined,
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  const totalHoldingsValue = holdingsWithPrices.reduce(
    (s, h) => s + h.currentValue,
    0
  );
  const totalPortfolioValue = cashBalance + totalHoldingsValue;
  const totalInvested = holdingsWithPrices.reduce(
    (s, h) => s + h.shares * h.avgCost,
    0
  );
  const totalUnrealizedDollar = holdingsWithPrices.reduce(
    (s, h) => s + h.unrealizedDollar,
    0
  );
  const totalUnrealizedPercent =
    totalInvested > 0 ? (totalUnrealizedDollar / totalInvested) * 100 : 0;

  // ── Allocation slices ─────────────────────────────────────────────────────
  const allocationSlices: AllocationSlice[] = [
    ...holdingsWithPrices.map((h) => ({
      ticker: h.ticker,
      value: h.currentValue,
      percentage:
        totalPortfolioValue > 0
          ? (h.currentValue / totalPortfolioValue) * 100
          : 0,
      isCash: false,
    })),
    {
      ticker: "Cash",
      value: cashBalance,
      percentage:
        totalPortfolioValue > 0 ? (cashBalance / totalPortfolioValue) * 100 : 100,
      isCash: true,
    },
  ];

  // ── Realized gains ────────────────────────────────────────────────────────
  const realizedGains = computeRealizedGains(executedTrades);
  const totalRealizedGain = realizedGains.reduce(
    (s, r) => s + r.realizedGain,
    0
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (rawHoldings.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Holdings</h1>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <MetricCard
              label="Available Cash"
              value={formatCurrency(cashBalance)}
              sub="100% in cash"
            />
            {sp500Benchmark !== null && (
              <MetricCard
                label="S&P Benchmark"
                value={formatCurrency(sp500Benchmark)}
                sub="Your $100k in SPY"
              />
            )}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-lg font-semibold text-gray-900">
              You have no open positions yet.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Your{" "}
              <span className="font-medium text-gray-700">
                {formatCurrency(cashBalance)}
              </span>{" "}
              is sitting in cash.
            </p>
            <Link
              href="/trade"
              className="mt-6 inline-block rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Make your first investment
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Full render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Holdings</h1>
          <p className="mt-1 text-sm text-gray-400">
            Current positions and performance
          </p>
        </div>

        {/* ── Summary bar ─────────────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          <MetricCard
            label="Total Portfolio"
            value={formatCurrency(totalPortfolioValue)}
          />
          <MetricCard
            label="Holdings Value"
            value={formatCurrency(totalHoldingsValue)}
          />
          <MetricCard
            label="Available Cash"
            value={formatCurrency(cashBalance)}
          />
          <MetricCard
            label="Total Invested"
            value={formatCurrency(totalInvested)}
            sub="at avg cost basis"
          />
          <MetricCard
            label="Unrealized G/L"
            value={formatSignedCurrency(totalUnrealizedDollar)}
            sub={formatSignedPercent(totalUnrealizedPercent)}
            colorClass={glColor(totalUnrealizedDollar)}
          />
          {sp500Benchmark !== null && (
            <MetricCard
              label="S&P Benchmark"
              value={formatCurrency(sp500Benchmark)}
              sub="Your $100k in SPY"
            />
          )}
        </div>

        {/* ── Allocation chart ─────────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-700">
                Portfolio Allocation
              </h2>
            </div>
            <div className="px-6 py-6">
              <AllocationChart slices={allocationSlices} />
            </div>
          </div>
        </section>

        {/* ── Positions table ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-700">Positions</h2>
            </div>
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
                      Price
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                      Value
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                      Gain / Loss
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                      %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                      Weight
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                      Trade
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {holdingsWithPrices.map((h) => {
                    const weight =
                      totalPortfolioValue > 0
                        ? (h.currentValue / totalPortfolioValue) * 100
                        : 0;
                    return (
                      <tr
                        key={h.ticker}
                        className="transition-colors hover:bg-gray-50"
                      >
                        {/* Ticker */}
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
                        {/* Shares */}
                        <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                          {formatShares(h.shares)}
                        </td>
                        {/* Avg Cost */}
                        <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                          {formatCurrency(h.avgCost)}
                        </td>
                        {/* Current Price */}
                        <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                          {formatCurrency(h.currentPrice)}
                        </td>
                        {/* Current Value */}
                        <td className="px-4 py-4 text-right tabular-nums font-medium text-gray-900">
                          {formatCurrency(h.currentValue)}
                        </td>
                        {/* Unrealized G/L $ */}
                        <td
                          className={`px-4 py-4 text-right tabular-nums font-medium ${glColor(h.unrealizedDollar)}`}
                        >
                          {formatSignedCurrency(h.unrealizedDollar)}
                        </td>
                        {/* Unrealized G/L % */}
                        <td
                          className={`px-4 py-4 text-right tabular-nums font-medium ${glColor(h.unrealizedPercent)}`}
                        >
                          {formatSignedPercent(h.unrealizedPercent)}
                        </td>
                        {/* Portfolio Weight */}
                        <td className="px-4 py-4 text-right tabular-nums text-gray-500">
                          {weight.toFixed(1)}%
                        </td>
                        {/* Quick trade actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`/trade?ticker=${h.ticker}`}
                              className="text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-800"
                            >
                              Buy
                            </Link>
                            <Link
                              href={`/trade?ticker=${h.ticker}`}
                              className="text-xs font-medium text-red-500 transition-colors hover:text-red-700"
                            >
                              Sell
                            </Link>
                          </div>
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
                      Total positions
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatCurrency(totalHoldingsValue)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${glColor(totalUnrealizedDollar)}`}
                    >
                      {formatSignedCurrency(totalUnrealizedDollar)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${glColor(totalUnrealizedPercent)}`}
                    >
                      {formatSignedPercent(totalUnrealizedPercent)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        {/* ── Realized gains ───────────────────────────────────────────────── */}
        <section>
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  Realized Gains
                </h2>
                {realizedGains.length > 0 && (
                  <span
                    className={`text-sm font-semibold tabular-nums ${glColor(totalRealizedGain)}`}
                  >
                    {formatSignedCurrency(totalRealizedGain)} total
                  </span>
                )}
              </div>
            </div>

            {realizedGains.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-gray-400">
                  No realized gains yet — you haven&apos;t sold any positions.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                          Ticker
                        </th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                          Date Sold
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                          Shares
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                          Sale Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                          Est. Cost Basis
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                          Realized G/L
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {realizedGains.map((r) => (
                        <tr
                          key={r.id}
                          className="transition-colors hover:bg-gray-50"
                        >
                          <td className="px-6 py-4">
                            <Link
                              href={`/trade?ticker=${r.ticker}`}
                              className="font-mono font-semibold text-black hover:underline"
                            >
                              {r.ticker}
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-gray-600">
                            {formatDate(r.soldAt)}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                            {formatShares(r.shares)}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                            {formatCurrency(r.salePrice)}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                            {r.estimatedCostBasis > 0 ? (
                              formatCurrency(r.estimatedCostBasis)
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td
                            className={`px-6 py-4 text-right tabular-nums font-medium ${glColor(r.realizedGain)}`}
                          >
                            {formatSignedCurrency(r.realizedGain)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td
                          colSpan={5}
                          className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400"
                        >
                          Total realized
                        </td>
                        <td
                          className={`px-6 py-3 text-right tabular-nums font-semibold ${glColor(totalRealizedGain)}`}
                        >
                          {formatSignedCurrency(totalRealizedGain)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="border-t border-gray-100 px-6 py-3">
                  <p className="text-xs text-gray-400">
                    * Cost basis is a best-effort estimate reconstructed from
                    your trade history using the average cost method. Figures
                    are approximate.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
