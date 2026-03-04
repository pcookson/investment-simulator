"use client";

// AllocationChart — donut chart showing portfolio allocation by position + cash.
// Data is computed server-side and passed as props; this component only renders.

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/calculations";

// ---------------------------------------------------------------------------
// Types (exported so the server page can build the data shape)
// ---------------------------------------------------------------------------

export interface AllocationSlice {
  ticker: string;   // e.g. "AAPL", "Cash"
  value: number;    // dollar value of this slice
  percentage: number; // 0–100
  isCash: boolean;
}

// ---------------------------------------------------------------------------
// Color palette — muted, professional, distinct
// ---------------------------------------------------------------------------

const PALETTE = [
  "#2563eb", // blue-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#db2777", // pink-600
  "#0891b2", // cyan-600
  "#ea580c", // orange-600
  "#4f46e5", // indigo-600
  "#16a34a", // green-600
  "#9333ea", // purple-600
];
const CASH_COLOR = "#d1d5db"; // gray-300

function getColor(index: number, isCash: boolean): string {
  return isCash ? CASH_COLOR : PALETTE[index % PALETTE.length];
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: AllocationSlice;
  }>;
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-mono font-semibold text-gray-900">{entry.name}</p>
      <p className="tabular-nums text-gray-600">{formatCurrency(entry.value)}</p>
      <p className="text-gray-400">{entry.payload.percentage.toFixed(1)}%</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AllocationChart
// ---------------------------------------------------------------------------

export function AllocationChart({ slices }: { slices: AllocationSlice[] }) {
  if (slices.length === 0) return null;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      {/* Donut chart */}
      <div className="flex-shrink-0 self-center">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="ticker"
              innerRadius={55}
              outerRadius={88}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
            >
              {slices.map((slice, i) => (
                <Cell
                  key={slice.ticker}
                  fill={getColor(i, slice.isCash)}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <ul className="flex-1 space-y-2">
        {slices.map((slice, i) => (
          <li key={slice.ticker} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: getColor(i, slice.isCash) }}
            />
            <span
              className={`font-medium ${
                slice.isCash ? "text-gray-500" : "font-mono text-gray-900"
              }`}
            >
              {slice.ticker}
            </span>
            <span className="ml-auto tabular-nums text-gray-500">
              {slice.percentage.toFixed(1)}%
            </span>
            <span className="tabular-nums text-gray-400 text-xs w-24 text-right">
              {formatCurrency(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
