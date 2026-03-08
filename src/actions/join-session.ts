"use server";

import { createServerClient } from "@/lib/supabase/server";

const COLORS = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#10B981", // green
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export async function joinSession(sessionId: string, name: string) {
  const supabase = createServerClient();

  // Check how many people are already in the session for color assignment
  const { data: existing } = await supabase
    .from("people")
    .select("id, color")
    .eq("session_id", sessionId);

  const colorIndex = (existing?.length || 0) % COLORS.length;

  const { data: person, error } = await supabase
    .from("people")
    .insert({
      session_id: sessionId,
      name: name.trim(),
      color: COLORS[colorIndex],
    })
    .select("id, name, color, is_host")
    .single();

  if (error) {
    throw new Error("Failed to join session");
  }

  return person;
}
