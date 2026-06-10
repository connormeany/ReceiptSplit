import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";
import { cache } from "react";

export const createServerClient = cache(() => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
});
