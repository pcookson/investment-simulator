"use client";

// PerformanceChart — dual-line chart of portfolio vs S&P 500 benchmark.
// Recharts requires a client component; the dashboard page passes snapshot
// data down as props so this component has no data-fetching concerns.

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  formatCurrency,
  formatChartDate,
  formatSignedCurrency,
} from "@/lib/calculations";

export interface SnapshotPoint {
  date: string;
  portfolio_value: number;
  sp500_value: number;
}

interface PerformanceChartProps {
  snapshots: SnapshotPoint[];
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length < 2) return null;

  const portfolioVal = payload[0]?.value ?? 0;
  const sp500Val = payload[1]?.value ?? 0;
  const score = portfolioVal - sp500Val;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-sm">
      <p className="mb-2 font-semibold text-gray-900">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-900" />
            Portfolio
          </span>
          <span className="font-medium tabular-nums text-gray-900">
            {formatCurrency(portfolioVal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "#00e676" }}
            />
            S&P 500
          </span>
          <span className="font-medium tabular-nums text-gray-900">
            {formatCurrency(sp500Val)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
          <span className="text-gray-500">vs S&P 500</span>
          <span
            className={`font-semibold tabular-nums ${
              score > 0
                ? "text-emerald-600"
                : score < 0
                  ? "text-red-600"
                  : "text-gray-500"
            }`}
          >
            {formatSignedCurrency(score)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Y-axis tick formatter
// ---------------------------------------------------------------------------

function formatYAxisTick(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Legend label formatter
// ---------------------------------------------------------------------------

function formatLegendLabel(value: string): string {
  return value === "portfolio" ? "Your Portfolio" : "S&P 500 Benchmark";
}

// ---------------------------------------------------------------------------
// PerformanceChart
// ---------------------------------------------------------------------------

export function PerformanceChart({ snapshots }: PerformanceChartProps) {
  const chartData = snapshots.map((s) => ({
    date: formatChartDate(s.date),
    portfolio: s.portfolio_value,
    sp500: s.sp500_value,
  }));

  // Thin out x-axis labels gracefully for dense data
  const count = chartData.length;
  const xAxisInterval =
    count <= 10 ? 0 : count <= 30 ? 2 : count <= 90 ? 6 : 13;

  // Y-axis domain with padding so lines don't hug the edges
  const allValues = snapshots.flatMap((s) => [
    s.portfolio_value,
    s.sp500_value,
  ]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal;
  const padding = range * 0.12 || 2000; // at least $2 000 padding when flat
  const yMin = Math.max(0, minVal - padding);
  const yMax = maxVal + padding;

  const isSinglePoint = snapshots.length <= 1;

  return (
    <div className="relative">
      {/* Single-point notice */}
      {isSinglePoint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center">
          <p className="rounded-md bg-white/90 px-4 py-2 text-sm text-gray-400 shadow-sm ring-1 ring-gray-200">
            Your performance chart will populate after your first full trading
            day.
          </p>
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f3f4f6"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval={xAxisInterval}
            dy={6}
          />
          <YAxis
            tickFormatter={formatYAxisTick}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            domain={[yMin, yMax]}
            width={64}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: "12px", paddingBottom: "12px" }}
            formatter={formatLegendLabel}
          />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke="#111111"
            strokeWidth={2}
            dot={isSinglePoint ? { r: 4, fill: "#111111", strokeWidth: 0 } : false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="sp500"
            stroke="#00e676"
            strokeWidth={2}
            dot={isSinglePoint ? { r: 4, fill: "#00e676", strokeWidth: 0 } : false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
