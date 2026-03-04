// app/leaderboard/page.tsx — Leaderboard (Server Component)
//
// Cross-user data is fetched via the service role client through
// lib/leaderboard.ts — see that file for the security rationale.
// The current user's auth session is read with the standard server
// client only to identify which row to highlight.

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getLeaderboardData } from "@/lib/leaderboard";
import { Nav } from "@/components/ui/Nav";
import {
  formatCurrency,
  formatSignedCurrency,
} from "@/lib/calculations";
import type { LeaderboardEntry } from "@/lib/leaderboard";

export const metadata = {
  title: "Leaderboard — Vesti",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// ---------------------------------------------------------------------------
// Podium — top 3 visually distinct section
// ---------------------------------------------------------------------------

function PodiumCard({
  entry,
  size,
  medalColor,
  medalText,
  blockHeight,
  blockColor,
  blockLabel,
}: {
  entry: LeaderboardEntry;
  size: "lg" | "md";
  medalColor: string;
  medalText: string;
  blockHeight: string;
  blockColor: string;
  blockLabel: string;
}) {
  const scorePositive = entry.score >= 0;
  return (
    <div className="flex flex-col items-center">
      {/* Player card (above the block) */}
      <div className="mb-3 flex flex-col items-center text-center">
        {/* Medal circle */}
        <div
          className={`mb-2 flex items-center justify-center rounded-full font-bold ${medalColor} ${
            size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
          }`}
        >
          {medalText}
        </div>
        {/* Name */}
        <p
          className={`font-bold text-white ${
            size === "lg"
              ? "max-w-[140px] text-base"
              : "max-w-[110px] text-sm"
          } truncate`}
        >
          {entry.displayName}
        </p>
        {/* Score */}
        <p
          className={`mt-0.5 font-semibold tabular-nums ${
            size === "lg" ? "text-sm" : "text-xs"
          } ${scorePositive ? "text-emerald-400" : "text-red-400"}`}
        >
          {formatSignedCurrency(entry.score)}
        </p>
        {/* Portfolio value */}
        <p
          className={`text-gray-400 tabular-nums ${
            size === "lg" ? "text-xs" : "text-xs"
          }`}
        >
          {formatCurrency(entry.portfolioValue)}
        </p>
      </div>

      {/* Podium block */}
      <div
        className={`flex ${blockHeight} w-full items-center justify-center rounded-t-md ${blockColor}`}
      >
        <span className="text-xs font-bold opacity-80">{blockLabel}</span>
      </div>
    </div>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const [first, second, third] = entries;

  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-gray-900 to-gray-800">
      <div className="px-6 pt-6">
        <p className="mb-8 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Top Performers
        </p>

        {/* Podium: 2nd — 1st — 3rd (order matters for the visual) */}
        <div className="flex items-end justify-center gap-3">
          {/* 2nd place */}
          {second ? (
            <div className="flex-1 max-w-[130px]">
              <PodiumCard
                entry={second}
                size="md"
                medalColor="bg-gray-400 text-gray-800"
                medalText="2"
                blockHeight="h-16"
                blockColor="bg-gray-400"
                blockLabel="2nd"
              />
            </div>
          ) : (
            <div className="flex-1 max-w-[130px]" />
          )}

          {/* 1st place — center, tallest */}
          <div className="flex-1 max-w-[160px]">
            <PodiumCard
              entry={first}
              size="lg"
              medalColor="bg-yellow-400 text-yellow-900"
              medalText="1"
              blockHeight="h-24"
              blockColor="bg-yellow-400"
              blockLabel="1st"
            />
          </div>

          {/* 3rd place */}
          {third ? (
            <div className="flex-1 max-w-[130px]">
              <PodiumCard
                entry={third}
                size="md"
                medalColor="bg-amber-700 text-amber-100"
                medalText="3"
                blockHeight="h-10"
                blockColor="bg-amber-700"
                blockLabel="3rd"
              />
            </div>
          ) : (
            <div className="flex-1 max-w-[130px]" />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({
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
      <p className={`text-xl font-bold tabular-nums ${colorClass ?? "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rank badge
// ---------------------------------------------------------------------------

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-yellow-900">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-700">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-700 text-xs font-bold text-amber-100">
        3
      </span>
    );
  }
  return (
    <span className="text-sm tabular-nums text-gray-400">
      {ordinalSuffix(rank)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LeaderboardPage
// ---------------------------------------------------------------------------

export default async function LeaderboardPage() {
  // Current user — anon client, for row highlighting only
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/signin");

  // All leaderboard data via service role (bypasses RLS)
  const entries = await getLeaderboardData();

  // ── Empty / single-user state ────────────────────────────────────────────
  if (entries.length <= 1) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-lg font-semibold text-gray-900">
              No competition yet.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Share Vesti with friends to start competing.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  const totalPlayers = entries.length;
  const beatingCount = entries.filter((e) => e.score > 0).length;
  const beatingPct = Math.round((beatingCount / totalPlayers) * 100);
  const avgScore = entries.reduce((sum, e) => sum + e.score, 0) / totalPlayers;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
          <p className="mt-1 text-sm text-gray-400">
            Ranked by score vs S&amp;P 500
          </p>
        </div>

        {/* ── Podium — top 3 ──────────────────────────────────────────────── */}
        <Podium entries={entries} />

        {/* ── Summary stats ───────────────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <StatCard
            label="Total Players"
            value={totalPlayers.toLocaleString()}
          />
          <StatCard
            label="Beating the S&P"
            value={`${beatingPct}%`}
            colorClass={beatingPct >= 50 ? "text-emerald-600" : "text-gray-900"}
          />
          <StatCard
            label="Avg Score"
            value={formatSignedCurrency(avgScore)}
            colorClass={
              avgScore > 0
                ? "text-emerald-600"
                : avgScore < 0
                  ? "text-red-600"
                  : "text-gray-900"
            }
          />
        </div>

        {/* ── Rankings table ───────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Player
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                    Portfolio
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                    S&amp;P Benchmark
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                    Score
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-400">
                    Since
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {entries.map((entry) => {
                  const isCurrentUser = entry.userId === user.id;
                  const scorePositive = entry.score > 0;
                  const scoreNegative = entry.score < 0;

                  return (
                    <tr
                      key={entry.userId}
                      className={`transition-colors ${
                        isCurrentUser
                          ? "bg-indigo-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-6 py-4">
                        <RankBadge rank={entry.rank} />
                      </td>

                      {/* Player */}
                      <td className="px-4 py-4">
                        <span className="font-medium text-gray-900">
                          {entry.displayName}
                        </span>
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-indigo-400 font-medium">
                            you
                          </span>
                        )}
                      </td>

                      {/* Portfolio Value */}
                      <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                        {formatCurrency(entry.portfolioValue)}
                      </td>

                      {/* S&P Benchmark */}
                      <td className="px-4 py-4 text-right tabular-nums text-gray-700">
                        {formatCurrency(entry.sp500Value)}
                      </td>

                      {/* Score */}
                      <td
                        className={`px-4 py-4 text-right tabular-nums font-semibold ${
                          scorePositive
                            ? "text-emerald-600"
                            : scoreNegative
                              ? "text-red-600"
                              : "text-gray-400"
                        }`}
                      >
                        {formatSignedCurrency(entry.score)}
                      </td>

                      {/* Since (join date) */}
                      <td className="px-6 py-4 text-right tabular-nums text-gray-400">
                        {formatJoinDate(entry.joinedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
