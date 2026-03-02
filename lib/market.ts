// -----------------------------------------------------------------------------
// lib/market.ts — Market data helpers
//
// Minimal implementation for Epic 2 (sign-up baseline price).
// Expanded with ticker search, validation, and broader quote fetching in Epic 3.
//
// Provider: Alpha Vantage (free tier, 25 requests/day)
// Endpoint:  GLOBAL_QUOTE — returns latest quote including previous close.
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

/**
 * Fetch the most recent confirmed closing price for a ticker.
 *
 * Uses the "previous close" field from Alpha Vantage GLOBAL_QUOTE because it
 * is always a settled end-of-day price regardless of when during the trading
 * day this function is called. The live "price" field fluctuates intraday.
 *
 * This will be refined in Story 3.1 to handle weekends, holidays, and
 * market-hours detection more robustly.
 */
export async function getClosingPrice(ticker: string): Promise<number> {
  const apiKey = process.env.MARKET_DATA_API_KEY;

  if (!apiKey) {
    throw new MarketDataError(
      "Missing environment variable: MARKET_DATA_API_KEY"
    );
  }

  const url = new URL(ALPHA_VANTAGE_BASE);
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", ticker.toUpperCase());
  url.searchParams.set("apikey", apiKey);

  let res: Response;
  try {
    // cache: "no-store" — always fetch fresh price data, never use Next.js cache
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

  // Alpha Vantage returns an empty "Global Quote" object for invalid tickers
  if (!quote || !quote["08. previous close"] || !quote["01. symbol"]) {
    throw new MarketDataError(
      `No price data found for "${ticker}". The ticker may be invalid.`
    );
  }

  const price = parseFloat(quote["08. previous close"]);

  if (isNaN(price) || price <= 0) {
    throw new MarketDataError(
      `Received invalid price data for ${ticker}: "${quote["08. previous close"]}"`
    );
  }

  return price;
}

/**
 * Fetch the most recent SPY closing price.
 * Used during sign-up to record the user's personal S&P 500 baseline.
 */
export async function getSpyClosingPrice(): Promise<number> {
  return getClosingPrice("SPY");
}
