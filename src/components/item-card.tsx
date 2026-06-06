"use client";

import { useState } from "react";

import type { Database } from "@/lib/supabase/database.types";

type Item = Database["public"]["Tables"]["items"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];
type Person = Database["public"]["Tables"]["people"]["Row"];

interface ItemCardProps {
  item: Item;
  claims: Claim[];
  people: Person[];
  myClaim: Claim | null;
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

 // Tap card to claim
 const handleCardTap = () => {
  if (loading || isFull || iClaimedThis) return;
  if (hasFractionClaims) {
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
   className={`overflow-hidden rounded-lg border transition-colors ${
    iClaimedThis
     ? "border-primary/90 bg-primary text-surface shadow-sm"
     : isFull
      ? "border-border bg-border/20 text-foreground/60 opacity-70"
      : "border-border bg-surface text-foreground shadow-sm hover:border-border cursor-pointer"
   }`}
  >
   <div
    onClick={handleCardTap}
    className="p-4 flex items-center justify-between"
   >
    <div className="flex-1 min-w-0 pr-4">
     <p className={`truncate text-sm font-semibold ${iClaimedThis ? "text-surface" : isFull ? "text-foreground/60" : "text-foreground"}`}>
      {item.name}
     </p>
     <p className={`font-mono text-sm font-medium mt-0.5 ${iClaimedThis ? "text-surface/80" : isFull ? "text-foreground/50" : "text-foreground/70"}`}>
      ${item.price.toFixed(2)}
      {item.quantity > 1 && ` x${item.quantity}`}
     </p>
    </div>

    <div className="flex shrink-0 items-center gap-2">
     {claimers.length > 0 ? (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
       <div className="flex -space-x-1.5">
        {claimers.slice(0, 3).map((c, i) => (
         <span
          key={c.id}
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold uppercase ${
           iClaimedThis ? "border-primary bg-primary/80 text-surface" : "border-surface bg-border text-foreground/80"
          }`}
          style={{ zIndex: 10 - i }}
          title={c.name}
         >
          {c.name[0]}
         </span>
        ))}
        {claimers.length > 3 && (
         <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold uppercase z-0 ${
          iClaimedThis ? "border-primary bg-primary/80 text-surface" : "border-surface bg-border text-foreground/80"
         }`}>
          +{claimers.length - 3}
         </span>
        )}
       </div>
       
       {hasCustomClaims && remaining > 0 && (
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
         iClaimedThis ? "bg-primary/90 text-surface/80" : "bg-border/20 text-foreground/70"
        }`}>
         ${remaining.toFixed(2)} left
        </span>
       )}
       {isSplit && !hasCustomClaims && (
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
         iClaimedThis ? "bg-primary/90 text-surface/80" : "bg-border/20 text-foreground/70"
        }`}>
         {claimers.length}/{splitCount}
        </span>
       )}
      </div>
     ) : !isFull && !iClaimedThis ? (
      <div className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-border text-foreground/50">
       <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
       </svg>
      </div>
     ) : null}
    </div>
   </div>

   {/* Action buttons footer */}
   {!isFull && (
    <div className={`border-t flex items-center justify-between p-3 ${iClaimedThis ? "border-primary/90 bg-primary/50" : "border-border/50 bg-background/50"}`} onClick={(e) => e.stopPropagation()}>
     {loading ? (
      <div className={`flex items-center gap-2 text-xs font-medium ${iClaimedThis ? "text-foreground/50" : "text-foreground/60"}`}>
       <span className={`h-3 w-3 animate-spin rounded-full border-2 border-t-transparent ${iClaimedThis ? "border-border/50" : "border-border/60"}`} />
       Processing...
      </div>
     ) : iClaimedThis ? (
      <div className="flex items-center gap-2 w-full">
       <button
        onClick={handleUnclaim}
        className="flex-1 rounded-md border border-primary/80 bg-primary/90 py-1.5 text-xs font-semibold text-surface transition-colors hover:bg-primary/80"
       >
        Unclaim
       </button>
       {!hasCustomClaims && (
        <button
         onClick={async () => {
          if (!isSplit && groupSize && groupSize >= 2) {
           setShowSplitOptions(true);
           setShowMoreSplits(groupSize > 5);
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
         className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors ${
          showSplitOptions ? "border-border/70 bg-primary/80 text-surface" : "border-primary/80 bg-primary text-surface/80 hover:bg-primary/90 hover:text-surface"
         }`}
        >
         {isSplit ? `Split ${splitCount}` : "Split"}
        </button>
       )}
      </div>
     ) : (
      <div className="flex items-center gap-2 w-full">
       {hasFractionClaims ? (
        <button
         onClick={() => {
          setShowFractionInput(!showFractionInput);
          setShowCustomInput(false);
          setShowSplitOptions(false);
          setFractionNum("1");
          setFractionDenom("");
         }}
         className="flex-1 rounded-md border border-border bg-surface py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-background"
        >
         Fraction
        </button>
       ) : hasCustomClaims ? (
        <button
         onClick={() => handleClaim(1, remaining)}
         className="flex-1 rounded-md border border-border bg-surface py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-background"
        >
         Claim Rest
        </button>
       ) : (
        <button
         onClick={() => handleClaim(isClaimed ? splitCount : 1)}
         className="flex-1 rounded-md border border-border bg-surface py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-background"
        >
         {isClaimed ? "Join Split" : "Claim"}
        </button>
       )}
       
       {!hasCustomClaims && (
        <button
         onClick={async () => {
          if (!isClaimed && groupSize && groupSize >= 2) {
           setShowSplitOptions(true);
           setShowMoreSplits(groupSize > 5);
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
         className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors ${
          showSplitOptions ? "border-border bg-border/20 text-foreground" : "border-border bg-surface text-foreground/80 hover:bg-background"
         }`}
        >
         {isClaimed ? `Split ${splitCount}` : "Options"}
        </button>
       )}
      </div>
     )}
    </div>
   )}

   {showSplitOptions && (
    <div className={`border-t ${iClaimedThis ? "border-primary/90 bg-white/10" : "border-border/50 bg-surface"} p-4`} onClick={(e) => e.stopPropagation()}>
     <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${iClaimedThis ? "text-white/70" : "text-foreground/60"}`}>
      Equally
     </p>
     <div className="flex flex-wrap gap-2 mb-4">
      <button
       onClick={() => handleClaim(1)}
       className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        splitCount === 1
         ? (iClaimedThis ? "border-white/20 bg-white/20 text-white" : "border-border bg-border/20 text-foreground")
         : (iClaimedThis ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white" : "border-border text-foreground/70 hover:bg-background hover:text-foreground")
       }`}
      >
       No
      </button>
      {(showMoreSplits ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] : [2, 3, 4, 5]).map((n) => (
       <button
        key={n}
        onClick={() => handleClaim(n)}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
         n === splitCount
          ? (iClaimedThis ? "border-white/20 bg-white/20 text-white" : "border-border bg-border/20 text-foreground")
          : (iClaimedThis ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white" : "border-border text-foreground/70 hover:bg-background hover:text-foreground")
        }`}
       >
        {n}-way
       </button>
      ))}
      {!showMoreSplits && (
       <button
        onClick={() => setShowMoreSplits(true)}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
         iClaimedThis ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white" : "border-border text-foreground/70 hover:bg-background hover:text-foreground"
        }`}
       >
        ...
       </button>
      )}
     </div>

     <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${iClaimedThis ? "text-white/70" : "text-foreground/60"}`}>
      Custom
     </p>
     <div className="flex gap-2">
      <button
       onClick={() => {
        setShowCustomInput(true);
        setShowFractionInput(false);
        setCustomAmount("");
       }}
       className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        showCustomInput 
         ? (iClaimedThis ? "border-white/20 bg-white/20 text-white" : "border-border bg-border/20 text-foreground")
         : (iClaimedThis ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white" : "border-border text-foreground/70 hover:bg-background hover:text-foreground")
       }`}
      >
       $ Amount
      </button>
      <button
       onClick={() => {
        setShowFractionInput(true);
        setShowCustomInput(false);
        setFractionNum("1");
        setFractionDenom("");
       }}
       className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        showFractionInput
         ? (iClaimedThis ? "border-white/20 bg-white/20 text-white" : "border-border bg-border/20 text-foreground")
         : (iClaimedThis ? "border-white/20 text-white/70 hover:bg-white/10 hover:text-white" : "border-border text-foreground/70 hover:bg-background hover:text-foreground")
       }`}
      >
       Fraction
      </button>
     </div>
    </div>
   )}

   {showCustomInput && (
    <div className={`border-t ${iClaimedThis ? "border-primary/90 bg-white/10" : "border-border/50 bg-background"} p-4`} onClick={(e) => e.stopPropagation()}>
     <div className="flex items-center gap-3">
      <div className="relative flex-1">
       <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm ${iClaimedThis ? "text-white/50" : "text-foreground/60"}`}>$</span>
       <input
        type="number"
        min="0.01"
        step="0.01"
        max={item.price}
        placeholder="0.00"
        value={customAmount}
        onChange={(e) => setCustomAmount(e.target.value)}
        className={`w-full rounded-md border pl-7 pr-3 py-1.5 font-mono text-sm font-medium focus:outline-none focus:ring-1 ${
         iClaimedThis ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white/50 focus:ring-white/50" : "border-border bg-surface text-foreground placeholder:text-foreground/50 focus:border-primary focus:ring-primary"
        }`}
       />
      </div>
      <button
       onClick={() => {
        const amt = parseFloat(customAmount);
        if (amt > 0 && amt <= item.price) {
         handleClaim(1, amt);
         setCustomAmount("");
        }
       }}
       disabled={!customAmount || parseFloat(customAmount) <= 0 || parseFloat(customAmount) > item.price}
       className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        iClaimedThis ? "bg-white text-primary hover:bg-white/90" : "bg-primary text-surface hover:bg-primary/90"
       }`}
      >
       Set
      </button>
     </div>
    </div>
   )}

   {showFractionInput && (() => {
    const num = parseInt(fractionNum) || 0;
    const denom = parseInt(fractionDenom) || 0;
    const fractionAmount = denom > 0 && num > 0 ? Math.round((item.price * num / denom) * 100) / 100 : 0;
    const valid = num > 0 && denom > 0 && num <= denom && fractionAmount > 0 && fractionAmount <= remaining;
    
    return (
     <div className={`border-t ${iClaimedThis ? "border-primary/90 bg-white/10" : "border-border/50 bg-background"} p-4`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
       <input
        type="number"
        min="1"
        placeholder="1"
        value={fractionNum}
        onChange={(e) => setFractionNum(e.target.value)}
        className={`w-14 rounded-md border px-2 py-1.5 text-center font-mono text-sm font-medium focus:outline-none focus:ring-1 ${
         iClaimedThis ? "border-white/20 bg-white/10 text-white focus:border-white/50 focus:ring-white/50" : "border-border bg-surface text-foreground focus:border-primary focus:ring-primary"
        }`}
       />
       <span className={`font-mono text-lg font-bold ${iClaimedThis ? "text-white/50" : "text-foreground/50"}`}>/</span>
       <input
        type="number"
        min="1"
        placeholder="3"
        value={fractionDenom}
        onChange={(e) => setFractionDenom(e.target.value)}
        className={`w-14 rounded-md border px-2 py-1.5 text-center font-mono text-sm font-medium focus:outline-none focus:ring-1 ${
         iClaimedThis ? "border-white/20 bg-white/10 text-white focus:border-white/50 focus:ring-white/50" : "border-border bg-surface text-foreground focus:border-primary focus:ring-primary"
        }`}
       />
       
       <div className="flex-1 text-center">
        {denom > 0 && num > 0 && (
         <span className={`font-mono text-xs font-medium ${iClaimedThis ? "text-white/80" : "text-foreground/80"}`}>
          = ${fractionAmount.toFixed(2)}
         </span>
        )}
       </div>

       <button
        onClick={() => {
         if (valid) {
          handleClaim(1, fractionAmount, `${num}/${denom}`);
          setFractionNum("1");
          setFractionDenom("");
         }
        }}
        disabled={!valid}
        className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
         iClaimedThis ? "bg-white text-primary hover:bg-white/90" : "bg-primary text-surface hover:bg-primary/90"
        }`}
       >
        Set
       </button>
      </div>
     </div>
    );
   })()}
  </div>
 );
}
