// -----------------------------------------------------------------------------
// lib/market.ts — Market data helpers
//
// Minimal implementation for Epic 2 (sign-up baseline price).
// Expanded with ticker search, validation, and broader quote fetching in Epic 3.
//
// Provider: Alpha Vantage (free tier, 25 requests/day)
// Endpoint:  GLOBAL_QUOTE — returns latest quote.
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
 * Uses the "price" field ("05.") from Alpha Vantage GLOBAL_QUOTE. After market
 * close and on weekends this equals the last session's official closing price.
 * During market hours it is the live traded price (acceptable for V1 — can be
 * refined in Story 3.1 with explicit market-hours detection if needed).
 *
 * "previous close" ("08.") was intentionally avoided: it is the close from the
 * day BEFORE the latest trading day, so on a weekend it returns Thursday's
 * close rather than Friday's.
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

/**
 * Fetch the most recent SPY closing price.
 * Used during sign-up to record the user's personal S&P 500 baseline.
 */
export async function getSpyClosingPrice(): Promise<number> {
  return getClosingPrice("SPY");
}
