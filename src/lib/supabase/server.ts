import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service_role key, which bypasses RLS
// entirely. Every table this app uses has RLS enabled with zero policies, so
// this client is the ONLY way in — never import this from a "use client"
// component, and never send this key to the browser.
//
// Not generic-typed against a Database schema: the installed postgrest-js
// version's GenericTable constraint doesn't accept plain hand-written
// interfaces through its Row/Insert checks (a library quirk, confirmed by
// isolated repro, not a bug in our types). Row shapes are asserted instead —
// see schema-types.ts — and mutation payloads are cast at the call site.
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return client;
}
