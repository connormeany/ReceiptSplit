"use client";

import { useState } from "react";

const TIP_PERCENTS = [15, 18, 20, 22, 25];

export function TipSelector({
  subtotal,
  tipAmount,
  onTipChange,
}: {
  subtotal: number;
  tipAmount: number;
  onTipChange: (amount: number) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const currentPercent = subtotal > 0 ? Math.round((tipAmount / subtotal) * 100) : 0;

  const handlePercentClick = (pct: number) => {
    const amount = Math.round(subtotal * (pct / 100) * 100) / 100;
    onTipChange(amount);
  };

  const handleCustomSubmit = () => {
    const val = parseFloat(customValue);
    if (!isNaN(val) && val >= 0) {
      onTipChange(Math.round(val * 100) / 100);
    }
  };

  return (
    <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-700">Tip</label>
        <span className="text-sm text-gray-500">
          ${tipAmount.toFixed(2)} ({currentPercent}%)
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TIP_PERCENTS.map((pct) => (
          <button
            key={pct}
            onClick={() => handlePercentClick(pct)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              currentPercent === pct
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {pct}%
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder={tipAmount.toFixed(2)}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
            className="w-full rounded-lg border border-gray-300 py-1.5 pl-7 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleCustomSubmit}
          className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
        >
          Set
        </button>
      </div>
    </div>
  );
}
