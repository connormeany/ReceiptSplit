"use client";

import { useState } from "react";

interface ItemCardProps {
  item: { id: string; name: string; price: number; quantity: number };
  claims: { id: string; item_id: string; person_id: string; split_count: number; custom_amount: number | null; custom_fraction: string | null }[];
  people: { id: string; name: string; color: string }[];
  myClaim: { id: string; split_count: number; custom_amount: number | null; custom_fraction: string | null } | null;
  groupSize: number | null;
  onClaim: (splitCount: number, customAmount?: number, customFraction?: string) => void;
  onUnclaim: () => void;
}

export function ItemCard({
  item,
  claims,
  people,
  myClaim,
  groupSize,
  onClaim,
  onUnclaim,
}: ItemCardProps) {
  const [showSplitOptions, setShowSplitOptions] = useState(false);
  const [showMoreSplits, setShowMoreSplits] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showFractionInput, setShowFractionInput] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [fractionNum, setFractionNum] = useState("1");
  const [fractionDenom, setFractionDenom] = useState("");
  const [loading, setLoading] = useState(false);

  const claimers = claims
    .map((c) => {
      const person = people.find((p) => p.id === c.person_id);
      return person ? { ...person, split_count: c.split_count, custom_amount: c.custom_amount, custom_fraction: c.custom_fraction } : null;
    })
    .filter(Boolean) as { id: string; name: string; color: string; split_count: number; custom_amount: number | null; custom_fraction: string | null }[];

  const splitCount = claims[0]?.split_count || 1;
  const hasCustomClaims = claims.some((c) => c.custom_amount != null);
  const hasFractionClaims = claims.some((c) => c.custom_fraction != null);
  const isClaimed = claims.length > 0;
  const iClaimedThis = !!myClaim;
  const isSplit = splitCount > 1;

  const customClaimedTotal = claims.reduce((sum, c) => sum + (c.custom_amount ?? 0), 0);
  const remaining = Math.round((item.price - customClaimedTotal) * 100) / 100;

  const isFull = isClaimed && !iClaimedThis && (
    hasCustomClaims ? remaining <= 0 : claims.length >= splitCount
  );

  const handleClaim = async (sc: number, ca?: number, cf?: string) => {
    setLoading(true);
    setShowSplitOptions(false);
    setShowCustomInput(false);
    setShowFractionInput(false);
    await onClaim(sc, ca, cf);
    setLoading(false);
  };

  const handleUnclaim = async () => {
    setLoading(true);
    setShowSplitOptions(false);
    await onUnclaim();
    setLoading(false);
  };

  // Tap card to claim (only when not already claimed by me and not full)
  const handleCardTap = () => {
    if (loading || isFull || iClaimedThis) return;
    if (hasFractionClaims) {
      // Open fraction input so user can specify their share
      setShowFractionInput(true);
      setShowSplitOptions(false);
      setShowCustomInput(false);
      setFractionNum("1");
      setFractionDenom("");
      return;
    }
    if (hasCustomClaims) {
      handleClaim(1, remaining);
    } else {
      handleClaim(isClaimed ? splitCount : 1);
    }
  };

  return (
    <div
      className={`rounded-xl shadow-sm transition ${
        iClaimedThis
          ? "bg-white ring-2 ring-blue-400"
          : isFull
            ? "bg-gray-100 opacity-60"
            : "bg-white"
      }`}
    >
      {/* Tappable card body */}
      <div
        onClick={handleCardTap}
        className={`p-4 ${!isFull && !iClaimedThis ? "cursor-pointer" : ""}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className={`font-medium ${isFull ? "text-gray-400" : "text-gray-900"}`}>{item.name}</p>
            <p className="text-sm text-gray-500">
              ${item.price.toFixed(2)}
              {item.quantity > 1 && ` x${item.quantity}`}
            </p>
          </div>

          {/* Claimers */}
          {claimers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {claimers.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: c.color }}
                >
                  {c.name}
                  {c.custom_fraction ? ` ${c.custom_fraction}` : c.custom_amount != null ? ` $${c.custom_amount.toFixed(2)}` : ""}
                </span>
              ))}
              {hasCustomClaims && remaining > 0 && (
                <span className="text-xs text-gray-400">
                  ${remaining.toFixed(2)} left
                </span>
              )}
              {isSplit && !hasCustomClaims && (
                <span className="text-xs font-semibold text-gray-600">
                  {claimers.length}/{splitCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isFull && (
        <div className="border-t border-gray-100 px-4 py-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {loading ? (
            <span className="text-sm text-gray-400">Updating...</span>
          ) : iClaimedThis ? (
            <>
              <button
                onClick={handleUnclaim}
                className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                Unclaim
              </button>
              {!hasCustomClaims && (
                <button
                  onClick={async () => {
                    if (!isSplit && groupSize && groupSize >= 2) {
                      // Apply group size split and show options panel
                      setShowSplitOptions(true);
                      setShowMoreSplits(groupSize > 8);
                      setShowCustomInput(false);
                      setLoading(true);
                      await onClaim(groupSize);
                      setLoading(false);
                    } else {
                      setShowSplitOptions(!showSplitOptions);
                      setShowMoreSplits(false);
                      setShowCustomInput(false);
                    }
                  }}
                  className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  {isSplit ? `Split ${splitCount}-way` : "Split..."}
                </button>
              )}
            </>
          ) : (
            <>
              {hasFractionClaims ? (
                <button
                  onClick={() => {
                    setShowFractionInput(!showFractionInput);
                    setShowCustomInput(false);
                    setShowSplitOptions(false);
                    setFractionNum("1");
                    setFractionDenom("");
                  }}
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
                >
                  Claim fraction
                </button>
              ) : hasCustomClaims ? (
                <button
                  onClick={() => handleClaim(1, remaining)}
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
                >
                  Claim rest (${remaining.toFixed(2)})
                </button>
              ) : (
                <button
                  onClick={() => handleClaim(isClaimed ? splitCount : 1)}
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
                >
                  {isClaimed ? "Join split" : "Claim"}
                </button>
              )}
              {!hasCustomClaims && (
                <button
                  onClick={async () => {
                    if (!isClaimed && groupSize && groupSize >= 2) {
                      // Apply group size split and show options panel
                      setShowSplitOptions(true);
                      setShowMoreSplits(groupSize > 8);
                      setShowCustomInput(false);
                      setLoading(true);
                      await onClaim(groupSize);
                      setLoading(false);
                    } else {
                      setShowSplitOptions(!showSplitOptions);
                      setShowMoreSplits(false);
                      setShowCustomInput(false);
                    }
                  }}
                  className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  {isClaimed ? `Split ${splitCount}-way` : "Split..."}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Split options */}
      {showSplitOptions && (
        <div className="border-t border-gray-100 px-4 py-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleClaim(1)}
            className={`rounded-lg border px-3 py-1 text-sm ${
              splitCount === 1
                ? "border-blue-400 bg-blue-50 text-blue-600"
                : "border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            No split
          </button>
          {(showMoreSplits ? [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] : [2,3,4,5,6,7,8]).map((n) => (
            <button
              key={n}
              onClick={() => handleClaim(n)}
              className={`rounded-lg border px-3 py-1 text-sm ${
                n === splitCount
                  ? "border-blue-400 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {n}-way
            </button>
          ))}
          {!showMoreSplits && (
            <button
              onClick={() => setShowMoreSplits(true)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
            >
              ...
            </button>
          )}
          <button
            onClick={() => {
              setShowCustomInput(!showCustomInput);
              setShowFractionInput(false);
              setCustomAmount("");
            }}
            className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
          >
            Custom $
          </button>
          <button
            onClick={() => {
              setShowFractionInput(!showFractionInput);
              setShowCustomInput(false);
              setFractionNum("1");
              setFractionDenom("");
            }}
            className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
          >
            Custom /
          </button>
        </div>
      )}

      {showCustomInput && (
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-sm text-gray-500">$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={item.price}
            placeholder="0.00"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="w-24 rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <span className="text-sm text-gray-400">of ${item.price.toFixed(2)}</span>
          <button
            onClick={() => {
              const amt = parseFloat(customAmount);
              if (amt > 0 && amt <= item.price) {
                handleClaim(1, amt);
                setCustomAmount("");
              }
            }}
            disabled={!customAmount || parseFloat(customAmount) <= 0 || parseFloat(customAmount) > item.price}
            className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          >
            Set
          </button>
        </div>
      )}

      {showFractionInput && (() => {
        const num = parseInt(fractionNum) || 0;
        const denom = parseInt(fractionDenom) || 0;
        const fractionAmount = denom > 0 && num > 0 ? Math.round((item.price * num / denom) * 100) / 100 : 0;
        const valid = num > 0 && denom > 0 && num <= denom && fractionAmount > 0 && fractionAmount <= remaining;
        return (
          <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="number"
              min="1"
              placeholder="1"
              value={fractionNum}
              onChange={(e) => setFractionNum(e.target.value)}
              className="w-12 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <span className="text-sm font-medium text-gray-500">/</span>
            <input
              type="number"
              min="1"
              placeholder="3"
              value={fractionDenom}
              onChange={(e) => setFractionDenom(e.target.value)}
              className="w-12 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {denom > 0 && num > 0 && (
              <span className="text-sm text-gray-400">= ${fractionAmount.toFixed(2)}</span>
            )}
            <button
              onClick={() => {
                if (valid) {
                  handleClaim(1, fractionAmount, `${num}/${denom}`);
                  setFractionNum("1");
                  setFractionDenom("");
                }
              }}
              disabled={!valid}
              className="rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
            >
              Set
            </button>
          </div>
        );
      })()}
    </div>
  );
}
