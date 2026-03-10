import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supabase = createServerClient();

  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from("receipts")
    .upload(fileName, buffer, {
      contentType: file.type,
    });

  if (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: `Failed to upload image: ${error.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage
    .from("receipts")
    .getPublicUrl(fileName);

  return NextResponse.json({ url: urlData.publicUrl });
}
