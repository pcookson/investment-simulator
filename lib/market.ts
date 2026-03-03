// -----------------------------------------------------------------------------
// lib/market.ts — Market data helpers
//
// Provider: Alpha Vantage (free tier, 25 requests/day)
// Endpoints:
//   GLOBAL_QUOTE   — latest price for any ticker
//   SYMBOL_SEARCH  — company name lookup
// -----------------------------------------------------------------------------

const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataError";
  }
}

interface AlphaVantageGlobalQuote {
  "Global Quote": {
    "01. symbol": string;
    "05. price": string;
    "07. latest trading day": string;
    "08. previous close": string;
  };
}

interface AlphaVantageSymbolSearch {
  bestMatches?: Array<{
    "1. symbol": string;
    "2. name": string;
  }>;
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
// Prevents hammering Alpha Vantage (25 req/day free tier) during form interaction.
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: TickerInfo;
  expiresAt: number;
}

const tickerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!apiKey) {
    throw new MarketDataError(
      "Missing environment variable: MARKET_DATA_API_KEY"
    );
  }
  return apiKey;
}

async function fetchGlobalQuote(
  ticker: string,
  apiKey: string
): Promise<number> {
  const url = new URL(ALPHA_VANTAGE_BASE);
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    throw new MarketDataError(
      `Network error fetching price for ${ticker}. Check your connection.`
    );
  }

  if (!res.ok) {
    throw new MarketDataError(
      `Market data request failed with status ${res.status}`
    );
  }

  const data = (await res.json()) as AlphaVantageGlobalQuote;
  const quote = data["Global Quote"];

  if (!quote || !quote["05. price"] || !quote["01. symbol"]) {
    throw new MarketDataError(
      `No price data found for "${ticker}". The ticker may be invalid.`
    );
  }

  const price = parseFloat(quote["05. price"]);
  if (isNaN(price) || price <= 0) {
    throw new MarketDataError(
      `Received invalid price data for ${ticker}: "${quote["05. price"]}"`
    );
  }

  return price;
}

async function fetchCompanyName(
  ticker: string,
  apiKey: string
): Promise<string> {
  const url = new URL(ALPHA_VANTAGE_BASE);
  url.searchParams.set("function", "SYMBOL_SEARCH");
  url.searchParams.set("keywords", ticker);
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return ticker;

    const data = (await res.json()) as AlphaVantageSymbolSearch;
    const match = data.bestMatches?.find(
      (m) => m["1. symbol"].toUpperCase() === ticker.toUpperCase()
    );
    return match?.["2. name"] ?? ticker;
  } catch {
    // Name lookup is best-effort — fall back to ticker symbol
    return ticker;
  }
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
 * Uses "05. price" from GLOBAL_QUOTE. After market close and on weekends this
 * equals the last session's official closing price. During market hours it is
 * the live traded price (acceptable for V1).
 *
 * Not cached — always returns a fresh price. Used during sign-up and the cron
 * job where staleness is unacceptable.
 */
export async function getClosingPrice(ticker: string): Promise<number> {
  const apiKey = getApiKey();
  return fetchGlobalQuote(ticker.toUpperCase(), apiKey);
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
 * Calls GLOBAL_QUOTE and SYMBOL_SEARCH in parallel. Results are cached for
 * 5 minutes to minimise API calls during interactive form use.
 *
 * Throws MarketDataError for invalid or unrecognised tickers.
 */
export async function validateTicker(rawTicker: string): Promise<TickerInfo> {
  const ticker = rawTicker.trim().toUpperCase();

  const cached = tickerCache.get(ticker);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const apiKey = getApiKey();

  // Fetch price (required) and name (best-effort) in parallel
  const [price, name] = await Promise.all([
    fetchGlobalQuote(ticker, apiKey),
    fetchCompanyName(ticker, apiKey),
  ]);

  const info: TickerInfo = { ticker, name, price };
  tickerCache.set(ticker, { data: info, expiresAt: Date.now() + CACHE_TTL_MS });
  return info;
}
