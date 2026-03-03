"use client";

// TradeFormWrapper manages the key prop that forces TradeForm to remount
// when the user clicks "Place another order" after a successful submission.

import { useState } from "react";
import { TradeForm } from "./TradeForm";
import type { HoldingRow } from "./page";

interface TradeFormWrapperProps {
  cashBalance: number;
  holdings: HoldingRow[];
  initialTicker?: string;
}

export function TradeFormWrapper({ cashBalance, holdings, initialTicker }: TradeFormWrapperProps) {
  const [formKey, setFormKey] = useState(0);

  return (
    <TradeForm
      key={formKey}
      cashBalance={cashBalance}
      holdings={holdings}
      initialTicker={initialTicker}
      onReset={() => setFormKey((k) => k + 1)}
    />
  );
}
