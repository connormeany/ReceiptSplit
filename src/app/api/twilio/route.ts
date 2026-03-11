import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/openai";
import twilio from "twilio";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = formData.get("From") as string;
  const body = (formData.get("Body") as string) || "";
  const numMedia = parseInt(formData.get("NumMedia") as string, 10) || 0;

  // Validate Twilio signature in production
  if (process.env.NODE_ENV === "production") {
    const signature = request.headers.get("X-Twilio-Signature") || "";
    const url = `${process.env.NEXT_PUBLIC_BASE_URL}/api/twilio`;
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value as string;
    });
    const valid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      url,
      params
    );
    if (!valid) {
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  const twiml = (message: string) => {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  };

  if (numMedia === 0) {
    return twiml(
      "Send me a photo of your receipt and I'll create a split link for you!"
    );
  }

  const imageUrl = formData.get("MediaUrl0") as string;
  const supabase = createServerClient();

  try {
    // Create session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({ host_phone: from, status: "parsing", image_url: imageUrl })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("Session creation failed:", sessionError);
      return twiml("Something went wrong. Please try again.");
    }

    // Parse receipt
    const parsed = await parseReceipt(imageUrl);

    // Insert items
    const itemRows = parsed.items.map((item) => ({
      session_id: session.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));

    await supabase.from("items").insert(itemRows);

    // Update session with parsed data
    await supabase
      .from("sessions")
      .update({
        restaurant_name: parsed.restaurant || null,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        tip_amount: parsed.tip,
        misc_fee: parsed.misc_fee || 0,
        total: parsed.total,
        status: "active",
      })
      .eq("id", session.id);

    const link = `${process.env.NEXT_PUBLIC_BASE_URL}/s/${session.id}`;

    // Check if body contains venmo username
    const venmoMatch = body.match(/@?[\w-]+/);
    if (venmoMatch) {
      await supabase
        .from("sessions")
        .update({ host_venmo: venmoMatch[0].replace("@", "") })
        .eq("id", session.id);
    }

    return twiml(
      `Receipt parsed! ${parsed.items.length} items found.\n\nShare this link with your group:\n${link}`
    );
  } catch (error) {
    console.error("Receipt processing error:", error);
    return twiml(
      "I couldn't read that receipt. Please try a clearer photo."
    );
  }
}
