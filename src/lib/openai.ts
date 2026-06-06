import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

export interface ParsedReceipt {
  restaurant: string;
  items: { name: string; price: number; quantity: number }[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

const SYSTEM_PROMPT = `You are a receipt parser. Extract all line items with their names and prices. Also extract the subtotal, tax amount, tip amount, and total.

Return JSON in this exact format:
{
  "restaurant": "Restaurant Name",
  "items": [{"name": "Item Name", "price": 12.99, "quantity": 1}],
  "subtotal": 45.97,
  "tax": 3.68,
  "tip": 9.19,
  "total": 58.84
}

- Extract the restaurant/merchant name if visible. If not found, set to ""

Rules:
- Each item should have a name and a price
- The "price" field must be the TOTAL price for that line item as shown on the receipt. For example, if the receipt says "Caesar Salad x3: $45", the price is 45, quantity is 1. If it says "Caesar Salad $15" listed 3 times, include it 3 times with price 15 each. The price should reflect what was actually charged for that line.
- quantity should always be 1 unless you need it for display purposes
- Do NOT include modifiers/add-ons with a $0.00 price as separate items — those are just notes on the parent item
- DO include modifiers/add-ons that have a non-zero price as separate items
- Make sure you capture EVERY line item on the receipt. Do not skip any items.
- If the receipt includes a tip amount, include it. If no tip is shown, set tip to 0
- If you can't parse the receipt, return {"error": "description of issue"}

CRITICAL ACCURACY REQUIREMENT:
- First, read the subtotal printed on the receipt. This number is GROUND TRUTH.
- Then extract each line item and its price. Read each digit carefully — pay close attention to digits that look similar (0 vs 6, 3 vs 5, 8 vs 6, etc.).
- After extracting all items, add up all your item prices. The sum MUST EXACTLY equal the subtotal on the receipt, down to the cent.
- If your sum does not match the subtotal, you MUST go back and re-read every price digit by digit until the sum matches exactly. Do not return results where the items do not sum to the subtotal.`;

async function detectUrlType(
  url: string
): Promise<{ type: "image" | "pdf" | "webpage"; contentType: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      return { type: "image", contentType };
    }
    if (contentType === "application/pdf" || url.toLowerCase().endsWith(".pdf")) {
      return { type: "pdf", contentType };
    }
    return { type: "webpage", contentType };
  } catch {
    // If HEAD fails, try GET and check
    if (url.toLowerCase().endsWith(".pdf")) {
      return { type: "pdf", contentType: "application/pdf" };
    }
    return { type: "webpage", contentType: "unknown" };
  }
}

function stripHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Replace block elements with newlines
  text = text.replace(/<\/(div|p|tr|li|h[1-6]|br\s*\/?)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#?\w+;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  return text.trim();
}

async function fetchPdfBase64(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}

async function fetchWebpageText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  const html = await res.text();
  const text = stripHtml(html);
  // Limit to first 4000 chars to avoid token bloat
  return text.slice(0, 4000);
}

export async function parseReceipt(url: string): Promise<ParsedReceipt> {
  const { type } = await detectUrlType(url);

  let response;

  if (type === "image") {
    response = await getOpenAI().chat.completions.create({
      model: "gpt-5.4",
      reasoning_effort: "none",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url, detail: "high" },
            },
          ],
        },
      ],
      max_completion_tokens: 1000,
    } as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
  } else if (type === "pdf") {
    const pdfDataUrl = await fetchPdfBase64(url);
    response = await getOpenAI().chat.completions.create({
      model: "gpt-5.4",
      reasoning_effort: "none",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: "receipt.pdf",
                file_data: pdfDataUrl,
              },
            },
          ] as unknown as OpenAI.Chat.ChatCompletionContentPart[],
        },
      ],
      max_completion_tokens: 1000,
    } as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
  } else {
    // Webpage — fetch HTML, extract text, send as text prompt
    const text = await fetchWebpageText(url);
    response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is the text content of a receipt webpage. Parse it:\n\n${text}`,
        },
      ],
      max_completion_tokens: 1000,
    });
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  let parsed = JSON.parse(content);
  if (parsed.error) {
    throw new Error(`Receipt parsing failed: ${parsed.error}`);
  }

  // Validate items sum against subtotal — retry if mismatch
  const itemsSum = parsed.items.reduce(
    (sum: number, item: { price: number }) => sum + item.price,
    0
  );
  const diff = Math.abs(itemsSum - parsed.subtotal);

  if (diff > 0.50) {
    console.warn(
      `First pass: items sum ($${itemsSum.toFixed(2)}) differs from subtotal ($${parsed.subtotal.toFixed(2)}) by $${diff.toFixed(2)}. Retrying...`
    );

    const direction = itemsSum > parsed.subtotal ? "too high" : "too low";

    // Build correction prompt — send back each item with its price and ask to verify each one
    const itemsList = parsed.items
      .map((i: { name: string; price: number }, idx: number) => `${idx + 1}. ${i.name} — $${i.price.toFixed(2)}`)
      .join("\n");

    const correctionMessage = `PRICE VERIFICATION NEEDED. Your items don't match the receipt subtotal.

YOUR SUM: $${itemsSum.toFixed(2)}
RECEIPT SUBTOTAL: $${parsed.subtotal.toFixed(2)}
YOU ARE $${diff.toFixed(2)} ${direction}

Here is every item and price you extracted. Go back to the receipt and verify EACH price individually. For each item, look at the receipt and confirm or correct the price:

${itemsList}

For each item above, re-read the exact price from the receipt image. If any price is different from what you originally read, correct it. Common digit misreads: 0↔6, 3↔5, 3↔8, 0↔8, 4↔9, 0↔3.

Also check: are there any items on the receipt that you missed entirely?

After correcting, verify your new sum equals EXACTLY $${parsed.subtotal.toFixed(2)} before returning.

Return the corrected full JSON in the same format.`;

    const retryMessages = type === "image"
      ? [
          { role: "system" as const, content: SYSTEM_PROMPT },
          {
            role: "user" as const,
            content: [
              { type: "image_url" as const, image_url: { url, detail: "high" as const } },
            ],
          },
          { role: "assistant" as const, content },
          { role: "user" as const, content: correctionMessage },
        ]
      : type === "pdf"
      ? [
          { role: "system" as const, content: SYSTEM_PROMPT },
          {
            role: "user" as const,
            content: [
              { type: "file" as const, file: { filename: "receipt.pdf", file_data: await fetchPdfBase64(url) } },
            ] as unknown as OpenAI.Chat.ChatCompletionContentPart[],
          },
          { role: "assistant" as const, content },
          { role: "user" as const, content: correctionMessage },
        ]
      : [
          { role: "system" as const, content: SYSTEM_PROMPT },
          { role: "assistant" as const, content },
          { role: "user" as const, content: correctionMessage },
        ];

    const retryResponse = await getOpenAI().chat.completions.create({
      model: type === "webpage" ? "gpt-4o-mini" : "gpt-5.4",
      reasoning_effort: type === "webpage" ? undefined : "none",
      response_format: { type: "json_object" },
      messages: retryMessages,
      max_completion_tokens: 1000,
    } as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

    const retryContent = retryResponse.choices[0]?.message?.content;
    if (retryContent) {
      const retryParsed = JSON.parse(retryContent);
      if (!retryParsed.error) {
        const retrySum = retryParsed.items.reduce(
          (sum: number, item: { price: number }) => sum + item.price,
          0
        );
        const retryDiff = Math.abs(retrySum - retryParsed.subtotal);
        console.log(
          `Second pass: items sum ($${retrySum.toFixed(2)}) vs subtotal ($${retryParsed.subtotal.toFixed(2)}), diff $${retryDiff.toFixed(2)}`
        );
        // Use the retry result if it's closer to the subtotal
        if (retryDiff < diff) {
          parsed = retryParsed;
        }
      }
    }
  }

  return parsed as ParsedReceipt;
}
