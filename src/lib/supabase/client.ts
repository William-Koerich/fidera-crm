"use client";

import { createBrowserClient } from "@supabase/ssr";
import { DB_SCHEMA, getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database, typeof DB_SCHEMA>> | null = null;

/** Browser client (publishable key + user session). Used for Realtime. */
export function getBrowserClient() {
  if (client) return client;
  const { url, publishableKey } = getSupabasePublicConfig();
  client = createBrowserClient<Database, typeof DB_SCHEMA>(url, publishableKey, {
    db: { schema: DB_SCHEMA },
  });
  return client;
}
