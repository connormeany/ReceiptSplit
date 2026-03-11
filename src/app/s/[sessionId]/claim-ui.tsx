"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { joinSession } from "@/actions/join-session";
import { claimItem, unclaimItem, claimMultipleItems, markDone } from "@/actions/claim-item";
import { confirmReview } from "@/actions/confirm-review";
import { ItemCard } from "@/components/item-card";
import { VenmoButton } from "@/components/venmo-button";
import { calculateSplit, type ClaimWithItem } from "@/lib/calc";
import { QRCodeSVG } from "qrcode.react";

interface Session {
  id: string;
  subtotal: number;
  tax: number;
  total: number;
  tip_amount: number;
  host_venmo: string | null;
  image_url: string | null;
  restaurant_name: string | null;
  group_size: number | null;
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
  is_done: boolean;
}

interface Claim {
  id: string;
  item_id: string;
  person_id: string;
  split_count: number;
  custom_amount: number | null;
  custom_fraction: string | null;
}

type Step = "review" | "join" | "claim" | "done";

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
  const [session, setSession] = useState(initialSession);
  const [items, setItems] = useState(initialItems);
  const [people, setPeople] = useState(initialPeople);
  const [claims, setClaims] = useState(initialClaims);
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [step, setStepRaw] = useState<Step>("join");
  const [copied, setCopied] = useState(false);

  // Push browser history when navigating between steps
  const setStep = useCallback((newStep: Step) => {
    setStepRaw(newStep);
    window.history.pushState({ step: newStep }, "");
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state?.step) {
        setStepRaw(e.state.step);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Review state — prices stored as strings for clean editing
  const [reviewItems, setReviewItems] = useState(
    initialItems.map((item, i) => ({ ...item, priceStr: item.price.toFixed(2), sort_order: i }))
  );
  const [reviewTaxStr, setReviewTaxStr] = useState(initialSession.tax.toFixed(2));
  const [reviewTipStr, setReviewTipStr] = useState(initialSession.tip_amount.toFixed(2));
  const [reviewRestaurant, setReviewRestaurant] = useState(initialSession.restaurant_name || "");
  const [confirming, setConfirming] = useState(false);

  const reviewTax = parseFloat(reviewTaxStr) || 0;
  const reviewTip = parseFloat(reviewTipStr) || 0;

  const currentPerson = people.find((p) => p.id === currentPersonId);
  const isHost = currentPerson?.is_host ?? false;

  // Restore person ID from localStorage (only on mount)
  useEffect(() => {
    const stored = localStorage.getItem(`person-${session.id}`);
    if (stored) {
      setCurrentPersonId(stored);
      const person = initialPeople.find((p) => p.id === stored);
      // Auto-show review if host and no tip (likely pre-tip receipt photo), but not if already reviewed
      const hasReviewed = localStorage.getItem(`reviewed-${session.id}`);
      const missingTipOrTax = !initialSession.tip_amount || !initialSession.tax;
      const initialStep = person?.is_host && missingTipOrTax && !hasReviewed ? "review" : "claim";
      setStepRaw(initialStep);
      window.history.replaceState({ step: initialStep }, "");
    } else {
      window.history.replaceState({ step: "join" }, "");
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

  const handleClaim = async (itemId: string, splitCount: number, customAmount?: number, customFraction?: string) => {
    if (!currentPersonId) return;
    try {
      await claimItem(itemId, currentPersonId, splitCount, customAmount, customFraction);
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

  // Calculate all people's totals
  const getAllTotals = () => {
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const claimsWithItems: ClaimWithItem[] = claims
      .map((c) => {
        const item = itemMap.get(c.item_id);
        if (!item) return null;
        return {
          item_id: c.item_id,
          person_id: c.person_id,
          split_count: c.split_count,
          custom_amount: c.custom_amount,
          custom_fraction: c.custom_fraction,
          item_price: item.price,
          item_name: item.name,
        };
      })
      .filter((c): c is ClaimWithItem => c !== null);

    return calculateSplit(
      claimsWithItems,
      people,
      session.subtotal,
      session.tax,
      session.tip_amount
    );
  };

  const getMyTotal = () => {
    if (!currentPersonId) return null;
    return getAllTotals().find((t) => t.person_id === currentPersonId) || null;
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

  // Review step: host verifies parsed items
  if (step === "review") {
    const reviewItemsSum = reviewItems.reduce((sum, item) => sum + (parseFloat(item.priceStr) || 0), 0);

    const handleConfirmReview = async () => {
      setConfirming(true);
      try {
        const itemsForSave = reviewItems.map((item) => ({ ...item, price: parseFloat(item.priceStr) || 0 }));
        const computedSubtotal = itemsForSave.reduce((sum, item) => sum + item.price, 0);
        const computedTotal = computedSubtotal + reviewTax + reviewTip;
        await confirmReview(
          session.id,
          itemsForSave,
          Math.round(computedSubtotal * 100) / 100,
          reviewTax,
          reviewTip,
          Math.round(computedTotal * 100) / 100,
          reviewRestaurant
        );
        // Mark as reviewed so we don't auto-show review again
        localStorage.setItem(`reviewed-${session.id}`, "true");
        // Update local state and go to claim screen
        setSession((s) => ({
          ...s,
          subtotal: Math.round(computedSubtotal * 100) / 100,
          tax: reviewTax,
          tip_amount: reviewTip,
          total: Math.round(computedTotal * 100) / 100,
          restaurant_name: reviewRestaurant || null,
          status: "active",
        }));
        // Reload to get new item IDs from the database
        window.location.reload();
      } catch {
        alert("Failed to save changes. Please try again.");
        setConfirming(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 pb-32">
        <div className="sticky top-0 z-10 border-b bg-white px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-lg items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Review Receipt</h1>
              <p className="text-sm text-gray-500">
                Check the parsed items and fix any errors
              </p>
            </div>
            <button
              onClick={() => setStep("claim")}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Back
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 py-4 space-y-4">
          {/* Restaurant name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Restaurant
            </label>
            <input
              type="text"
              value={reviewRestaurant}
              onChange={(e) => setReviewRestaurant(e.target.value)}
              placeholder="Restaurant name"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* View receipt link */}
          {session.image_url && (
            <a
              href={session.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              View Original Receipt
            </a>
          )}

          {/* Items */}
          <div>
            <div className="mb-2">
              <label className="text-sm font-medium text-gray-700">
                Items
              </label>
            </div>
            <div className="space-y-2">
              {reviewItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...reviewItems];
                      updated[index] = { ...updated[index], name: e.target.value };
                      setReviewItems(updated);
                    }}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex items-center">
                    <span className="text-sm text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.priceStr}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                          const updated = [...reviewItems];
                          updated[index] = { ...updated[index], priceStr: val };
                          setReviewItems(updated);
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        const updated = [...reviewItems];
                        updated[index] = { ...updated[index], priceStr: (parseFloat(item.priceStr) || 0).toFixed(2) };
                        setReviewItems(updated);
                      }}
                      className="w-20 rounded border border-gray-200 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setReviewItems(reviewItems.filter((_, i) => i !== index));
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Remove item"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setReviewItems([
                  ...reviewItems,
                  { id: undefined, name: "", price: 0, priceStr: "0.00", quantity: 1, sort_order: reviewItems.length } as any,
                ]);
              }}
              className="mt-2 w-full rounded-lg border-2 border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600"
            >
              + Add item
            </button>
          </div>

          {/* Totals */}
          <div className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-600">Subtotal</label>
              <span className="text-sm text-gray-900">${reviewItemsSum.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-600">Tax</label>
              <div className="flex items-center">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={reviewTaxStr}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                      setReviewTaxStr(val);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => setReviewTaxStr((parseFloat(reviewTaxStr) || 0).toFixed(2))}
                  className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-600">Tip</label>
              <div className="flex items-center">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={reviewTipStr}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                      setReviewTipStr(val);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => setReviewTipStr((parseFloat(reviewTipStr) || 0).toFixed(2))}
                  className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {[15, 18, 20, 25].map((pct) => {
                const tipVal = Math.round(reviewItemsSum * pct) / 100;
                const isActive = Math.abs(reviewTip - tipVal) < 0.01;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setReviewTipStr(tipVal.toFixed(2))}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      isActive
                        ? "border-blue-400 bg-blue-50 text-blue-600"
                        : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <label className="text-sm font-medium text-gray-900">Total</label>
              <span className="text-sm font-medium text-gray-900">
                ${(reviewItemsSum + reviewTax + reviewTip).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Fixed bottom confirm button */}
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
          <div className="mx-auto max-w-lg">
            <button
              onClick={handleConfirmReview}
              disabled={confirming || reviewItems.length === 0}
              className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {confirming ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </span>
              ) : (
                "Looks Good — Start Splitting"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Join (friends only — host skips this)
  if (step === "join") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-1 text-2xl font-bold text-gray-900">
            Split Split
          </h1>
          {session.restaurant_name && (
            <p className="mb-1 text-lg font-medium text-gray-700">{session.restaurant_name}</p>
          )}
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
    const allTotals = getAllTotals();
    const myTotal = allTotals.find((t) => t.person_id === currentPersonId) || null;
    const otherTotals = allTotals.filter(
      (t) => t.person_id !== currentPersonId && t.items.length > 0
    );

    const PersonBreakdown = ({ total, label }: { total: typeof allTotals[0]; label?: string }) => {
      const person = people.find((p) => p.id === total.person_id);
      return (
        <div className="text-left">
          {label ? (
            <p className="mb-2 text-sm font-medium text-gray-500">{label}</p>
          ) : person && (
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: person.color }}
              />
              <span className="text-sm font-medium text-gray-700">{person.name}</span>
            </div>
          )}
          <ul className="space-y-1 text-sm text-gray-600">
            {total.items.map((item, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {item.name}
                  {item.custom_fraction ? (
                    <span className="ml-1 text-gray-400">({item.custom_fraction})</span>
                  ) : item.custom_amount != null ? (
                    <span className="ml-1 text-gray-400">(custom)</span>
                  ) : item.split_count > 1 ? (
                    <span className="ml-1 text-gray-400">(1/{item.split_count})</span>
                  ) : null}
                </span>
                <span>${item.share.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t pt-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>${total.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax</span><span>${total.taxShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tip</span><span>${total.tipShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 font-bold text-gray-900">
              <span>Total</span><span>${total.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      );
    };

    // Host done screen — show share link
    if (isHost) {
      return (
        <div className="min-h-screen bg-gray-50 px-4 py-8">
          <div className="mx-auto w-full max-w-sm space-y-4">
            <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                All set!
              </h1>
              <p className="mb-6 text-gray-500">
                Send this link to your friends so they can claim their items and pay you.
              </p>
              <div className="mb-4 flex justify-center">
                <QRCodeSVG
                  value={typeof window !== "undefined" ? window.location.href : ""}
                  size={160}
                  level="M"
                />
              </div>
              <div className="mb-4 flex gap-2">
                {typeof navigator !== "undefined" && navigator.share && (
                  <button
                    onClick={() => {
                      navigator.share({
                        title: `${session.restaurant_name || "Split Split"} — claim your items`,
                        url: window.location.href,
                      }).catch(() => {});
                    }}
                    className="flex-1 rounded-lg bg-blue-500 py-3 font-semibold text-white transition hover:bg-blue-600"
                  >
                    Share Link
                  </button>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <button
                onClick={() => setStep("claim")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Back to items
              </button>

              {myTotal && myTotal.items.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <PersonBreakdown total={myTotal} label="Your share" />
                </div>
              )}
            </div>

            {/* Everyone's breakdowns */}
            {otherTotals.length > 0 && (
              <div className="rounded-2xl bg-white p-6 shadow-lg">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">Everyone&apos;s totals</h2>
                <div className="space-y-5">
                  {otherTotals.map((total) => (
                    <PersonBreakdown key={total.person_id} total={total} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Friend done screen — show summary + Venmo button
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto w-full max-w-sm space-y-4">
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <h1 className="mb-1 text-2xl font-bold text-gray-900">
              Your total
            </h1>
            {session.restaurant_name && (
              <p className="mb-2 text-sm text-gray-500">{session.restaurant_name}</p>
            )}

            {myTotal && myTotal.items.length > 0 ? (
              <>
                <PersonBreakdown total={myTotal} />

                <div className="mt-4">
                  {session.host_venmo && (
                    <VenmoButton
                      venmoUsername={session.host_venmo}
                      amount={myTotal.total}
                      note={`${session.restaurant_name || "Split Split"} - ${currentPerson?.name}`}
                    />
                  )}
                </div>
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

          {/* Everyone's breakdowns */}
          {otherTotals.length > 0 && (
            <div className="rounded-2xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">Everyone&apos;s totals</h2>
              <div className="space-y-5">
                {otherTotals.map((total) => (
                  <PersonBreakdown key={total.person_id} total={total} />
                ))}
              </div>
            </div>
          )}
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
            <h1 className="text-lg font-bold text-gray-900">
              {session.restaurant_name || "Split Split"}
            </h1>
            <p className="text-sm text-gray-500">
              Claim your items, {currentPerson?.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session.image_url && (
              <button
                onClick={() => window.open(session.image_url!, "_blank")}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                View Receipt
              </button>
            )}
            {isHost && (
              <button
                onClick={() => {
                  setReviewItems(items.map((item, i) => ({ ...item, priceStr: item.price.toFixed(2), sort_order: i })));
                  setReviewTaxStr(session.tax.toFixed(2));
                  setReviewTipStr(session.tip_amount.toFixed(2));
                  setReviewRestaurant(session.restaurant_name || "");
                  setStep("review");
                }}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Edit Items
              </button>
            )}
            <span
              className="rounded-full px-3 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: currentPerson?.color }}
            >
              {currentPerson?.name}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-4">
        {/* People bar */}
        <div className="mb-4 flex flex-wrap gap-2">
          {people.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.is_done && (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {p.name}
              {p.is_host && " (host)"}
            </span>
          ))}
        </div>

        {/* Quick actions */}
        {(() => {
          const unclaimedByMe = items.filter((item) => !claims.some((c) => c.item_id === item.id && c.person_id === currentPersonId));
          const hasUnclaimed = unclaimedByMe.length > 0;
          const showSplitAll = session.group_size && session.group_size >= 2;
          if (!hasUnclaimed || !showSplitAll || !isHost) return null;
          return (
            <div className="mb-3">
              <button
                onClick={async () => {
                  if (!currentPersonId) return;
                  const toSplit = unclaimedByMe.map((item) => ({
                    itemId: item.id,
                    splitCount: session.group_size!,
                  }));
                  await claimMultipleItems(toSplit, currentPersonId);
                  await refreshClaims();
                }}
                className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Split all {session.group_size}-way
              </button>
            </div>
          );
        })()}

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
                groupSize={session.group_size}
                onClaim={(splitCount, customAmount, customFraction) => handleClaim(item.id, splitCount, customAmount, customFraction)}
                onUnclaim={() => handleUnclaim(item.id)}
              />
            );
          })}
        </div>

        {/* Receipt totals reference */}
        <div className="mt-4 space-y-1 rounded-xl bg-white p-4 shadow-sm text-sm text-gray-500">
          <div className="flex justify-between">
            <span>Subtotal</span><span>${session.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span><span>${session.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tip</span><span>${session.tip_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium text-gray-900">
            <span>Total</span><span>${session.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Fixed bottom Done button */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
        <div className="mx-auto max-w-lg">
          {myClaims.length > 0 && (() => {
            const myTotal = getMyTotal();
            return myTotal && myTotal.total > 0 ? (
              <p className="mb-2 text-center text-sm text-gray-500">
                Your total: <span className="font-semibold text-gray-900">${myTotal.total.toFixed(2)}</span>
              </p>
            ) : null;
          })()}
          <button
            onClick={async () => {
              if (currentPersonId) {
                try { await markDone(currentPersonId); } catch {}
              }
              setStep("done");
            }}
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
