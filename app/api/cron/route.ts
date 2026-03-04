// =============================================================================
// app/api/cron/route.ts — Daily trade execution and snapshot cron job
// =============================================================================
//
// SECURITY
// --------
// Vercel Cron sends a GET request with:
//   Authorization: Bearer <CRON_SECRET>
//
// NOTE: The spec calls for POST-only, but Vercel Cron actually sends GET.
// We export both handlers so the endpoint works with Vercel Cron (GET),
// manual curl tests (POST), and the browser dev trigger (GET). The
// Authorization header is the real security boundary in both cases.
//
// MANUAL DEV TRIGGER (development only)
// --------------------------------------
// Visit in browser: http://localhost:3000/api/cron?secret=<CRON_SECRET>
// The ?secret= query parameter is accepted ONLY when NODE_ENV=development.
// It is silently ignored in production — only the Bearer header works there.
//
// STORY 5.4 — VERCEL CONFIGURATION
// ---------------------------------
// vercel.json already contains:
//   { "crons": [{ "path": "/api/cron", "schedule": "0 22 * * 1-5" }] }
// "0 22 * * 1-5" = 22:00 UTC on Mon–Fri = 5:00 PM ET (EST) / 6:00 PM ET (EDT)
// This is well after the 4:00 PM ET market close and the 3:30 PM ET cutoff.
//
// VERIFYING A RUN IN THE VERCEL DASHBOARD
// ----------------------------------------
// 1. Go to your project → "Logs" tab → filter by function /api/cron
// 2. A successful run logs:
//      [CRON] ======== Job started at <ISO> ========
//      [CRON] Trading date: YYYY-MM-DD
//      [CRON] Cutoff timestamp: <ISO>
//      [CRON] Found N pending trade(s)
//      [CRON] Fetching prices for N ticker(s): ...
//      [CRON] Successfully fetched N/N prices
//      [CRON] Executed BUY/SELL ... (one line per order)
//      [CRON] Wrote N snapshot(s) for YYYY-MM-DD
//      [CRON] ======== Job completed in NNNms ========
//      [CRON] Summary: { ... }
//    The HTTP response body is { "success": true, "summary": { ... } }
// 3. A failed run logs [CRON] ======== Job FAILED ... and returns
//    { "success": false, "error": "..." } with HTTP 500.
//
// RE-RUNABILITY AND IDEMPOTENCY
// ------------------------------
// - daily_snapshots uses UPSERT (onConflict: "user_id,date"), so re-running
//   on the same day overwrites the snapshot with fresh values — safe.
// - Trade execution is NOT idempotent: orders already set to "executed" are
//   skipped because the query filters status = 'pending'. Running twice on
//   the same day will not re-execute orders — safe.
// - cash_balance and holdings updates are applied per-execution. A partial
//   failure (crash mid-job) could leave one user's portfolio in an
//   intermediate state. Re-running the job will skip the already-executed
//   trades and proceed with any that are still pending — partially safe.
//   Manual investigation may be needed for the affected user.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getClosingPrice, isTradingDay } from "@/lib/market";
import { getTodayET, getCutoffISO } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Types (no `any` — strict mode throughout)
// ---------------------------------------------------------------------------

type ServiceClient = ReturnType<typeof createServiceClient>;

interface PendingTrade {
  id: string;
  user_id: string;
  ticker: string;
  trade_type: "buy" | "sell";
  shares: number;
  submitted_at: string;
}

interface HoldingRecord {
  user_id: string;
  ticker: string;
  shares: number;
  average_cost_basis: number;
}

interface PortfolioRecord {
  user_id: string;
  cash_balance: number;
  sp500_baseline_price: number;
}

interface CronSummary {
  tradingDay: string;
  ordersExecuted: number;
  ordersCancelled: number;
  snapshotsWritten: number;
  pricesFetched: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[CRON] CRON_SECRET environment variable is not set");
    return false;
  }

  // Production path: Authorization: Bearer <secret>
  const bearer = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (bearer === cronSecret) return true;

  // *** DEV ONLY — query parameter fallback for browser testing ***
  // This block MUST NOT execute in production.
  if (process.env.NODE_ENV === "development") {
    const querySecret = request.nextUrl.searchParams.get("secret");
    if (querySecret === cronSecret) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Shared handler (used by both GET and POST exports)
// ---------------------------------------------------------------------------

async function handler(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const today = getTodayET();

  console.log(
    `[CRON] ======== Job started at ${new Date().toISOString()} ========`
  );
  console.log(`[CRON] Trading date: ${today}`);

  // Skip non-trading days (weekends and market holidays)
  if (!isTradingDay(today)) {
    const reason = `${today} is not a trading day — skipping`;
    console.log(`[CRON] ${reason}`);
    return NextResponse.json({ success: true, skipped: true, reason });
  }

  try {
    const summary = await runCronJob(today);
    summary.durationMs = Date.now() - startTime;

    console.log(
      `[CRON] ======== Job completed in ${summary.durationMs}ms ========`
    );
    console.log("[CRON] Summary:", JSON.stringify(summary, null, 2));

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    console.error(
      `[CRON] ======== Job FAILED after ${durationMs}ms ========`
    );
    console.error("[CRON] Error:", message);
    if (stack) console.error("[CRON] Stack:", stack);

    return NextResponse.json(
      { success: false, error: message, durationMs },
      { status: 500 }
    );
  }
}

// Vercel Cron sends GET. We also accept POST for manual curl triggers.
export const GET = handler;
export const POST = handler;

// ---------------------------------------------------------------------------
// Main job orchestrator
// ---------------------------------------------------------------------------

async function runCronJob(today: string): Promise<CronSummary> {
  const service = createServiceClient();
  const cutoffISO = getCutoffISO();

  console.log(`[CRON] Cutoff timestamp: ${cutoffISO}`);

  // -------------------------------------------------------------------------
  // 1. Fetch all pending trades submitted before today's cutoff
  // -------------------------------------------------------------------------
  const { data: pendingData, error: tradesErr } = await service
    .from("trades")
    .select("id, user_id, ticker, trade_type, shares, submitted_at")
    .eq("status", "pending")
    .lt("submitted_at", cutoffISO)
    .order("submitted_at"); // process older orders first

  if (tradesErr) {
    throw new Error(`Failed to fetch pending trades: ${tradesErr.message}`);
  }

  const pendingTrades = (pendingData ?? []) as PendingTrade[];
  console.log(`[CRON] Found ${pendingTrades.length} pending trade(s) to process`);

  // -------------------------------------------------------------------------
  // 2. Collect every ticker that needs a closing price
  //    - SPY unconditionally (needed for all snapshot S&P calculations)
  //    - All pending order tickers
  //    - All current holding tickers (needed for portfolio value snapshots)
  // -------------------------------------------------------------------------
  const tickerSet = new Set<string>(["SPY"]);
  for (const t of pendingTrades) tickerSet.add(t.ticker);

  const { data: holdingsData, error: holdingsErr } = await service
    .from("holdings")
    .select("user_id, ticker, shares, average_cost_basis");

  if (holdingsErr) {
    throw new Error(`Failed to fetch holdings: ${holdingsErr.message}`);
  }

  const allHoldings = (holdingsData ?? []) as HoldingRecord[];
  for (const h of allHoldings) tickerSet.add(h.ticker);

  const allTickers = Array.from(tickerSet);
  console.log(
    `[CRON] Fetching prices for ${allTickers.length} ticker(s): ${allTickers.join(", ")}`
  );

  // -------------------------------------------------------------------------
  // 3. Fetch closing prices for all required tickers
  //    Sequential with a short pause — Alpha Vantage free tier: 5 req/min.
  // -------------------------------------------------------------------------
  const prices = await fetchPrices(allTickers);
  console.log(
    `[CRON] Successfully fetched ${prices.size}/${allTickers.length} price(s)`
  );

  // -------------------------------------------------------------------------
  // 4. Execute pending orders and update portfolio state
  // -------------------------------------------------------------------------
  const { executed, cancelled } = await executeOrders(
    service,
    pendingTrades,
    allHoldings,
    prices
  );

  // -------------------------------------------------------------------------
  // 5. Write daily snapshots — MUST happen after order execution so that
  //    portfolio values reflect post-trade cash balances and holdings.
  // -------------------------------------------------------------------------
  const { written } = await writeSnapshots(service, today, prices);

  return {
    tradingDay: today,
    ordersExecuted: executed,
    ordersCancelled: cancelled,
    snapshotsWritten: written,
    pricesFetched: prices.size,
    durationMs: 0, // caller fills this in
  };
}

// ---------------------------------------------------------------------------
// Price fetching — sequential with courtesy pause
// ---------------------------------------------------------------------------

async function fetchPrices(tickers: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    try {
      const price = await getClosingPrice(ticker);
      prices.set(ticker, price);
    } catch (err) {
      // Log the failure but continue — affected orders will be cancelled below.
      console.warn(
        `[CRON] Could not fetch price for ${ticker}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // Brief pause between requests — keeps us within Finnhub free tier
    // (60 req/min = 1 req/sec). 1 000 ms is conservative and safe.
    if (i < tickers.length - 1) {
      await sleep(1000);
    }
  }

  return prices;
}

// ---------------------------------------------------------------------------
// Order execution — processes all pending trades grouped by user
// ---------------------------------------------------------------------------

async function executeOrders(
  service: ServiceClient,
  pendingTrades: PendingTrade[],
  allHoldings: HoldingRecord[],
  prices: Map<string, number>
): Promise<{ executed: number; cancelled: number }> {
  if (pendingTrades.length === 0) {
    console.log("[CRON] No orders to execute");
    return { executed: 0, cancelled: 0 };
  }

  // Group trades by user, preserving submitted_at ascending order from query
  const tradesByUser = new Map<string, PendingTrade[]>();
  for (const trade of pendingTrades) {
    if (!tradesByUser.has(trade.user_id)) tradesByUser.set(trade.user_id, []);
    tradesByUser.get(trade.user_id)!.push(trade);
  }

  // Index pre-execution holdings by user
  const holdingsByUser = new Map<
    string,
    Map<string, { shares: number; avgCost: number }>
  >();
  for (const h of allHoldings) {
    if (!holdingsByUser.has(h.user_id)) {
      holdingsByUser.set(h.user_id, new Map());
    }
    holdingsByUser
      .get(h.user_id)!
      .set(h.ticker, { shares: h.shares, avgCost: h.average_cost_basis });
  }

  // Fetch cash balances for all affected users in one query
  const userIds = Array.from(tradesByUser.keys());
  const { data: portfolioData, error: portfolioErr } = await service
    .from("portfolios")
    .select("user_id, cash_balance")
    .in("user_id", userIds);

  if (portfolioErr) {
    throw new Error(`Failed to fetch portfolios: ${portfolioErr.message}`);
  }

  const cashByUser = new Map<string, number>();
  for (const p of (portfolioData ?? []) as Array<{
    user_id: string;
    cash_balance: number;
  }>) {
    cashByUser.set(p.user_id, p.cash_balance);
  }

  let totalExecuted = 0;
  let totalCancelled = 0;

  // Process each user's trades atomically in memory, then write all changes
  for (const [userId, userTrades] of Array.from(tradesByUser.entries())) {
    let cashBalance = cashByUser.get(userId) ?? 0;
    const holdings =
      holdingsByUser.get(userId) ??
      new Map<string, { shares: number; avgCost: number }>();
    const deletedTickers = new Set<string>();

    type ExecutedUpdate = {
      id: string;
      status: "executed";
      executed_price: number;
      executed_at: string;
    };
    type CancelledUpdate = {
      id: string;
      status: "cancelled";
      cancellation_reason: string;
    };
    type TradeUpdate = ExecutedUpdate | CancelledUpdate;

    const updates: TradeUpdate[] = [];
    const executedAt = new Date().toISOString();

    for (const trade of userTrades) {
      const price = prices.get(trade.ticker);

      if (price === undefined) {
        console.warn(
          `[CRON] No price for ${trade.ticker} — cancelling trade ${trade.id}`
        );
        updates.push({
          id: trade.id,
          status: "cancelled",
          cancellation_reason: `Closing price unavailable for ${trade.ticker} on ${today()}`,
        });
        totalCancelled++;
        continue;
      }

      if (trade.trade_type === "buy") {
        const cost = trade.shares * price;

        if (cost > cashBalance + 0.001) {
          // Insufficient cash — can happen if multiple pending buys are queued
          // and the available cash was not reserved at submission time (V1 scope).
          console.warn(
            `[CRON] Insufficient funds for trade ${trade.id}: ` +
              `need $${cost.toFixed(2)}, have $${cashBalance.toFixed(2)}`
          );
          updates.push({
            id: trade.id,
            status: "cancelled",
            cancellation_reason:
              `Insufficient cash balance at execution: ` +
              `needed $${cost.toFixed(2)}, available $${cashBalance.toFixed(2)}`,
          });
          totalCancelled++;
          continue;
        }

        // Deduct cash and update in-memory holdings
        cashBalance -= cost;
        const existing = holdings.get(trade.ticker);
        if (existing) {
          const newShares = existing.shares + trade.shares;
          const newAvg =
            (existing.shares * existing.avgCost + trade.shares * price) /
            newShares;
          holdings.set(trade.ticker, { shares: newShares, avgCost: newAvg });
        } else {
          holdings.set(trade.ticker, { shares: trade.shares, avgCost: price });
        }

        updates.push({
          id: trade.id,
          status: "executed",
          executed_price: price,
          executed_at: executedAt,
        });
        totalExecuted++;
        console.log(
          `[CRON] Executed BUY  ${trade.shares} ${trade.ticker} @ $${price.toFixed(2)} — user ${userId}`
        );
      } else {
        // sell
        const existing = holdings.get(trade.ticker);
        const availableShares = existing?.shares ?? 0;

        if (trade.shares > availableShares + 0.0001) {
          console.warn(
            `[CRON] Insufficient shares for trade ${trade.id}: ` +
              `need ${trade.shares}, have ${availableShares}`
          );
          updates.push({
            id: trade.id,
            status: "cancelled",
            cancellation_reason:
              `Insufficient shares at execution: ` +
              `needed ${trade.shares}, available ${availableShares}`,
          });
          totalCancelled++;
          continue;
        }

        // Add proceeds and update in-memory holdings
        cashBalance += trade.shares * price;
        const newShares = availableShares - trade.shares;

        if (newShares < 0.0001) {
          holdings.delete(trade.ticker);
          deletedTickers.add(trade.ticker);
        } else {
          holdings.set(trade.ticker, {
            shares: newShares,
            avgCost: existing!.avgCost,
          });
        }

        updates.push({
          id: trade.id,
          status: "executed",
          executed_price: price,
          executed_at: executedAt,
        });
        totalExecuted++;
        console.log(
          `[CRON] Executed SELL ${trade.shares} ${trade.ticker} @ $${price.toFixed(2)} — user ${userId}`
        );
      }
    }

    // --- Write changes to the database ---

    // Update each trade's status (different executed_price per row, so individual updates)
    for (const update of updates) {
      if (update.status === "executed") {
        const { error } = await service
          .from("trades")
          .update({
            status: "executed",
            executed_price: update.executed_price,
            executed_at: update.executed_at,
          })
          .eq("id", update.id);
        if (error) {
          console.error(
            `[CRON] Failed to mark trade ${update.id} executed:`,
            error.message
          );
        }
      } else {
        const { error } = await service
          .from("trades")
          .update({
            status: "cancelled",
            cancellation_reason: update.cancellation_reason,
          })
          .eq("id", update.id);
        if (error) {
          console.error(
            `[CRON] Failed to cancel trade ${update.id}:`,
            error.message
          );
        }
      }
    }

    // Update cash balance
    const { error: cashErr } = await service
      .from("portfolios")
      .update({ cash_balance: cashBalance })
      .eq("user_id", userId);
    if (cashErr) {
      console.error(
        `[CRON] Failed to update cash balance for user ${userId}:`,
        cashErr.message
      );
    }

    // Safety check — log if cash went negative (should not happen in normal flow)
    if (cashBalance < -0.01) {
      console.error(
        `[CRON] CRITICAL: user ${userId} has negative cash balance $${cashBalance.toFixed(2)}. ` +
          `Manual investigation required.`
      );
    }

    // Bulk upsert active holdings (one request per user)
    const upsertRows = Array.from(holdings.entries()).map(
      ([ticker, { shares, avgCost }]) => ({
        user_id: userId,
        ticker,
        shares,
        average_cost_basis: avgCost,
      })
    );
    if (upsertRows.length > 0) {
      const { error: upsertErr } = await service
        .from("holdings")
        .upsert(upsertRows, { onConflict: "user_id,ticker" });
      if (upsertErr) {
        console.error(
          `[CRON] Failed to upsert holdings for user ${userId}:`,
          upsertErr.message
        );
      }
    }

    // Delete fully-sold holdings (shares reached zero)
    for (const ticker of Array.from(deletedTickers)) {
      const { error: deleteErr } = await service
        .from("holdings")
        .delete()
        .eq("user_id", userId)
        .eq("ticker", ticker);
      if (deleteErr) {
        console.error(
          `[CRON] Failed to delete holding ${ticker} for user ${userId}:`,
          deleteErr.message
        );
      }
    }
  }

  return { executed: totalExecuted, cancelled: totalCancelled };
}

// ---------------------------------------------------------------------------
// Snapshot writing — runs after order execution to capture post-trade state
// ---------------------------------------------------------------------------

async function writeSnapshots(
  service: ServiceClient,
  today: string,
  prices: Map<string, number>
): Promise<{ written: number }> {
  // Fetch all portfolios (post-execution cash balances)
  const { data: portfolioData, error: portfolioErr } = await service
    .from("portfolios")
    .select("user_id, cash_balance, sp500_baseline_price");

  if (portfolioErr) {
    throw new Error(
      `Failed to fetch portfolios for snapshots: ${portfolioErr.message}`
    );
  }

  const portfolios = (portfolioData ?? []) as PortfolioRecord[];
  if (portfolios.length === 0) {
    console.log("[CRON] No portfolios found — skipping snapshots");
    return { written: 0 };
  }

  // Fetch all current holdings (post-execution)
  const { data: holdingsData, error: holdingsErr } = await service
    .from("holdings")
    .select("user_id, ticker, shares");

  if (holdingsErr) {
    throw new Error(
      `Failed to fetch holdings for snapshots: ${holdingsErr.message}`
    );
  }

  // Group holdings by user
  const holdingsByUser = new Map<
    string,
    Array<{ ticker: string; shares: number }>
  >();
  for (const h of (holdingsData ?? []) as Array<{
    user_id: string;
    ticker: string;
    shares: number;
  }>) {
    if (!holdingsByUser.has(h.user_id)) holdingsByUser.set(h.user_id, []);
    holdingsByUser.get(h.user_id)!.push({ ticker: h.ticker, shares: h.shares });
  }

  // Fetch any holding prices we still need (e.g. tickers with no pending orders)
  const missingTickers = new Set<string>();
  for (const userHoldings of Array.from(holdingsByUser.values())) {
    for (const h of userHoldings) {
      if (!prices.has(h.ticker)) missingTickers.add(h.ticker);
    }
  }

  if (missingTickers.size > 0) {
    console.log(
      `[CRON] Fetching ${missingTickers.size} additional price(s) for snapshot calculation`
    );
    const extra = await fetchPrices(Array.from(missingTickers));
    for (const [ticker, price] of Array.from(extra.entries())) {
      prices.set(ticker, price);
    }
  }

  const spyPrice = prices.get("SPY");
  if (!spyPrice) {
    console.error(
      "[CRON] SPY price is unavailable — cannot write daily snapshots"
    );
    return { written: 0 };
  }

  // Build snapshot rows — one per user
  const snapshotRows = portfolios.map((portfolio) => {
    const userHoldings = holdingsByUser.get(portfolio.user_id) ?? [];

    const holdingsValue = userHoldings.reduce((sum, h) => {
      const price = prices.get(h.ticker);
      if (price === undefined) {
        console.warn(
          `[CRON] Missing price for ${h.ticker} in snapshot for user ${portfolio.user_id} — using $0`
        );
        return sum;
      }
      return sum + h.shares * price;
    }, 0);

    const portfolioValue = portfolio.cash_balance + holdingsValue;
    // S&P benchmark: what would $100k invested in SPY on day 1 be worth today?
    const sp500Value =
      100_000 * (spyPrice / portfolio.sp500_baseline_price);

    return {
      user_id: portfolio.user_id,
      date: today,
      portfolio_value: portfolioValue,
      sp500_value: sp500Value,
    };
  });

  // Upsert all snapshots in one query.
  // The unique constraint on (user_id, date) makes this safely re-runnable —
  // running the cron twice on the same day simply overwrites the snapshot
  // with fresh post-execution values.
  const { error: upsertErr } = await service
    .from("daily_snapshots")
    .upsert(snapshotRows, { onConflict: "user_id,date" });

  if (upsertErr) {
    throw new Error(`Failed to upsert daily snapshots: ${upsertErr.message}`);
  }

  console.log(
    `[CRON] Wrote ${snapshotRows.length} snapshot(s) for ${today}`
  );
  return { written: snapshotRows.length };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// today() helper — returns the current date as YYYY-MM-DD (UTC, for log messages only)
function today(): string {
  return new Date().toISOString().split("T")[0];
}
