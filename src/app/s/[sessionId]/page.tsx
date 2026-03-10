import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClaimUI } from "./claim-ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  const supabase = createServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("restaurant_name, subtotal")
    .eq("id", sessionId)
    .single();

  const title = session?.restaurant_name
    ? `${session.restaurant_name} — Split Split`
    : "Split Split";

  const description = session?.restaurant_name
    ? `Split the bill from ${session.restaurant_name}`
    : "Split your restaurant bill";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = createServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    notFound();
  }

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("session_id", sessionId)
    .order("sort_order");

  const { data: people } = await supabase
    .from("people")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at");

  const itemIds = (items || []).map((i) => i.id);
  const { data: claims } = itemIds.length > 0
    ? await supabase
        .from("claims")
        .select("*")
        .in("item_id", itemIds)
    : { data: [] };

  return (
    <ClaimUI
      session={session}
      initialItems={items || []}
      initialPeople={people || []}
      initialClaims={claims || []}
    />
  );
}
