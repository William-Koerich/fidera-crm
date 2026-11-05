import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actAs,
  actAsAdmin,
  connect,
  createOrg,
  createUser,
  errorCode,
  hasDatabase,
  withRollback,
  type Db,
} from "./helpers";

const INSUFFICIENT_PRIVILEGE = "42501";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

const BUSINESS_TABLES = [
  "channel_accounts",
  "contacts",
  "contact_identities",
  "conversations",
  "messages",
  "usage_ledger",
  "audit_log",
] as const;

describe.skipIf(!hasDatabase())("channel tables isolation", () => {
  let db: Db;

  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  /** Creates account -> contact -> identity -> conversation -> message for an org. */
  async function seedOrg(db: Db, ownerId: string, orgId: string, tag: string) {
    const q = async (sql: string, params: unknown[]) =>
      (await db.query<{ id: string }>(sql, params)).rows[0]!.id;

    // Channel accounts are created by the server only.
    await actAsAdmin(db);
    const account = await q(
      `insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status)
       values ($1, 'whatsapp', 'mock', $2, 'active') returning id`,
      [orgId, `phone-${tag}-${orgId}`],
    );
    await actAs(db, ownerId);
    const contact = await q(
      `insert into crm.contacts (organization_id, display_name, phone_normalized, source)
       values ($1, $2, '5548999990000', 'whatsapp_inbound') returning id`,
      [orgId, `Cliente ${tag}`],
    );
    await q(
      `insert into crm.contact_identities (organization_id, contact_id, channel, external_id, phone_normalized)
       values ($1, $2, 'whatsapp', '554899990000', '5548999990000') returning id`,
      [orgId, contact],
    );
    const conversation = await q(
      `insert into crm.conversations (organization_id, contact_id, channel_account_id, channel, last_message_at)
       values ($1, $2, $3, 'whatsapp', now()) returning id`,
      [orgId, contact, account],
    );
    const message = await q(
      `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction, origin,
                                 type, body, status, external_message_id, occurred_at)
       values ($1, $2, $3, 'inbound', 'customer', 'text', 'Oi', 'received', $4, now()) returning id`,
      [orgId, conversation, account, `wamid.${tag}`],
    );

    // Server-only tables are written by service_role (postgres here).
    await actAsAdmin(db);
    await db.query(
      `insert into crm.usage_ledger (organization_id, channel_account_id, message_id, category, estimated_cost)
       values ($1, $2, $3, 'service', 0.035)`,
      [orgId, account, message],
    );
    await db.query(
      "insert into crm.audit_log (organization_id, actor_id, action) values ($1, $2, 'test.seed')",
      [orgId, ownerId],
    );
    await db.query(
      `insert into crm.webhook_events (organization_id, provider, channel, dedupe_key, payload)
       values ($1, 'mock', 'whatsapp', $2, '{}')`,
      [orgId, `dedupe-${tag}-${orgId}`],
    );
    return { account, contact, conversation, message };
  }

  async function seed(db: Db) {
    await actAsAdmin(db);
    const ownerA = await createUser(db, "owner-a");
    const ownerB = await createUser(db, "owner-b");
    const memberA = await createUser(db, "member-a");
    const orgA = await createOrg(db, ownerA, "Salão A");
    const orgB = await createOrg(db, ownerB, "Barbearia B");
    await actAs(db, ownerA);
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member')", [
      orgA,
      memberA,
    ]);
    const a = await seedOrg(db, ownerA, orgA, "a");
    const b = await seedOrg(db, ownerB, orgB, "b");
    return { ownerA, ownerB, memberA, orgA, orgB, a, b };
  }

  it("RLS is enabled on every table in the crm schema", () =>
    withRollback(db, async (db) => {
      const { rows } = await db.query<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'crm' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    }));

  it("an owner only sees rows of their own organization in every business table", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      for (const [owner, org] of [
        [s.ownerA, s.orgA],
        [s.ownerB, s.orgB],
      ] as const) {
        await actAs(db, owner);
        for (const table of BUSINESS_TABLES) {
          const { rows } = await db.query<{ organization_id: string }>(
            `select organization_id from crm.${table}`,
          );
          expect(rows.length, `${table} should have rows`).toBeGreaterThan(0);
          expect(
            rows.every((r) => r.organization_id === org),
            `${table} leaked rows from another organization`,
          ).toBe(true);
        }
      }
    }));

  it("cannot read, update or delete another organization's messages by id", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect((await db.query("select 1 from crm.messages where id = $1", [s.b.message])).rowCount).toBe(0);
      expect(
        (await db.query("update crm.messages set body = 'x' where id = $1", [s.b.message])).rowCount,
      ).toBe(0);
      expect((await db.query("delete from crm.contacts where id = $1", [s.b.contact])).rowCount).toBe(0);
    }));

  it("cannot insert rows into another organization", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(
        await errorCode(
          db,
          "insert into crm.contacts (organization_id, display_name, source) values ($1, 'x', 'manual')",
          [s.orgB],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("cannot link own rows to another organization's contact or account", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(
        await errorCode(
          db,
          `insert into crm.conversations (organization_id, contact_id, channel_account_id, channel)
           values ($1, $2, $3, 'whatsapp')`,
          [s.orgA, s.b.contact, s.a.account],
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
      expect(
        await errorCode(
          db,
          `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction,
                                     origin, type, status, occurred_at)
           values ($1, $2, $3, 'outbound', 'api', 'text', 'pending', now())`,
          [s.orgA, s.a.conversation, s.b.account],
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    }));

  it("server-only tables are not writable by users and webhook_events is not readable", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(await errorCode(db, "select * from crm.webhook_events")).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await errorCode(
          db,
          "insert into crm.usage_ledger (organization_id, category) values ($1, 'service')",
          [s.orgA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await errorCode(db, "insert into crm.audit_log (organization_id, action) values ($1, 'x')", [s.orgA]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("members see inbox data but not usage or audit; they cannot delete contacts", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.memberA);
      expect((await db.query("select 1 from crm.messages")).rowCount).toBe(1);
      expect((await db.query("select 1 from crm.usage_ledger")).rowCount).toBe(0);
      expect((await db.query("select 1 from crm.audit_log")).rowCount).toBe(0);
      expect((await db.query("delete from crm.contacts where id = $1", [s.a.contact])).rowCount).toBe(0);
    }));

  it("users cannot create or change channel accounts (webhook routing / secrets)", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(
        await errorCode(
          db,
          `insert into crm.channel_accounts (organization_id, channel, provider, external_account_id)
           values ($1, 'whatsapp', 'meta', 'squatted-phone-id')`,
          [s.orgA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await errorCode(db, "update crm.channel_accounts set external_account_id = 'x' where id = $1", [s.a.account]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await errorCode(db, "select crm.get_channel_token('mock', 'x')")).toBe(INSUFFICIENT_PRIVILEGE);
      // Owners can still remove their own account.
      expect((await db.query("delete from crm.channel_accounts where id = $1", [s.a.account])).rowCount).toBe(1);
    }));

  it("channel tokens round-trip through Vault and are removed with the account", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAsAdmin(db);
      await db.query("select crm.set_channel_token($1, 'token-1')", [s.a.account]);
      await db.query("select crm.set_channel_token($1, 'token-2')", [s.a.account]);
      const { rows } = await db.query<{ t: string; secret: string }>(
        `select crm.get_channel_token('mock', ca.external_account_id) as t, ca.token_secret_id as secret
         from crm.channel_accounts ca where ca.id = $1`,
        [s.a.account],
      );
      expect(rows[0]?.t).toBe("token-2");
      await db.query("delete from crm.channel_accounts where id = $1", [s.a.account]);
      expect((await db.query("select 1 from vault.secrets where id = $1", [rows[0]!.secret])).rowCount).toBe(0);
    }));

  it("external_message_id is unique per channel account", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(
        await errorCode(
          db,
          `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction,
                                     origin, type, status, external_message_id, occurred_at)
           values ($1, $2, $3, 'inbound', 'customer', 'text', 'received', 'wamid.a', now())`,
          [s.orgA, s.a.conversation, s.a.account],
        ),
      ).toBe(UNIQUE_VIOLATION);
    }));
});
