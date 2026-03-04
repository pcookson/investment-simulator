// -----------------------------------------------------------------------------
// lib/market.ts — Market data helpers
//
// Provider: Finnhub (free tier: 60 req/min, no daily cap)
// Endpoints used:
//   quote        — current/closing price for any ticker
//   symbolSearch — company name lookup
// -----------------------------------------------------------------------------

import finnhub from "finnhub";

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataError";
  }
}

// ---------------------------------------------------------------------------
// Finnhub response shapes
// ---------------------------------------------------------------------------

interface FinnhubQuote {
  c: number;  // current price (= session closing price after market close)
  pc: number; // previous close
}

interface FinnhubSymbolMatch {
  description: string;  // company / fund name
  displaySymbol: string;
  symbol: string;
  type: string;
}

interface FinnhubSymbolSearchResult {
  result?: FinnhubSymbolMatch[];
}

// Minimal typed interface for the methods we call
interface FinnhubClient {
  quote(
    symbol: string,
    cb: (err: Error | null, data: FinnhubQuote) => void
  ): void;
  // opts is required (pass {} to omit); exchange can be used to restrict results
  symbolSearch(
    q: string,
    opts: { exchange?: string },
    cb: (err: Error | null, data: FinnhubSymbolSearchResult) => void
  ): void;
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface TickerInfo {
  ticker: string;
  name: string;
  price: number;
}

// ---------------------------------------------------------------------------
// In-memory cache for validateTicker results
// Prevents hammering Finnhub (60 req/min free tier) during form interaction.
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: TickerInfo;
  expiresAt: number;
}

const tickerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Client factory
// DefaultApi takes the API key directly in its constructor.
// ---------------------------------------------------------------------------

function getClient(): FinnhubClient {
  const apiKey = process.env.FINNHUB_DATA_API_KEY;
  if (!apiKey) {
    throw new MarketDataError(
      "Missing environment variable: FINNHUB_DATA_API_KEY"
    );
  }
  return new finnhub.DefaultApi(apiKey) as FinnhubClient;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchGlobalQuote(ticker: string): Promise<number> {
  const client = getClient();
  return new Promise((resolve, reject) => {
    client.quote(ticker, (error, data) => {
      if (error) {
        reject(
          new MarketDataError(
            `Failed to fetch price for ${ticker}: ${error.message}`
          )
        );
        return;
      }

      // `c` is the current price; after market close it equals the session's
      // official closing price. During market hours it reflects the live
      // traded price (acceptable for V1 — same behaviour as before).
      const price = data?.c;
      if (!price || price <= 0) {
        reject(
          new MarketDataError(
            `No price data found for "${ticker}". The ticker may be invalid.`
          )
        );
        return;
      }

      resolve(price);
    });
  });
}

async function fetchCompanyName(ticker: string): Promise<string> {
  const client = getClient();
  return new Promise((resolve) => {
    client.symbolSearch(ticker, {}, (error, data) => {
      if (error || !data?.result?.length) {
        resolve(ticker); // best-effort — fall back to ticker symbol
        return;
      }
      const match = data.result.find(
        (m) => m.symbol.toUpperCase() === ticker.toUpperCase()
      );
      resolve(match?.description ?? ticker);
    });
  });
}

// ---------------------------------------------------------------------------
// 2026 US stock market holidays (NYSE / NASDAQ)
// Used by the cron job to skip non-trading days.
// ---------------------------------------------------------------------------

export const US_MARKET_HOLIDAYS_2026: string[] = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday (Easter is April 5)
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth National Independence Day
  "2026-07-03", // Independence Day observed (July 4 falls on Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
];

/** Returns true if the given YYYY-MM-DD date is a US market holiday. */
export function isMarketHoliday(ymd: string): boolean {
  return US_MARKET_HOLIDAYS_2026.includes(ymd);
}

/**
 * Returns true if the given YYYY-MM-DD date is a trading day
 * (weekday and not a market holiday).
 */
export function isTradingDay(ymd: string): boolean {
  const [year, month, day] = ymd.split("-").map(Number);
  const dow = new Date(year, month - 1, day).getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !isMarketHoliday(ymd);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the most recent confirmed closing price for a ticker.
 *
 * Uses Finnhub's `quote.c` field. After market close and on weekends this
 * equals the last session's official closing price. During market hours it
 * is the live traded price (acceptable for V1).
 *
 * Not cached — always returns a fresh price. Used by the cron job and sign-up
 * where staleness is unacceptable.
 */
export async function getClosingPrice(ticker: string): Promise<number> {
  return fetchGlobalQuote(ticker.toUpperCase());
}

/**
 * Fetch the most recent SPY closing price.
 * Used during sign-up to record the user's personal S&P 500 baseline.
 */
export async function getSpyClosingPrice(): Promise<number> {
  return getClosingPrice("SPY");
}

/**
 * Validate a ticker and return its current price + company name.
 *
 * Calls quote and symbolSearch in parallel. Results are cached for 5 minutes
 * to minimise API calls during interactive form use.
 *
 * Throws MarketDataError for invalid or unrecognised tickers.
 */
export async function validateTicker(rawTicker: string): Promise<TickerInfo> {
  const ticker = rawTicker.trim().toUpperCase();

  const cached = tickerCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fetch price (required) and name (best-effort) in parallel
  const [price, name] = await Promise.all([
    fetchGlobalQuote(ticker),
    fetchCompanyName(ticker),
  ]);

  const info: TickerInfo = { ticker, name, price };
  tickerCache.set(ticker, { data: info, expiresAt: Date.now() + CACHE_TTL_MS });
  return info;
}
