# Split Split

Split restaurant bills without the hassle. Upload a receipt photo, share a link, and everyone claims their items and pays via Venmo.

## How It Works

1. **Upload a receipt** — take a photo, upload a file, or paste a link (images and PDFs supported)
2. **AI parses the items** — GPT-5.4 extracts line items, tax, tip, and restaurant name
3. **Review & edit** — host can verify and fix parsed items before sharing
4. **Share the link** — friends join, claim their items, and see their proportional totals
5. **Pay via Venmo** — one-tap Venmo deep links with the correct amount

## Features

- **Receipt parsing** — GPT-5.4 vision for images/PDFs, with automatic accuracy validation
- **Flexible splitting** — even splits (2-16 way), custom dollar amounts, or custom fractions (1/3, 2/5, etc.)
- **Real-time updates** — Supabase Realtime keeps everyone in sync as items are claimed
- **Proportional tax & tip** — automatically distributed based on each person's share of the subtotal
- **Group size defaults** — optional group size pre-sets the default split
- **Venmo deep links** — opens the Venmo app with the amount and note pre-filled
- **Client-side image compression** — large photos are compressed before upload to avoid size limits

## Tech Stack

- **Next.js 16** — App Router, TypeScript, Tailwind CSS
- **Supabase** — Postgres database + Realtime subscriptions + Storage
- **OpenAI GPT-5.4** — receipt OCR with vision
- **Twilio** — SMS/MMS ingress (text a receipt photo to create a session)
- **Vercel** — hosting


## Project Structure

```
src/
  app/
    page.tsx                    # Landing page (upload receipt, enter info)
    api/
      create-session/route.ts   # Create session from web upload
      upload/route.ts           # Upload receipt to Supabase Storage
      twilio/route.ts           # Twilio webhook for SMS/MMS
    s/[sessionId]/
      page.tsx                  # Session page (server component)
      claim-ui.tsx              # Main interactive UI (review/join/claim/done)
      summary.tsx               # Summary view
  actions/
    claim-item.ts               # Claim/unclaim server actions
    join-session.ts             # Join session server action
    confirm-review.ts           # Host review confirmation
  components/
    item-card.tsx               # Item card with claim/split/fraction UI
    venmo-button.tsx            # Venmo deep link button
  lib/
    openai.ts                   # Receipt parsing (GPT-5.4 vision + PDF)
    calc.ts                     # Proportional tax/tip calculation
    venmo.ts                    # Venmo URL builder
    supabase/                   # Supabase client helpers
```
