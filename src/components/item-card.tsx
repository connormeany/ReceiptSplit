"use client";

import { useState } from "react";

interface ItemCardProps {
  item: { id: string; name: string; price: number; quantity: number };
  claims: { id: string; item_id: string; person_id: string; split_count: number }[];
  people: { id: string; name: string; color: string }[];
  myClaim: { id: string; split_count: number } | null;
  onClaim: (splitCount: number) => void;
  onUnclaim: () => void;
}

export function ItemCard({
  item,
  claims,
  people,
  myClaim,
  onClaim,
  onUnclaim,
}: ItemCardProps) {
  const [showSplitOptions, setShowSplitOptions] = useState(false);
  const [loading, setLoading] = useState(false);

  const claimers = claims
    .map((c) => {
      const person = people.find((p) => p.id === c.person_id);
      return person ? { ...person, split_count: c.split_count } : null;
    })
    .filter(Boolean) as { id: string; name: string; color: string; split_count: number }[];

  const splitCount = claims[0]?.split_count || 1;
  const isClaimed = claims.length > 0;
  const iClaimedThis = !!myClaim;
  const isFull = isClaimed && !iClaimedThis && claims.length >= splitCount;

  const handleClaim = async (sc: number) => {
    setLoading(true);
    setShowSplitOptions(false);
    await onClaim(sc);
    setLoading(false);
  };

  const handleUnclaim = async () => {
    setLoading(true);
    await onUnclaim();
    setLoading(false);
  };

  return (
    <div
      className={`rounded-xl p-4 shadow-sm transition ${
        iClaimedThis
          ? "bg-white ring-2 ring-blue-400"
          : isFull
            ? "bg-gray-100 opacity-60"
            : "bg-white"
      }`}
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
          <div className="flex flex-wrap items-center gap-1">
            {claimers.map((c) => (
              <span
                key={c.id}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: c.color }}
              >
                {c.name}
              </span>
            ))}
            {splitCount > 1 && (
              <span className="text-xs text-gray-400">
                {claimers.length}/{splitCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isFull && (
      <div className="mt-3 flex flex-wrap gap-2">
        {loading ? (
          <span className="text-sm text-gray-400">Updating...</span>
        ) : iClaimedThis ? (
          <button
            onClick={handleUnclaim}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            Unclaim
          </button>
        ) : (
          <>
            <button
              onClick={() => handleClaim(isClaimed ? splitCount : 1)}
              className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
            >
              {isClaimed ? "Join split" : "Claim"}
            </button>
            {!isClaimed && (
              <button
                onClick={() => setShowSplitOptions(!showSplitOptions)}
                className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Split...
              </button>
            )}
          </>
        )}
      </div>
      )}

      {/* Split options — always show 2-way through 8-way */}
      {showSplitOptions && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button
              key={n}
              onClick={() => handleClaim(n)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
            >
              {n}-way
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
