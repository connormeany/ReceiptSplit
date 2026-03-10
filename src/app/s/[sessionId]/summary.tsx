"use client";

import { calculateSplit, type ClaimWithItem } from "@/lib/calc";
import { VenmoButton } from "@/components/venmo-button";

interface SummaryProps {
  session: {
    id: string;
    subtotal: number;
    tax: number;
    tip_amount: number;
    host_venmo: string | null;
  };
  items: { id: string; name: string; price: number }[];
  people: { id: string; name: string; color: string; is_host: boolean }[];
  claims: { id: string; item_id: string; person_id: string; split_count: number }[];
  currentPersonId: string;
}

export function Summary({ session, items, people, claims, currentPersonId }: SummaryProps) {
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const claimsWithItems: ClaimWithItem[] = claims
    .map((c) => {
      const item = itemMap.get(c.item_id);
      if (!item) return null;
      return {
        item_id: c.item_id,
        person_id: c.person_id,
        split_count: c.split_count,
        item_price: item.price,
        item_name: item.name,
      };
    })
    .filter((c): c is ClaimWithItem => c !== null);

  const totals = calculateSplit(
    claimsWithItems,
    people,
    session.subtotal,
    session.tax,
    session.tip_amount
  );

  // Check for unclaimed items
  const claimedItemIds = new Set(claims.map((c) => c.item_id));
  const unclaimedItems = items.filter((i) => !claimedItemIds.has(i.id));

  // Show current person first, then others
  const sortedTotals = [...totals].sort((a, b) => {
    if (a.person_id === currentPersonId) return -1;
    if (b.person_id === currentPersonId) return 1;
    return 0;
  });

  return (
    <div className="space-y-4">
      {unclaimedItems.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 font-medium text-amber-800">
            {unclaimedItems.length} unclaimed item{unclaimedItems.length > 1 ? "s" : ""}
          </p>
          <ul className="text-sm text-amber-700">
            {unclaimedItems.map((item) => (
              <li key={item.id}>
                {item.name} &mdash; ${item.price.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sortedTotals.map((person) => {
        const personData = people.find((p) => p.id === person.person_id);
        const isHost = personData?.is_host ?? false;
        const isMe = person.person_id === currentPersonId;
        // Show Venmo button: the current user is NOT the host, and this is their own card
        const showVenmo = isMe && !isHost && session.host_venmo;

        return (
          <div
            key={person.person_id}
            className={`rounded-xl bg-white p-4 shadow-sm ${isMe ? "ring-2 ring-blue-400" : ""}`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: personData?.color }}
              />
              <span className="font-semibold text-gray-900">
                {person.person_name}
                {isHost && <span className="ml-1 text-sm font-normal text-gray-400">(host)</span>}
                {isMe && <span className="ml-1 text-sm font-normal text-blue-500">(you)</span>}
              </span>
            </div>

            {person.items.length > 0 ? (
              <>
                <ul className="mb-3 space-y-1 text-sm text-gray-600">
                  {person.items.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {item.name}
                        {item.split_count > 1 && (
                          <span className="ml-1 text-gray-400">
                            (1/{item.split_count})
                          </span>
                        )}
                      </span>
                      <span>${item.share.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1 border-t pt-2 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>${person.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tax</span>
                    <span>${person.taxShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tip</span>
                    <span>${person.tipShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-lg font-bold text-gray-900">
                    <span>Total</span>
                    <span>${person.total.toFixed(2)}</span>
                  </div>
                </div>

                {showVenmo && (
                  <div className="mt-3">
                    <VenmoButton
                      venmoUsername={session.host_venmo!}
                      amount={person.total}
                      note={`Split Split - ${person.person_name}`}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No items claimed yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
