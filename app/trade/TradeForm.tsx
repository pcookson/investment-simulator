"use client";

// TradeForm — the interactive order form.
// - Ticker input with 500 ms debounced validation via /api/ticker
// - Buy / Sell toggle
// - Shares input with live estimated value
// - Displays available cash (buys) or shares held (sells)
// - Submits via submitTradeAction server action
// - Shows a success card on completion with execution date

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { submitTradeAction } from "@/lib/trading";

const INITIAL_TRADE_RESULT = { success: false as const, error: "" };
import { formatExecutionDate } from "@/lib/dates";
import type { HoldingRow } from "./page";

// ---------------------------------------------------------------------------
// SubmitButton — reads pending state from the form status context
// ---------------------------------------------------------------------------

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-md bg-black py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
    >
      {pending ? "Submitting…" : "Place Order"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Types for the local ticker validation state
// ---------------------------------------------------------------------------

type TickerStatus = "idle" | "loading" | "valid" | "invalid";

interface TickerInfo {
  ticker: string;
  name: string;
  price: number;
}

// ---------------------------------------------------------------------------
// TradeForm
// ---------------------------------------------------------------------------

interface TradeFormProps {
  cashBalance: number;
  holdings: HoldingRow[];
  onReset: () => void;
}

export function TradeForm({ cashBalance, holdings, onReset }: TradeFormProps) {
  const [formState, formAction] = useFormState(
    submitTradeAction,
    INITIAL_TRADE_RESULT
  );

  // Local state
  const [tickerInput, setTickerInput] = useState("");
  const [tickerStatus, setTickerStatus] = useState<TickerStatus>("idle");
  const [tickerInfo, setTickerInfo] = useState<TickerInfo | null>(null);
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  // ---------------------------------------------------------------------------
  // Ticker validation — debounced at 500 ms
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const raw = tickerInput.trim();

    if (!raw) {
      setTickerStatus("idle");
      setTickerInfo(null);
      return;
    }

    setTickerStatus("loading");
    setTickerInfo(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/ticker?ticker=${encodeURIComponent(raw)}`
          );
          const data = await res.json();
          if (!res.ok || data.error) {
            setTickerStatus("invalid");
            setTickerInfo(null);
          } else {
            setTickerStatus("valid");
            setTickerInfo(data as TickerInfo);
          }
        } catch {
          setTickerStatus("invalid");
          setTickerInfo(null);
        }
      });
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerInput]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const sharesNum = parseFloat(shares);
  const estimatedValue =
    tickerInfo && !isNaN(sharesNum) && sharesNum > 0
      ? sharesNum * tickerInfo.price
      : null;

  const heldShares =
    holdings.find((h) => h.ticker === tickerInfo?.ticker)?.shares ?? 0;

  const isFormReady =
    tickerStatus === "valid" &&
    !isNaN(sharesNum) &&
    sharesNum > 0 &&
    Number.isInteger(sharesNum);

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (formState.success) {
    const result = formState;
    return (
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-green-600 text-xl">✓</span>
          <h2 className="text-lg font-semibold text-black">Order Placed</h2>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Ticker</dt>
            <dd className="font-medium text-black">
              {result.ticker} — {result.name}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Order type</dt>
            <dd className="font-medium capitalize text-black">
              {result.tradeType}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Shares</dt>
            <dd className="font-medium text-black">{result.shares}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Est. value</dt>
            <dd className="font-medium text-black">
              {(result.shares * result.price).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Executes on</dt>
            <dd className="font-medium text-black">
              {formatExecutionDate(result.executionDate)}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onReset}
            className="flex-1 rounded-md border border-black py-2 text-sm font-semibold text-black hover:bg-gray-50 transition-colors"
          >
            Place another order
          </button>
          <Link
            href="/trade/pending"
            className="flex-1 rounded-md bg-black py-2 text-center text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            View pending orders
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <form action={formAction} className="space-y-6">
      {/* Server-side error */}
      {formState.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {formState.error}
        </p>
      )}

      {/* Ticker */}
      <div>
        <label
          htmlFor="ticker"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Ticker symbol
        </label>
        <input
          id="ticker"
          name="ticker"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. AAPL"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-black focus:outline-none"
        />
        {/* Ticker feedback */}
        <div className="mt-1 min-h-[1.25rem] text-sm">
          {tickerStatus === "loading" && (
            <span className="text-gray-400">Checking…</span>
          )}
          {tickerStatus === "invalid" && (
            <span className="text-red-600">
              &ldquo;{tickerInput}&rdquo; not found. Check the symbol and try
              again.
            </span>
          )}
          {tickerStatus === "valid" && tickerInfo && (
            <span className="text-gray-600">
              {tickerInfo.name} &mdash;{" "}
              <span className="font-medium text-black">
                {tickerInfo.price.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Buy / Sell */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          Order type
        </p>
        <div className="flex gap-3">
          {(["buy", "sell"] as const).map((type) => (
            <label
              key={type}
              className={`flex-1 cursor-pointer rounded-md border py-2.5 text-center text-sm font-semibold transition-colors ${
                tradeType === type
                  ? "border-black bg-black text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="tradeType"
                value={type}
                checked={tradeType === type}
                onChange={() => setTradeType(type)}
                className="sr-only"
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Shares */}
      <div>
        <label
          htmlFor="shares"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Number of shares
        </label>
        <input
          id="shares"
          name="shares"
          type="number"
          min="1"
          step="1"
          placeholder="0"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
      </div>

      {/* Context line: available cash (buy) or shares held (sell) */}
      {tickerInfo && (
        <div className="rounded-md bg-gray-50 px-4 py-3 text-sm space-y-1">
          {tradeType === "buy" ? (
            <div className="flex justify-between">
              <span className="text-gray-500">Available cash</span>
              <span className="font-medium text-black">
                {cashBalance.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-gray-500">
                {tickerInfo.ticker} shares held
              </span>
              <span className="font-medium text-black">{heldShares}</span>
            </div>
          )}
          {estimatedValue !== null && (
            <div className="flex justify-between">
              <span className="text-gray-500">Estimated value</span>
              <span className="font-medium text-black">
                {estimatedValue.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Market hours notice */}
      <p className="text-xs text-gray-400">
        Orders placed before 3:30&nbsp;PM ET on a weekday execute at that
        day&rsquo;s closing price. Later orders execute the following trading
        day.
      </p>

      <SubmitButton disabled={!isFormReady} />
    </form>
  );
}
