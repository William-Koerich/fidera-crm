import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { DB_SCHEMA, getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/** Per-request client acting as the signed-in user. RLS applies. */
export async function createClient() {
  // Supabase auth checks token expiry with Date.now() and every query is
  // per-user I/O: wait for a real request (also excludes it from prerenders
  // that have cookies available, like runtime prefetching).
  await connection();
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();
  return createServerClient<Database, typeof DB_SCHEMA>(url, publishableKey, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Server-only client with the secret key. BYPASSES RLS: use only for
 * webhooks, workers and server-only tables, never with user-provided ids
 * without checking membership first.
 */
export function createAdminClient() {
  const { url } = getSupabasePublicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SECRET_KEY.");
  return createSupabaseClient<Database, typeof DB_SCHEMA>(url, secret, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
