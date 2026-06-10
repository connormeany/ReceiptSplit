import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!client) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
