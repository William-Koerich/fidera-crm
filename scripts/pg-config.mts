import type { ClientConfig } from "pg";

/**
 * Builds a pg ClientConfig from DATABASE_URL.
 *
 * node-postgres treats `sslmode=require` as full verification, while the
 * Supabase pooler uses its own CA. If DATABASE_CA_CERT (PEM contents) is set,
 * we verify against it; otherwise we keep libpq semantics (encrypted, not
 * verified), the same behaviour as psql with sslmode=require.
 */
export function pgConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");

  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");

  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  };
}
