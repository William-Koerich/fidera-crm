/**
 * Minimal migration runner for the `crm` schema.
 *
 * The Supabase project is shared with other apps that already use the
 * Supabase CLI history (supabase_migrations), so this runner keeps its own
 * history in crm_private.schema_migrations and only touches crm objects.
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate.mts          # apply pending
 *   node --env-file=.env.local scripts/migrate.mts --status # list only
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { pgConfigFromEnv } from "./pg-config.mts";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "supabase", "migrations");
const LOCK_KEY = 74_201_104; // arbitrary advisory lock id for crm migrations

async function main(): Promise<void> {
  const statusOnly = process.argv.includes("--status");

  const client = new pg.Client(pgConfigFromEnv());
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`
      create schema if not exists crm_private;
      create table if not exists crm_private.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const applied = new Set(
      (await client.query<{ version: string }>("select version from crm_private.schema_migrations"))
        .rows.map((r) => r.version),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    for (const f of files) console.log(`${applied.has(f) ? "applied" : "pending"}  ${f}`);
    if (statusOnly || pending.length === 0) {
      console.log(pending.length === 0 ? "Nothing to apply." : `${pending.length} pending.`);
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into crm_private.schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
        console.log(`applied  ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
