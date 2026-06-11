"use server";

import { createServerClient } from "@/lib/supabase/server";

export async function claimItem(
  itemId: string,
  personId: string,
  splitCount: number,
  customAmount?: number,
  customFraction?: string
) {
  const supabase = createServerClient();

  // Update all existing claims for this item to the new split count
  await supabase
    .from("claims")
    .update({ split_count: splitCount })
    .eq("item_id", itemId);

  // Insert the new claim
  const { error } = await supabase.from("claims").upsert(
    {
      item_id: itemId,
      person_id: personId,
      split_count: splitCount,
      custom_amount: customAmount ?? null,
      custom_fraction: customFraction ?? null,
    },
    { onConflict: "item_id,person_id" }
  );

  if (error) {
    throw new Error("Failed to claim item: " + error.message);
  }
}

export async function unclaimItem(itemId: string, personId: string) {
  const supabase = createServerClient();

  // Remove the claim
  const { error } = await supabase
    .from("claims")
    .delete()
    .eq("item_id", itemId)
    .eq("person_id", personId);

  if (error) {
    throw new Error("Failed to unclaim item: " + error.message);
  }

  // Keep the existing split_count — the slot is now open for someone else
}


export async function markDone(personId: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("people")
    .update({ is_done: true })
    .eq("id", personId);
  if (error) {
    throw new Error("Failed to mark done: " + error.message);
  }
}
