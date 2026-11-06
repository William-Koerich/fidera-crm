import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

const INSTANCE = "distribution-test-instance";

describe.skipIf(!hasDatabase())("automatic distribution", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function setup(db: Db, enabled = true) {
    await actAsAdmin(db);
    const owner = await createUser(db, "owner");
    const ana = await createUser(db, "ana");
    const bia = await createUser(db, "bia");
    const org = await createOrg(db, owner, "Salão");
    await actAsAdmin(db);
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')", [org, ana, bia]);
    // The owner does not take conversations, so turns are only between Ana and Bia.
    await db.query("update crm.memberships set accepts_conversations = false where organization_id = $1 and user_id = $2", [org, owner]);
    await db.query("insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status) values ($1, 'whatsapp', 'mock', $2, 'active')", [org, `${INSTANCE}-${org}`]);
    await db.query("insert into crm.distribution_settings (organization_id, enabled) values ($1, $2)", [org, enabled]);
    return { org, owner, ana, bia, account: `${INSTANCE}-${org}` };
  }

  async function receive(db: Db, account: string, phone: string, id: string, origin = "customer") {
    await db.query("select crm.ingest_events('mock', $1::jsonb)", [
      JSON.stringify([
        {
          kind: "message",
          channel: "whatsapp",
          accountExternalId: account,
          direction: "inbound",
          origin,
          contact: { externalId: phone, phoneNormalized: phone, profileName: null },
          externalMessageId: id,
          type: "text",
          body: "Oi",
          mediaExternalId: null,
          mediaMimeType: null,
          occurredAt: new Date().toISOString(),
        },
      ]),
    ]);
  }

  const assignedTo = async (db: Db, org: string, phone: string) =>
    (
      await db.query<{ assigned_to: string | null; assign_mirror_pending: boolean }>(
        `select c.assigned_to, c.assign_mirror_pending from crm.conversations c
         join crm.contacts ct on ct.id = c.contact_id
         where c.organization_id = $1 and ct.phone_normalized = $2`,
        [org, phone],
      )
    ).rows[0]!;

  it("takes turns among those who accept conversations, marking it to mirror", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const seen: (string | null)[] = [];
      for (const [i, phone] of ["5548900000001", "5548900000002", "5548900000003"].entries()) {
        await receive(db, s.account, phone, `M${i}`);
        const row = await assignedTo(db, s.org, phone);
        expect(row.assign_mirror_pending).toBe(true);
        seen.push(row.assigned_to);
      }
      expect(seen).not.toContain(s.owner);
      expect(seen[0]).not.toBe(seen[1]);
      expect(seen[2]).toBe(seen[0]);
    }));

  it("sends a client to their owner, even one not taking other conversations", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await db.query("insert into crm.contacts (organization_id, phone_normalized, source, owner_id) values ($1, '5548900000009', 'manual', $2)", [s.org, s.owner]);
      await receive(db, s.account, "5548900000009", "M1");
      expect((await assignedTo(db, s.org, "5548900000009")).assigned_to).toBe(s.owner);
    }));

  it("ignores an owner who left the team", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const gone = await createUser(db, "gone");
      await actAsAdmin(db);
      await db.query("insert into crm.contacts (organization_id, phone_normalized, source, owner_id) values ($1, '5548900000008', 'manual', $2)", [s.org, gone]);
      await receive(db, s.account, "5548900000008", "M1");
      expect([s.ana, s.bia]).toContain((await assignedTo(db, s.org, "5548900000008")).assigned_to);
    }));

  it("keeps who already has the conversation", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await receive(db, s.account, "5548900000001", "M1");
      const first = (await assignedTo(db, s.org, "5548900000001")).assigned_to;
      await receive(db, s.account, "5548900000002", "M2");
      await receive(db, s.account, "5548900000001", "M3");
      expect((await assignedTo(db, s.org, "5548900000001")).assigned_to).toBe(first);
    }));

  it("does nothing when off, for history, or with nobody available", () =>
    withRollback(db, async (db) => {
      const off = await setup(db, false);
      await receive(db, off.account, "5548900000001", "M1");
      expect((await assignedTo(db, off.org, "5548900000001")).assigned_to).toBeNull();

      const on = await setup(db);
      await receive(db, on.account, "5548900000002", "H1", "history");
      expect((await assignedTo(db, on.org, "5548900000002")).assigned_to).toBeNull();

      await db.query("update crm.memberships set accepts_conversations = false where organization_id = $1", [on.org]);
      await receive(db, on.account, "5548900000003", "M2");
      expect((await assignedTo(db, on.org, "5548900000003")).assigned_to).toBeNull();
    }));

  it("only managers change the setting, and only for their own organization", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const other = await setup(db);
      await actAs(db, s.ana);
      expect((await db.query("select enabled from crm.distribution_settings")).rows).toEqual([{ enabled: true }]);
      expect((await db.query("update crm.distribution_settings set enabled = false")).rowCount).toBe(0);
      await actAs(db, s.owner);
      expect((await db.query("update crm.distribution_settings set enabled = false")).rowCount).toBe(1);
      expect(
        await errorCode(db, "insert into crm.distribution_settings (organization_id) values ($1) on conflict (organization_id) do update set enabled = false", [other.org]),
      ).toBe("42501");
    }));
});
