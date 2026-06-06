"use server";

import { createServerClient } from "@/lib/supabase/server";

interface ReviewItem {
  id?: string;
  name: string;
  price: number;
  quantity: number;
  sort_order: number;
}

export async function confirmReview(
  sessionId: string,
  items: ReviewItem[],
  subtotal: number,
  tax: number,
  tip: number,
  miscFee: number,
  total: number,
  restaurantName: string
) {
  const supabase = createServerClient();

  // Delete existing items and re-insert with edits
  await supabase.from("items").delete().eq("session_id", sessionId);

  const itemRows = items.map((item, index) => ({
    session_id: sessionId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase.from("items").insert(itemRows);
  if (itemsError) {
    throw new Error("Failed to save items: " + itemsError.message);
  }

  // Update session totals and activate
  const { error: sessionError } = await supabase
    .from("sessions")
    .update({
      restaurant_name: restaurantName || null,
      subtotal,
      tax,
      tip_amount: tip,
      misc_fee: miscFee,
      total,
      status: "active",
    })
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error("Failed to activate session: " + sessionError.message);
  }
}
