// lib/calculations.ts — Shared financial formatting and calculation utilities
// Used across the dashboard, holdings table, and leaderboard.

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

/** Format a number as USD. Example: 102345.67 → "$102,345.67" */
export function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number as signed USD (+ prefix for positive).
 * Example: 1234.56 → "+$1,234.56" | -500.00 → "-$500.00"
 */
export function formatSignedCurrency(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrency(value)}`;
}

/**
 * Format a percentage with sign and two decimal places.
 * Example: 5.23 → "+5.23%" | -2.10 → "-2.10%"
 */
export function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Format a YYYY-MM-DD string as "MMM DD" (e.g. "Mar 02").
 * Used for chart X-axis labels.
 */
export function formatChartDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

/**
 * Format a YYYY-MM-DD string as "Month D, YYYY" (e.g. "March 2, 2026").
 * Used for the "as of market close" label.
 */
export function formatLongDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Holdings calculations
// ---------------------------------------------------------------------------

/**
 * Gain/Loss $ = (current_price − avg_cost) × shares
 */
export function calcGainLossDollar(
  currentPrice: number,
  avgCost: number,
  shares: number
): number {
  return (currentPrice - avgCost) * shares;
}

/**
 * Gain/Loss % = ((current_price − avg_cost) / avg_cost) × 100
 */
export function calcGainLossPercent(
  currentPrice: number,
  avgCost: number
): number {
  if (avgCost === 0) return 0;
  return ((currentPrice - avgCost) / avgCost) * 100;
}
