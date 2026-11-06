import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

describe.skipIf(!hasDatabase())("conversation visibility", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  /** Four conversations: Ana's, Bia's, unassigned in the Barba department, unassigned with no department. */
  async function setup(db: Db, visibility?: "all" | "department" | "own") {
    await actAsAdmin(db);
    const owner = await createUser(db, "owner");
    const ana = await createUser(db, "ana");
    const bia = await createUser(db, "bia");
    const org = await createOrg(db, owner, "Salão");
    await actAsAdmin(db);
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')", [org, ana, bia]);
    if (visibility) await db.query("insert into crm.access_settings (organization_id, member_visibility) values ($1, $2)", [org, visibility]);
    const id = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
    const barba = await id("insert into crm.departments (organization_id, name) values ($1, 'Barba') returning id", [org]);
    const account = await id("insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status) values ($1, 'whatsapp', 'mock', $2, 'active') returning id", [org, `vis-${org}`]);

    const conversation = async (tag: string, assigned: string | null, department: string | null) => {
      const contact = await id("insert into crm.contacts (organization_id, display_name, source) values ($1, $2, 'manual') returning id", [org, tag]);
      await db.query("insert into crm.contact_identities (organization_id, contact_id, channel, external_id) values ($1, $2, 'whatsapp', $3)", [org, contact, tag]);
      const conv = await id(
        "insert into crm.conversations (organization_id, contact_id, channel_account_id, channel, assigned_to, department_id, last_message_at) values ($1, $2, $3, 'whatsapp', $4, $5, now()) returning id",
        [org, contact, account, assigned, department],
      );
      await db.query(
        `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction, origin, type, body, status, external_message_id, occurred_at)
         values ($1, $2, $3, 'inbound', 'history', 'text', $4, 'received', $5, now())`,
        [org, conv, account, tag, `V-${tag}`],
      );
      await db.query("insert into crm.conversation_notes (organization_id, conversation_id, author_id, body) values ($1, $2, $3, $4)", [org, conv, owner, tag]);
      return { conv, contact };
    };
    const c = {
      anas: await conversation("anas", ana, null),
      bias: await conversation("bias", bia, null),
      barba: await conversation("barba", null, barba),
      free: await conversation("free", null, null),
    };
    return { org, owner, ana, bia, barba, account, c };
  }

  const visible = async (db: Db, sql: string) => (await db.query<{ t: string }>(sql)).rows.map((r) => r.t).sort();
  const seen = {
    conversations: "select ct.display_name as t from crm.conversations c join crm.contacts ct on ct.id = c.contact_id",
    messages: "select body as t from crm.messages",
    notes: "select body as t from crm.conversation_notes",
    contacts: "select display_name as t from crm.contacts",
    identities: "select external_id as t from crm.contact_identities",
  };

  async function expectEverywhere(db: Db, expected: string[]) {
    for (const [what, sql] of Object.entries(seen)) expect(await visible(db, sql), what).toEqual(expected);
  }

  it("changes nothing by default", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await actAs(db, s.ana);
      await expectEverywhere(db, ["anas", "barba", "bias", "free"]);
    }));

  it("own: their conversations and the unassigned, in every related table", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await actAs(db, s.ana);
      await expectEverywhere(db, ["anas", "barba", "free"]);
    }));

  it("department: their conversations, their departments, and what has no one and no department", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "department");
      await actAs(db, s.ana);
      await expectEverywhere(db, ["anas", "free"]);

      await actAsAdmin(db);
      await db.query("insert into crm.member_departments (organization_id, user_id, department_id) values ($1, $2, $3)", [s.org, s.ana, s.barba]);
      await actAs(db, s.ana);
      await expectEverywhere(db, ["anas", "barba", "free"]);
    }));

  it("owners and admins always see everything", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await actAs(db, s.owner);
      await expectEverywhere(db, ["anas", "barba", "bias", "free"]);
    }));

  it("a hidden conversation cannot be read, changed or written to by id", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await actAs(db, s.ana);
      const target = s.c.bias.conv;
      expect((await db.query("update crm.conversations set assigned_to = $1 where id = $2", [s.ana, target])).rowCount).toBe(0);
      expect((await db.query("update crm.messages set body = 'x' where conversation_id = $1", [target])).rowCount).toBe(0);
      expect(
        await errorCode(
          db,
          `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction, origin, type, body, status, occurred_at)
           values ($1, $2, $3, 'outbound', 'api', 'text', 'x', 'pending', now())`,
          [s.org, target, s.account],
        ),
      ).toBe("42501");
      expect(
        await errorCode(db, "insert into crm.conversation_notes (organization_id, conversation_id, author_id, body) values ($1, $2, $3, 'x')", [s.org, target, s.ana]),
      ).toBe("42501");
      expect((await db.query("update crm.contacts set display_name = 'x' where id = $1", [s.c.bias.contact])).rowCount).toBe(0);
    }));

  it("transfers go through the server: done directly, a change that hides the conversation is refused", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await actAs(db, s.ana);
      expect(await errorCode(db, "update crm.conversations set assigned_to = $1 where id = $2", [s.bia, s.c.anas.conv])).toBe("42501");
      // Taking an unassigned conversation keeps it visible, so it works directly.
      expect((await db.query("update crm.conversations set assigned_to = $1 where id = $2", [s.ana, s.c.free.conv])).rowCount).toBe(1);

      // What the server does after confirming the person can see it.
      await actAsAdmin(db);
      await db.query("update crm.conversations set assigned_to = $1 where id = $2", [s.bia, s.c.anas.conv]);
      await actAs(db, s.ana);
      expect(await visible(db, seen.conversations)).toEqual(["barba", "free"]);
    }));

  it("search follows the same rule", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await actAs(db, s.ana);
      const found = await db.query<{ id: string }>("select crm.search_conversations($1, 'bias') as id", [s.org]);
      expect(found.rows).toEqual([]);
    }));

  it("the setting is for managers: members cannot widen their own view", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await actAs(db, s.ana);
      expect((await db.query("update crm.access_settings set member_visibility = 'all'")).rowCount).toBe(0);
      expect(
        await errorCode(db, "insert into crm.member_departments (organization_id, user_id, department_id) values ($1, $2, $3)", [s.org, s.ana, s.barba]),
      ).toBe("42501");
    }));

  it("automatic distribution still reaches conversations a member cannot see", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, "own");
      await db.query("insert into crm.distribution_settings (organization_id, enabled) values ($1, true)", [s.org]);
      await db.query(
        `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction, origin, type, body, status, external_message_id, occurred_at)
         values ($1, $2, $3, 'inbound', 'customer', 'text', 'Oi', 'received', 'V-new', now())`,
        [s.org, s.c.free.conv, s.account],
      );
      const { rows } = await db.query<{ assigned_to: string | null }>("select assigned_to from crm.conversations where id = $1", [s.c.free.conv]);
      expect(rows[0]?.assigned_to).not.toBeNull();
    }));
});
