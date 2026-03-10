"use client";

import { buildVenmoLink } from "@/lib/venmo";

export function VenmoButton({
  venmoUsername,
  amount,
  note,
}: {
  venmoUsername: string;
  amount: number;
  note: string;
}) {
  const link = buildVenmoLink(venmoUsername, amount, note);

  return (
    <a
      href={link}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#008CFF] py-2.5 font-semibold text-white transition hover:bg-[#0074D4]"
    >
      Pay ${amount.toFixed(2)} via Venmo
    </a>
  );
}
