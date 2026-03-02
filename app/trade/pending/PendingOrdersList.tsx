"use client";

// PendingOrdersList — displays pending orders with inline cancel confirmation.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelTradeAction } from "@/lib/trading";
import { getExecutionDate, formatExecutionDate, formatSubmittedAt } from "@/lib/dates";
import type { PendingTrade } from "./page";

interface PendingOrdersListProps {
  trades: PendingTrade[];
}

export function PendingOrdersList({ trades }: PendingOrdersListProps) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancelClick(id: string) {
    setConfirmingId(id);
  }

  function handleDismissConfirm() {
    setConfirmingId(null);
  }

  function handleConfirmCancel(id: string) {
    setCancellingId(id);
    startTransition(async () => {
      await cancelTradeAction(id);
      setConfirmingId(null);
      setCancellingId(null);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-3">
      {trades.map((trade) => {
        const executionDate = formatExecutionDate(
          getExecutionDate(new Date(trade.submitted_at))
        );
        const submittedAt = formatSubmittedAt(trade.submitted_at);
        const isCancelling = cancellingId === trade.id && isPending;
        const isConfirming = confirmingId === trade.id;

        return (
          <li
            key={trade.id}
            className="rounded-lg border border-gray-200 px-5 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left: trade details */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-black font-mono">
                    {trade.ticker}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      trade.trade_type === "buy"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {trade.trade_type}
                  </span>
                </div>
                <p className="text-sm text-gray-700">
                  {trade.shares} share{trade.shares === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Submitted {submittedAt}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Executes {executionDate}
                </p>
              </div>

              {/* Right: cancel button / confirmation */}
              <div className="flex-shrink-0 text-right">
                {isConfirming ? (
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="text-xs text-gray-600 whitespace-nowrap">
                      Cancel this order?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDismissConfirm}
                        disabled={isCancelling}
                        className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors disabled:opacity-50"
                      >
                        Keep it
                      </button>
                      <button
                        onClick={() => handleConfirmCancel(trade.id)}
                        disabled={isCancelling}
                        className="text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-800 transition-colors disabled:opacity-50"
                      >
                        {isCancelling ? "Cancelling…" : "Yes, cancel"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleCancelClick(trade.id)}
                    className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
