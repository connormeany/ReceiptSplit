import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/openai";

export async function POST(request: NextRequest) {
  const { imageUrl, hostName, hostVenmo, groupSize } = await request.json();

  if (!imageUrl) {
    return NextResponse.json(
      { error: "Image URL is required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  try {
    // Create session with host venmo
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        status: "parsing",
        image_url: imageUrl || null,
        host_venmo: hostVenmo || null,
        group_size: groupSize || null,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("Session creation failed:", sessionError);
      return NextResponse.json(
        { error: `Failed to create session: ${sessionError?.message || "unknown"}` },
        { status: 500 }
      );
    }

    // Create the host as the first person
    const { data: person, error: personError } = await supabase
      .from("people")
      .insert({
        session_id: session.id,
        name: hostName || "Host",
        color: "#3B82F6", // blue — first color
        is_host: true,
      })
      .select("id")
      .single();

    if (personError) {
      console.error("Host person creation failed:", personError);
    }

    // Parse receipt
    const parsed = await parseReceipt(imageUrl);

    // Insert items
    const itemRows = parsed.items.map((item: any, index: number) => ({
      session_id: session.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      sort_order: index,
    }));

    const { error: itemsError } = await supabase.from("items").insert(itemRows);
    if (itemsError) {
      console.error("Items insertion failed:", itemsError);
    }

    // Update session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        restaurant_name: parsed.restaurant || null,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        tip_amount: parsed.tip,
        total: parsed.total,
        status: "active",
      })
      .eq("id", session.id);

    if (updateError) {
      console.error("Session update failed:", updateError);
    }

    return NextResponse.json({
      sessionId: session.id,
      personId: person?.id,
    });
  } catch (error) {
    console.error("Receipt processing error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to parse receipt: ${message}` },
      { status: 500 }
    );
  }
}
