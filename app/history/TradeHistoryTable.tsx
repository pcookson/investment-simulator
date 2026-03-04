"use client";

// TradeHistoryTable — client component for the trade history page.
// Handles client-side filtering by type/status/ticker, sorting by
// clicking column headers, and "load more" pagination (50 rows at a time).

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/calculations";
import type { HistoryTrade } from "./page";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

type SortKey = "date" | "ticker" | "totalValue";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The canonical date for a trade (executed_at for executed, submitted_at for cancelled). */
function tradeDate(t: HistoryTrade): string {
  return (t.status === "executed" ? t.executed_at : null) ?? t.submitted_at;
}

function formatTableDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatShares(shares: number): string {
  return shares.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function tradeTotal(t: HistoryTrade): number | null {
  if (t.executed_price === null) return null;
  return t.shares * t.executed_price;
}

// ---------------------------------------------------------------------------
// SortableHeader — th with a clickable sort button
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={`py-3 text-xs font-medium uppercase tracking-wide ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} transition-colors ${
          active ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        {label}
        <span className={active ? "text-gray-500" : "text-gray-300"}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// FilterBar helper — segmented control
// ---------------------------------------------------------------------------

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 transition-colors ${
            value === opt.value
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TradeHistoryTable
// ---------------------------------------------------------------------------

export function TradeHistoryTable({ trades }: { trades: HistoryTrade[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "buy" | "sell">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "executed" | "cancelled"
  >("all");
  const [tickerFilter, setTickerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setVisibleCount(PAGE_SIZE);
  }

  function handleTypeChange(val: "all" | "buy" | "sell") {
    setTypeFilter(val);
    setVisibleCount(PAGE_SIZE);
  }

  function handleStatusChange(val: "all" | "executed" | "cancelled") {
    setStatusFilter(val);
    setVisibleCount(PAGE_SIZE);
  }

  function handleTickerChange(val: string) {
    setTickerFilter(val);
    setVisibleCount(PAGE_SIZE);
  }

  const filtered = useMemo(() => {
    let result = trades;

    if (typeFilter !== "all") {
      result = result.filter((t) => t.trade_type === typeFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (tickerFilter.trim()) {
      const q = tickerFilter.trim().toUpperCase();
      result = result.filter((t) => t.ticker.includes(q));
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = tradeDate(a).localeCompare(tradeDate(b));
      } else if (sortKey === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else {
        const av = tradeTotal(a) ?? -Infinity;
        const bv = tradeTotal(b) ?? -Infinity;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [trades, typeFilter, statusFilter, tickerFilter, sortKey, sortDir]);

  const shown = filtered.slice(0, visibleCount);
  const remaining = filtered.length - shown.length;

  // ── Empty state (no trades at all) ──────────────────────────────────────

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
        <p className="text-gray-500">No trade history yet.</p>
        <p className="mt-1 text-sm text-gray-400">
          Head to the{" "}
          <Link
            href="/trade"
            className="font-medium text-black underline underline-offset-2"
          >
            trade page
          </Link>{" "}
          to place your first order.
        </p>
      </div>
    );
  }

  // ── Filters + table ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by ticker…"
          value={tickerFilter}
          onChange={(e) => handleTickerChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans focus:border-black focus:outline-none"
        />

        <SegmentedControl
          options={[
            { value: "all", label: "All types" },
            { value: "buy", label: "Buy" },
            { value: "sell", label: "Sell" },
          ]}
          value={typeFilter}
          onChange={handleTypeChange}
        />

        <SegmentedControl
          options={[
            { value: "all", label: "All statuses" },
            { value: "executed", label: "Executed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          value={statusFilter}
          onChange={handleStatusChange}
        />

        {filtered.length !== trades.length && (
          <span className="text-sm text-gray-400">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* No-results state (filters returned nothing) */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No trades match your filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <SortableHeader
                    label="Date"
                    sortKey="date"
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="px-6"
                  />
                  <SortableHeader
                    label="Ticker"
                    sortKey="ticker"
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="px-4"
                  />
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                    Shares
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                    Exec. Price
                  </th>
                  <SortableHeader
                    label="Total Value"
                    sortKey="totalValue"
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                    className="px-4"
                  />
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Notes
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {shown.map((trade) => {
                  const total = tradeTotal(trade);
                  return (
                    <tr
                      key={trade.id}
                      className="transition-colors hover:bg-gray-50"
                    >
                      {/* Date */}
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {formatTableDate(tradeDate(trade))}
                      </td>

                      {/* Ticker */}
                      <td className="px-4 py-4">
                        <Link
                          href={`/trade?ticker=${trade.ticker}`}
                          className="font-mono font-semibold text-black hover:underline"
                        >
                          {trade.ticker}
                        </Link>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                            trade.trade_type === "buy"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {trade.trade_type}
                        </span>
                      </td>

                      {/* Shares */}
                      <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                        {formatShares(trade.shares)}
                      </td>

                      {/* Executed Price */}
                      <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                        {trade.executed_price !== null
                          ? formatCurrency(trade.executed_price)
                          : <span className="text-gray-400">—</span>}
                      </td>

                      {/* Total Value */}
                      <td className="px-4 py-4 text-right tabular-nums font-medium text-gray-900">
                        {total !== null
                          ? formatCurrency(total)
                          : <span className="text-gray-400">—</span>}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                            trade.status === "executed"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {trade.status === "executed" ? "Executed" : "Cancelled"}
                        </span>
                      </td>

                      {/* Cancellation reason */}
                      <td className="px-6 py-4">
                        {trade.status === "cancelled" &&
                        trade.cancellation_reason ? (
                          <span className="text-xs text-gray-400">
                            {trade.cancellation_reason}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {remaining > 0 && (
            <div className="border-t border-gray-100 px-6 py-4 text-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
              >
                Load {Math.min(remaining, PAGE_SIZE)} more{" "}
                <span className="text-gray-400">
                  ({remaining} remaining)
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
