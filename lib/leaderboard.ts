// lib/leaderboard.ts — Server-only leaderboard data fetching
//
// ⚠️  IMPORTANT: This file uses the Supabase SERVICE ROLE CLIENT.
// ⚠️  The service role key bypasses Row Level Security entirely.
// ⚠️  NEVER import this file from a client component ("use client").
// ⚠️  NEVER import this file from any shared utility that could be bundled
//     for the browser. Only import from Server Components or Route Handlers.
//
// Why the service role is required here:
//   The leaderboard must read daily_snapshots rows across ALL users, not just
//   the currently authenticated user. Our RLS policies intentionally restrict
//   the anon and authenticated clients to each user's own rows. The only
//   correct way to perform this cross-user query server-side is with the
//   service role client, which has full unrestricted database access.
// ---------------------------------------------------------------------------

import { createServiceClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  joinedAt: string; // ISO timestamp string from Supabase Auth
  portfolioValue: number;
  sp500Value: number;
  score: number; // portfolioValue - sp500Value
  rank: number; // 1-indexed, sorted by score descending
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch the leaderboard data for all users.
 *
 * Returns an array of LeaderboardEntry sorted by score descending.
 * Only users who have at least one daily_snapshot row are included —
 * users with no snapshot data are excluded entirely.
 *
 * Must only be called from Server Components or Route Handlers.
 */
export async function getLeaderboardData(): Promise<LeaderboardEntry[]> {
  const service = createServiceClient();

  // ── 1. Fetch all auth users (display_name lives in user_metadata) ─────────
  // listUsers returns up to 1000 users per page — sufficient for this project.
  const { data: authData, error: usersError } =
    await service.auth.admin.listUsers({ perPage: 1000 });

  if (usersError) {
    throw new Error(`Failed to fetch users: ${usersError.message}`);
  }

  const users = authData?.users ?? [];
  if (users.length === 0) return [];

  // Build a lookup: userId → { displayName, joinedAt }
  const userMeta = new Map<string, { displayName: string; joinedAt: string }>();
  for (const u of users) {
    const displayName =
      (u.user_metadata?.display_name as string | undefined) ??
      u.email ??
      "Unknown";
    userMeta.set(u.id, { displayName, joinedAt: u.created_at });
  }

  // ── 2. Fetch all snapshots ordered by date descending ────────────────────
  // We iterate once and keep only the first (most recent) entry per user_id.
  // For a larger app this should be replaced with a DISTINCT ON SQL view or RPC.
  const { data: snapshots, error: snapshotsError } = await service
    .from("daily_snapshots")
    .select("user_id, date, portfolio_value, sp500_value")
    .order("date", { ascending: false });

  if (snapshotsError) {
    throw new Error(`Failed to fetch snapshots: ${snapshotsError.message}`);
  }

  // ── 3. Deduplicate: keep most recent snapshot per user ───────────────────
  const latestByUser = new Map<
    string,
    { date: string; portfolio_value: number; sp500_value: number }
  >();
  for (const snap of snapshots ?? []) {
    if (!latestByUser.has(snap.user_id)) {
      latestByUser.set(snap.user_id, snap);
    }
  }

  // ── 4. Join snapshots with user metadata ─────────────────────────────────
  const entries: Omit<LeaderboardEntry, "rank">[] = [];
  for (const [userId, snap] of latestByUser) {
    const meta = userMeta.get(userId);
    if (!meta) continue; // snapshot for a deleted user — skip

    entries.push({
      userId,
      displayName: meta.displayName,
      joinedAt: meta.joinedAt,
      portfolioValue: snap.portfolio_value,
      sp500Value: snap.sp500_value,
      score: snap.portfolio_value - snap.sp500_value,
    });
  }

  // ── 5. Sort by score descending, add rank ────────────────────────────────
  entries.sort((a, b) => b.score - a.score);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}
