"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { joinSession } from "@/actions/join-session";
import { claimItem, unclaimItem } from "@/actions/claim-item";
import { confirmReview } from "@/actions/confirm-review";
import { ItemCard } from "@/components/item-card";
import { VenmoButton } from "@/components/venmo-button";
import { calculateSplit, type ClaimWithItem } from "@/lib/calc";
import { QRCodeSVG } from "qrcode.react";

import type { Database } from "@/lib/supabase/database.types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];
type Item = Database["public"]["Tables"]["items"]["Row"];
type Person = Database["public"]["Tables"]["people"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];

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
  const [items] = useState(initialItems);
  const [people, setPeople] = useState(initialPeople);
  const [claims, setClaims] = useState(initialClaims);
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [step, setStepRaw] = useState<Step>("join");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

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

  // Review state
  const [reviewItems, setReviewItems] = useState(
    initialItems.map((item, i) => ({ ...item, sort_order: item.sort_order ?? i }))
  );
  const [reviewTaxStr, setReviewTaxStr] = useState((initialSession.tax || 0).toFixed(2));
  const [reviewTipStr, setReviewTipStr] = useState((initialSession.tip_amount || 0).toFixed(2));
  const [reviewMiscFee, setReviewMiscFee] = useState(initialSession.misc_fee || 0);
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
      // Auto-show review if host and no tip (likely pre-tip receipt photo)
      const missingTipOrTax = !initialSession.tip_amount || !initialSession.tax;
      const hasReviewed = localStorage.getItem(`reviewed-${session.id}`) === "true";
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
    const itemIds = items.map((i) => i.id);

    let channel = supabase.channel(`session-${session.id}`);

    channel = channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` },
      (payload) => {
        if (payload.new && payload.new.status === "active" && session.status === "parsing") {
          window.location.reload();
        } else if (payload.new && payload.new.status === "error" && session.status === "parsing") {
          alert("Failed to parse the receipt. Please try again.");
          window.location.href = "/";
        }
      }
    );

    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "people", filter: `session_id=eq.${session.id}` },
      () => refreshPeople()
    );

    // Fallback polling for session status in case realtime is not enabled for 'sessions' table
    let pollInterval: NodeJS.Timeout | null = null;
    if (session.status === "parsing") {
      pollInterval = setInterval(async () => {
        const { data } = await supabase
          .from("sessions")
          .select("status")
          .eq("id", session.id)
          .single();
        if (data?.status === "active") {
          window.location.reload();
        } else if (data?.status === "error") {
          alert("Failed to parse the receipt. Please try again.");
          window.location.href = "/";
        }
      }, 2000);
    }

    if (itemIds.length > 0) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claims", filter: `item_id=in.(${itemIds.join(",")})` },
        () => refreshClaims()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [refreshClaims, refreshPeople, session.id, items, session.status]);

  const handleJoin = async () => {
    if (!nameInput.trim()) return;
    setJoining(true);
    try {
      const person = await joinSession(session.id, nameInput);
      setCurrentPersonId(person.id);
      localStorage.setItem(`person-${session.id}`, person.id);
      setPeople((prev) => [...prev, {
      id: person.id,
      session_id: session.id,
      name: person.name,
      color: person.color,
      is_host: person.is_host,
      is_done: person.is_done,
      created_at: null,
    }]);
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
        const item = c.item_id ? itemMap.get(c.item_id) : undefined;
        if (!item) return null;
        return {
          item_id: c.item_id!,
          person_id: c.person_id!,
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
      session.subtotal || 0,
      session.tax || 0,
      session.tip_amount || 0,
      session.misc_fee || 0
    );
  };

  const myClaims = claims.filter((c) => c.person_id === currentPersonId);

  if (session.status === "parsing") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-foreground/60 animate-pulse">
            Parsing Receipt...
          </p>
        </div>
      </div>
    );
  }

  // Review step: host verifies parsed items
  if (step === "review") {
    const reviewItemsSum = reviewItems.reduce((sum, item) => sum + item.price, 0);

    const handleConfirmReview = async () => {
      setConfirming(true);
      try {
        const computedSubtotal = reviewItems.reduce((sum, item) => sum + item.price, 0);
        const computedTotal = computedSubtotal + reviewTax + reviewTip + reviewMiscFee;
        await confirmReview(
          session.id,
          reviewItems,
          Math.round(computedSubtotal * 100) / 100,
          reviewTax,
          reviewTip,
          reviewMiscFee,
          Math.round(computedTotal * 100) / 100,
          reviewRestaurant
        );
        localStorage.setItem(`reviewed-${session.id}`, "true");
        setSession((s) => ({
          ...s,
          subtotal: Math.round(computedSubtotal * 100) / 100,
          tax: reviewTax,
          tip_amount: reviewTip,
          misc_fee: reviewMiscFee,
          total: Math.round(computedTotal * 100) / 100,
          restaurant_name: reviewRestaurant || null,
          status: "active",
        }));
        window.location.reload();
      } catch {
        alert("Failed to save changes. Please try again.");
        setConfirming(false);
      }
    };

    return (
      <div className="min-h-screen pb-32">
        <div className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-sm px-4 py-4 shadow-sm">
          <div className="mx-auto flex max-w-lg items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground ">Review Receipt</h1>
            </div>
            <button
              onClick={() => setStep("claim")}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-background transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-foreground/60">
              Restaurant Name
            </label>
            <input
              type="text"
              value={reviewRestaurant}
              onChange={(e) => setReviewRestaurant(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {session.image_url && (
              <a
                href={session.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-xs font-medium text-foreground/70 underline hover:text-foreground"
              >
                View Original Receipt
              </a>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 border-b border-border pb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
                Items List
              </label>
            </div>
            <div className="space-y-3">
              {reviewItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...reviewItems];
                      const currentItem = updated[i];
                      if (currentItem) {
                        updated[i] = { ...currentItem, name: e.target.value };
                        setReviewItems(updated);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="relative flex w-24 items-center">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-foreground/60">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => {
                        const updated = [...reviewItems];
                        const currentItem = updated[i];
                        if (currentItem) {
                          updated[i] = { ...currentItem, price: parseFloat(e.target.value) || 0 };
                          setReviewItems(updated);
                        }
                      }}
                      className="w-full rounded-md border border-border bg-surface pl-6 pr-2 py-1.5 text-right font-mono text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setReviewItems(reviewItems.filter((_, itemIndex) => itemIndex !== i));
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/50 hover:bg-red-50 hover:text-red-600"
                    title="Remove item"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  { id: undefined as unknown as string, name: "", price: 0, quantity: 1, sort_order: reviewItems.length } as unknown as Item & { sort_order: number },
                ]);
              }}
              className="mt-4 w-full rounded-md border border-dashed border-border py-2.5 text-sm font-medium text-foreground/70 hover:border-border/50 hover:bg-background transition-colors"
            >
              + Add Item
            </button>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <label className="text-sm font-medium text-foreground/70">Subtotal</label>
              <span className="font-mono text-sm font-medium text-foreground">${reviewItemsSum.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <label className="text-sm font-medium text-foreground/70">Tax</label>
              <div className="relative flex w-24 items-center">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-foreground/60">$</span>
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
                  className="w-full rounded-md border border-border bg-surface pl-6 pr-2 py-1 text-right font-mono text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <label className="text-sm font-medium text-foreground/70">Tip</label>
              <div className="relative flex w-24 items-center">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-foreground/60">$</span>
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
                  className="w-full rounded-md border border-border bg-surface pl-6 pr-2 py-1 text-right font-mono text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <label className="text-sm font-medium text-foreground/70">Misc Fee</label>
              <div className="relative flex w-24 items-center">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-foreground/60">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={reviewMiscFee}
                  onChange={(e) => setReviewMiscFee(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-border bg-surface pl-6 pr-2 py-1 text-right font-mono text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="text-base font-bold text-foreground">Total</label>
              <span className="font-mono text-base font-bold text-foreground">
                ${(reviewItemsSum + reviewTax + reviewTip + reviewMiscFee).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe">
          <div className="mx-auto max-w-lg">
            <button
              onClick={handleConfirmReview}
              disabled={confirming || reviewItems.length === 0}
              className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {confirming ? "Saving..." : "Save & Start Splitting"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Join
  if (step === "join") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground ">
              Split <span className="text-foreground/40">Split</span>
            </h1>
            {session.restaurant_name && (
              <p className="mt-1 text-sm font-medium text-foreground/70">
                {session.restaurant_name}
              </p>
            )}
            <p className="mt-1 text-xs text-foreground/60">
              Items: {items.length} &middot; Total: ${session.total?.toFixed(2)}
            </p>
          </div>

          {people.length > 0 && (
            <div className="mb-8 rounded-lg bg-background p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">Joined</p>
              <div className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground/80"
                  >
                    {p.name}
                    {p.is_host && " (*)"}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground/80">
                Your Name
              </label>
              <input
                type="text"
                placeholder="Name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={joining || !nameInput.trim()}
              className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {joining ? "Joining..." : "Join Split"}
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
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          {label ? (
            <p className="mb-4 border-b border-border/50 pb-3 text-sm font-bold text-foreground">{label}</p>
          ) : person && (
            <div className="mb-4 border-b border-border/50 pb-3">
              <span className="text-sm font-bold text-foreground">{person.name}</span>
            </div>
          )}
          <ul className="space-y-2 text-sm text-foreground/80">
            {total.items.map((item, i) => (
              <li key={i} className="flex justify-between items-end border-b border-border/50 border-dashed pb-1">
                <span>
                  {item.name}
                  {item.custom_fraction ? (
                    <span className="ml-1 text-xs text-foreground/50">({item.custom_fraction})</span>
                  ) : item.custom_amount != null ? (
                    <span className="ml-1 text-xs text-foreground/50">(cust)</span>
                  ) : item.split_count > 1 ? (
                    <span className="ml-1 text-xs text-foreground/50">(1/{item.split_count})</span>
                  ) : null}
                </span>
                <span className="font-mono font-medium">${item.share.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5 text-sm text-foreground/70">
            <div className="flex justify-between">
              <span>Subtotal</span><span className="font-mono">${total.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span><span className="font-mono">${total.taxShare.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tip</span><span className="font-mono">${total.tipShare.toFixed(2)}</span>
            </div>
            {total.miscFeeShare > 0 && (
              <div className="flex justify-between">
                <span>Misc Fee</span><span className="font-mono">${total.miscFeeShare.toFixed(2)}</span>
              </div>
            )}
            <div className="mt-4 flex justify-between border-t border-border pt-3 text-base font-bold text-foreground">
              <span>Total</span><span className="font-mono">${total.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      );
    };

    if (isHost) {
      return (
        <div className="min-h-screen pb-32 px-4 py-8">
          <div className="mx-auto w-full max-w-md space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm text-center">
              <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground ">
                Finished
              </h1>
              <p className="mb-6 text-sm text-foreground/60">
                Distribute this link to your party
              </p>

              <div className="mb-5 rounded-md border border-border bg-background p-3">
                <p className="truncate font-mono text-xs font-medium text-foreground/80 text-left">
                  {typeof window !== "undefined" ? window.location.href.replace("receipt-split-iota.vercel.app", "split-split.com") : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href.replace("receipt-split-iota.vercel.app", "split-split.com"));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="mb-5 w-full rounded-md bg-primary py-3 text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-primary/90"
              >
                {copied ? "Copied Link!" : "Copy Link"}
              </button>

              <button
                onClick={() => setStep("claim")}
                className="text-xs font-medium text-foreground/60 underline hover:text-foreground transition-colors"
              >
                Back to items
              </button>

              {myTotal && myTotal.items.length > 0 && (
                <div className="mt-8 text-left">
                  <PersonBreakdown total={myTotal} label="Your Share" />
                </div>
              )}
            </div>

            {otherTotals.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-foreground pl-1">Ledger</h2>
                <div className="space-y-4">
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

    return (
      <div className="min-h-screen pb-32 px-4 py-8">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-foreground text-center ">
              Your Total
            </h1>
            {session.restaurant_name && (
              <p className="mb-6 text-sm font-medium text-foreground/60 text-center">
                {session.restaurant_name}
              </p>
            )}

            {myTotal && myTotal.items.length > 0 ? (
              <>
                <PersonBreakdown total={myTotal} />
                <div className="mt-6">
                  {session.host_venmo ? (
                    <div className="rounded-lg border border-[#008CFF]/20 bg-[#008CFF]/5 overflow-hidden">
                      <VenmoButton
                        venmoUsername={session.host_venmo}
                        amount={myTotal.total}
                        note={`${session.restaurant_name || "Split Split"} - ${currentPerson?.name}`}
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border border-dashed bg-background p-4 text-center">
                      <p className="text-xs font-medium text-foreground/60">No Venmo Provided</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-border border-dashed bg-background p-6 text-center">
                <p className="text-sm font-medium text-foreground/70">No items claimed.</p>
              </div>
            )}

            <div className="mt-6 text-center">
              <button
                onClick={() => setStep("claim")}
                className="text-xs font-medium text-foreground/60 underline hover:text-foreground transition-colors"
              >
                Back to items
              </button>
            </div>
          </div>

          {otherTotals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground pl-1">Ledger</h2>
              <div className="space-y-4">
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
    <div className="min-h-screen pb-32">
      <div className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-sm px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="min-w-0 pr-4">
            <h1 className="text-base font-bold text-foreground truncate ">
              {session.restaurant_name || (
                <>Split <span className="text-foreground/40">Split</span></>
              )}
            </h1>
            <p className="text-xs font-medium text-foreground/60 truncate">
              Name: {currentPerson?.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {session.image_url && (
              <button
                onClick={() => window.open(session.image_url!, "_blank")}
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-background transition-colors"
              >
                Receipt
              </button>
            )}
            <button
              onClick={() => setShowQR(true)}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-surface text-foreground/80 hover:bg-background transition-colors"
              title="Show QR Code"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </button>
            {isHost && (
              <button
                onClick={() => {
                  setReviewItems(items.map((item, i) => ({ ...item, sort_order: i })));
                  setReviewTaxStr((session.tax || 0).toFixed(2));
                  setReviewTipStr((session.tip_amount || 0).toFixed(2));
                  setReviewMiscFee(session.misc_fee || 0);
                  setReviewRestaurant(session.restaurant_name || "");
                  setStep("review");
                }}
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-background transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">Active Party</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <span
                key={p.id}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${p.id === currentPersonId ? "border-primary bg-primary text-surface" : "border-border bg-surface text-foreground/80"
                  }`}
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => {
            const itemClaims = claims.filter((c) => c.item_id === item.id);
            const myClaim = itemClaims.find((c) => c.person_id === currentPersonId);

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
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => setStep("done")}
            disabled={myClaims.length === 0}
            className="w-full rounded-md bg-primary py-3.5 text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            Finish ({myClaims.length} item{myClaims.length !== 1 ? "s" : ""} claimed)
          </button>
        </div>
      </div>

      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-6 shadow-lg text-center">
            <h2 className="text-lg font-bold text-foreground mb-4">Join Split</h2>
            <div className="mx-auto flex justify-center bg-white p-4 rounded-lg mb-4">
              <QRCodeSVG value={typeof window !== "undefined" ? window.location.href.replace("receipt-split-iota.vercel.app", "split-split.com") : ""} size={200} />
            </div>
            <button
              onClick={() => setShowQR(false)}
              className="w-full rounded-md border border-border bg-surface py-2.5 text-sm font-medium text-foreground hover:bg-background transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
