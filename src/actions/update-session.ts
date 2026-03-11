"use server";

import { createServerClient } from "@/lib/supabase/server";

export async function updateTipAmount(sessionId: string, tipAmount: number) {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("sessions")
    .update({ tip_amount: tipAmount })
    .eq("id", sessionId);

  if (error) {
    throw new Error("Failed to update tip");
  }
}

export async function updateHostVenmo(sessionId: string, venmoUsername: string) {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("sessions")
    .update({ host_venmo: venmoUsername.replace("@", "").trim() })
    .eq("id", sessionId);

  if (error) {
    throw new Error("Failed to update Venmo username");
  }
}
