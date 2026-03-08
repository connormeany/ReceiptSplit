"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { joinSession } from "@/actions/join-session";
import { claimItem, unclaimItem } from "@/actions/claim-item";
import { ItemCard } from "@/components/item-card";
import { VenmoButton } from "@/components/venmo-button";
import { calculateSplit, type ClaimWithItem } from "@/lib/calc";

interface Session {
  id: string;
  subtotal: number;
  tax: number;
  total: number;
  tip_amount: number;
  host_venmo: string | null;
  status: string;
}

interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Person {
  id: string;
  name: string;
  color: string;
  is_host: boolean;
}

interface Claim {
  id: string;
  item_id: string;
  person_id: string;
  split_count: number;
}

type Step = "join" | "claim" | "done";

export function ClaimUI({
  session: initialSession,
  initialItems,
  initialPeople,
  initialClaims,
}: {
  session: Session;
  initialItems: Item[];
  initialPeople: Person[];
  initialClaims: Claim[];
}) {
  const [session] = useState(initialSession);
  const [items] = useState(initialItems);
  const [people, setPeople] = useState(initialPeople);
  const [claims, setClaims] = useState(initialClaims);
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [step, setStep] = useState<Step>("join");
  const [copied, setCopied] = useState(false);

  const currentPerson = people.find((p) => p.id === currentPersonId);
  const isHost = currentPerson?.is_host ?? false;

  // Restore person ID from localStorage (only on mount)
  useEffect(() => {
    const stored = localStorage.getItem(`person-${session.id}`);
    if (stored) {
      setCurrentPersonId(stored);
      setStep("claim");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Realtime subscriptions
  const refreshClaims = useCallback(async () => {
    const supabase = getSupabaseClient();
    const itemIds = items.map((i) => i.id);
    if (itemIds.length === 0) return;
    const { data } = await supabase
      .from("claims")
      .select("*")
      .in("item_id", itemIds);
    if (data) setClaims(data);
  }, [items]);

  const refreshPeople = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("people")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at");
    if (data) setPeople(data);
  }, [session.id]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    const claimsChannel = supabase
      .channel("claims-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claims" },
        () => refreshClaims()
      )
      .subscribe();

    const peopleChannel = supabase
      .channel("people-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "people" },
        () => refreshPeople()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(claimsChannel);
      supabase.removeChannel(peopleChannel);
    };
  }, [refreshClaims, refreshPeople]);

  const handleJoin = async () => {
    if (!nameInput.trim()) return;
    setJoining(true);
    try {
      const person = await joinSession(session.id, nameInput);
      setCurrentPersonId(person.id);
      localStorage.setItem(`person-${session.id}`, person.id);
      setPeople((prev) => [...prev, person]);
      setStep("claim");
    } catch {
      alert("Failed to join. Please try again.");
    }
    setJoining(false);
  };

  const handleClaim = async (itemId: string, splitCount: number) => {
    if (!currentPersonId) return;
    try {
      await claimItem(itemId, currentPersonId, splitCount);
      await refreshClaims();
    } catch {
      alert("Failed to claim item.");
    }
  };

  const handleUnclaim = async (itemId: string) => {
    if (!currentPersonId) return;
    try {
      await unclaimItem(itemId, currentPersonId);
      await refreshClaims();
    } catch {
      alert("Failed to unclaim item.");
    }
  };

  // Calculate current person's total
  const getMyTotal = () => {
    if (!currentPersonId) return null;
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
    return totals.find((t) => t.person_id === currentPersonId) || null;
  };

  const myClaims = claims.filter((c) => c.person_id === currentPersonId);

  if (session.status === "parsing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-lg text-gray-600">Parsing receipt...</p>
        </div>
      </div>
    );
  }

  // Step 1: Join (friends only — host skips this)
  if (step === "join") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            ReceiptSplit
          </h1>
          <p className="mb-6 text-gray-500">
            {items.length} items &middot; ${session.total?.toFixed(2)} total
          </p>
          {people.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-sm text-gray-500">Already joined:</p>
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full px-3 py-1 text-sm font-medium text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name}
                    {p.is_host && " (host)"}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
            <button
              onClick={handleJoin}
              disabled={joining || !nameInput.trim()}
              className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {joining ? "Joining..." : "Join"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Done
  if (step === "done") {
    const myTotal = getMyTotal();

    // Host done screen — show share link
    if (isHost) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              All set!
            </h1>
            <p className="mb-6 text-gray-500">
              Send this link to your friends so they can claim their items and pay you.
            </p>
            <div className="mb-4 rounded-lg bg-gray-50 p-3">
              <p className="break-all text-sm text-gray-700">
                {typeof window !== "undefined" ? window.location.href : ""}
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mb-4 w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => setStep("claim")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back to items
            </button>

            {myTotal && myTotal.items.length > 0 && (
              <div className="mt-6 border-t pt-4 text-left">
                <p className="mb-2 text-sm font-medium text-gray-500">Your share</p>
                <ul className="space-y-1 text-sm text-gray-600">
                  {myTotal.items.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {item.name}
                        {item.split_count > 1 && (
                          <span className="ml-1 text-gray-400">(1/{item.split_count})</span>
                        )}
                      </span>
                      <span>${item.share.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span><span>${myTotal.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tax</span><span>${myTotal.taxShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tip</span><span>${myTotal.tipShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-lg font-bold text-gray-900">
                    <span>Your total</span><span>${myTotal.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Friend done screen — show summary + Venmo button
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            Your total
          </h1>

          {myTotal && myTotal.items.length > 0 ? (
            <>
              <ul className="mb-4 space-y-1 text-sm text-gray-600">
                {myTotal.items.map((item, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {item.name}
                      {item.split_count > 1 && (
                        <span className="ml-1 text-gray-400">(1/{item.split_count})</span>
                      )}
                    </span>
                    <span>${item.share.toFixed(2)}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-6 space-y-1 border-t pt-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span><span>${myTotal.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Tax</span><span>${myTotal.taxShare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Tip</span><span>${myTotal.tipShare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 text-lg font-bold text-gray-900">
                  <span>Total</span><span>${myTotal.total.toFixed(2)}</span>
                </div>
              </div>

              {session.host_venmo && (
                <VenmoButton
                  venmoUsername={session.host_venmo}
                  amount={myTotal.total}
                  note={`ReceiptSplit - ${currentPerson?.name}`}
                />
              )}
            </>
          ) : (
            <p className="mb-6 text-gray-500">You haven&apos;t claimed any items.</p>
          )}

          <button
            onClick={() => setStep("claim")}
            className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Back to items
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Claim items
  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">ReceiptSplit</h1>
            <p className="text-sm text-gray-500">
              Claim your items, {currentPerson?.name}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-sm font-medium text-white"
            style={{ backgroundColor: currentPerson?.color }}
          >
            {currentPerson?.name}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-4">
        {/* People bar */}
        <div className="mb-4 flex flex-wrap gap-2">
          {people.map((p) => (
            <span
              key={p.id}
              className="rounded-full px-3 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.name}
              {p.is_host && " (host)"}
            </span>
          ))}
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map((item) => {
            const itemClaims = claims.filter((c) => c.item_id === item.id);
            const myClaim = itemClaims.find(
              (c) => c.person_id === currentPersonId
            );

            return (
              <ItemCard
                key={item.id}
                item={item}
                claims={itemClaims}
                people={people}
                myClaim={myClaim || null}
                onClaim={(splitCount) => handleClaim(item.id, splitCount)}
                onUnclaim={() => handleUnclaim(item.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Fixed bottom Done button */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => setStep("done")}
            disabled={myClaims.length === 0}
            className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            Done ({myClaims.length} item{myClaims.length !== 1 ? "s" : ""} claimed)
          </button>
        </div>
      </div>
    </div>
  );
}
