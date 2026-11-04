import { randomUUID } from "node:crypto";
import pg from "pg";
import { pgConfigFromEnv } from "../../scripts/pg-config.mts";

export type Db = pg.Client;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function connect(): Promise<Db> {
  const client = new pg.Client(pgConfigFromEnv());
  await client.connect();
  return client;
}

/**
 * Runs fn inside a transaction that is ALWAYS rolled back, so tests never
 * leave users or rows behind in the (shared) database.
 */
export async function withRollback(db: Db, fn: (db: Db) => Promise<void>): Promise<void> {
  await db.query("begin");
  try {
    await fn(db);
  } finally {
    await db.query("rollback");
  }
}

/** Creates an auth user inside the current transaction. */
export async function createUser(db: Db, label: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users
       (id, instance_id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             $2, '', '{"provider":"email","providers":["email"]}', '{}', now(), now())`,
    [id, `crm-test+${label}-${id.slice(0, 8)}@example.invalid`],
  );
  return id;
}

/** Switches the session to act as `userId` (authenticated) or anon (null). */
export async function actAs(db: Db, userId: string | null): Promise<void> {
  await db.query("reset role");
  const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" };
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await db.query(userId ? "set local role authenticated" : "set local role anon");
}

export async function actAsAdmin(db: Db): Promise<void> {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true)");
}

/** Runs a statement expected to fail; returns the SQLSTATE. Keeps the tx usable. */
export async function errorCode(db: Db, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query("savepoint expect_error");
  try {
    await db.query(sql, params);
    await db.query("release savepoint expect_error");
    return null;
  } catch (error) {
    await db.query("rollback to savepoint expect_error");
    return (error as { code?: string }).code ?? "unknown";
  }
}

export async function createOrg(db: Db, ownerId: string, name: string): Promise<string> {
  await actAs(db, ownerId);
  const { rows } = await db.query<{ id: string }>("select crm.create_organization($1) as id", [name]);
  const id = rows[0]?.id;
  if (!id) throw new Error("create_organization returned no id");
  return id;
}
