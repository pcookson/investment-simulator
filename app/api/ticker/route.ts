// app/api/ticker/route.ts
// Route Handler used by the trade form for client-side ticker validation.
// The form debounces requests (500 ms) before calling this endpoint.

import { NextRequest, NextResponse } from "next/server";
import { validateTicker, MarketDataError } from "@/lib/market";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim();

  if (!ticker) {
    return NextResponse.json(
      { error: "Missing ticker parameter." },
      { status: 400 }
    );
  }

  try {
    const info = await validateTicker(ticker);
    return NextResponse.json(info);
  } catch (err) {
    if (err instanceof MarketDataError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
