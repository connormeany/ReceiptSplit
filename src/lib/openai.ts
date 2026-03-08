import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

export interface ParsedReceipt {
  items: { name: string; price: number; quantity: number }[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

const SYSTEM_PROMPT = `You are a receipt parser. Extract all line items with their names and prices. Also extract the subtotal, tax amount, tip amount, and total.

Return JSON in this exact format:
{
  "items": [{"name": "Item Name", "price": 12.99, "quantity": 1}],
  "subtotal": 45.97,
  "tax": 3.68,
  "tip": 9.19,
  "total": 58.84
}

Rules:
- Each item should have a name, price (as a number), and quantity (default 1)
- If an item has a quantity > 1, list it once with the per-unit price and the quantity
- The subtotal should be the sum of all items before tax
- If you can't find an explicit subtotal, calculate it from the items
- If the receipt includes a tip amount, include it. If no tip is shown, set tip to 0
- Do NOT include modifiers/add-ons with a $0.00 price as separate items — those are just notes on the parent item
- DO include modifiers/add-ons that have a non-zero price as separate items
- If you can't parse the receipt, return {"error": "description of issue"}`;

async function detectUrlType(
  url: string
): Promise<{ type: "image" | "webpage"; contentType: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      return { type: "image", contentType };
    }
    return { type: "webpage", contentType };
  } catch {
    // If HEAD fails, try GET and check
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
      model: "gpt-4o-mini",
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
      max_tokens: 1000,
    });
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
      max_tokens: 1000,
    });
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content);
  if (parsed.error) {
    throw new Error(`Receipt parsing failed: ${parsed.error}`);
  }

  return parsed as ParsedReceipt;
}
