import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

describe.skipIf(!hasDatabase())("service rating", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function setup(db: Db, hoursToExpire = 24) {
    await actAsAdmin(db);
    const owner = await createUser(db, "owner");
    const member = await createUser(db, "member");
    const org = await createOrg(db, owner, "Salão");
    await actAsAdmin(db);
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member')", [org, member]);
    const contact = (await db.query<{ id: string }>("insert into crm.contacts (organization_id, phone_normalized, source) values ($1, '5548900000001', 'manual') returning id", [org])).rows[0]!.id;
    const account = (await db.query<{ id: string }>("insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status) values ($1, 'whatsapp', 'mock', $2, 'active') returning id", [org, `nps-${org}`])).rows[0]!.id;
    const conversation = (await db.query<{ id: string }>("insert into crm.conversations (organization_id, contact_id, channel_account_id, channel, status, closed_at) values ($1, $2, $3, 'whatsapp', 'closed', now()) returning id", [org, contact, account])).rows[0]!.id;
    await db.query("insert into crm.distribution_settings (organization_id, enabled) values ($1, true)", [org]);
    const survey = (await db.query<{ id: string }>(
      "insert into crm.nps_surveys (organization_id, conversation_id, contact_id, assigned_to, expires_at) values ($1, $2, $3, $4, now() + make_interval(hours => $5)) returning id",
      [org, conversation, contact, member, hoursToExpire],
    )).rows[0]!.id;
    let n = 0;
    const customerSays = (body: string) =>
      db.query(
        `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction, origin, type, body, status, external_message_id, occurred_at)
         values ($1, $2, $3, 'inbound', 'customer', 'text', $4, 'received', $5, now())`,
        [org, conversation, account, body, `N${n++}`],
      );
    const state = async () =>
      (await db.query<{ status: string; assigned_to: string | null; score: number | null; thanks_pending: boolean }>(
        `select c.status, c.assigned_to, s.score, s.thanks_pending from crm.conversations c
         join crm.nps_surveys s on s.conversation_id = c.id where s.id = $1`,
        [survey],
      )).rows[0]!;
    return { org, owner, member, conversation, contact, survey, customerSays, state };
  }

  it("takes a lone number as the rating: no reopening, no distribution, thanks pending", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.customerSays(" 9 ");
      expect(await s.state()).toEqual({ status: "closed", assigned_to: null, score: 9, thanks_pending: true });
    }));

  it("accepts both ends of the scale", () =>
    withRollback(db, async (db) => {
      const zero = await setup(db);
      await zero.customerSays("0");
      expect((await zero.state()).score).toBe(0);
      const ten = await setup(db);
      await ten.customerSays("10");
      expect((await ten.state()).score).toBe(10);
    }));

  for (const text of ["Quero marcar às 9", "11", "9,5", "nota 9", "-1"]) {
    it(`treats "${text}" as the customer writing again`, () =>
      withRollback(db, async (db) => {
        const s = await setup(db);
        await s.customerSays(text);
        const state = await s.state();
        expect(state).toMatchObject({ status: "open", score: null, thanks_pending: false });
        expect(state.assigned_to).not.toBeNull();
      }));
  }

  it("reopens instead of rating once the time is up", () =>
    withRollback(db, async (db) => {
      const s = await setup(db, -1);
      await s.customerSays("9");
      expect(await s.state()).toMatchObject({ status: "open", score: null });
    }));

  it("only counts the first answer: a second number is a new message", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.customerSays("9");
      await s.customerSays("3");
      expect(await s.state()).toMatchObject({ status: "open", score: 9 });
    }));

  it("does not take a number as a rating once the conversation is open again", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.customerSays("Bom dia");
      await s.customerSays("5");
      expect((await s.state()).score).toBeNull();
    }));

  it("reports the rating under who handled it, for managers only", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.customerSays("10");
      const today = (await db.query<{ d: string }>("select (now() at time zone 'America/Sao_Paulo')::date::text as d")).rows[0]!.d;
      await actAs(db, s.owner);
      const report = (await db.query<{ r: { sent: number; answered: number; promoters: number; by_assignee: { user_id: string; answered: number }[] } }>(
        "select crm.report_nps($1, $2::date, $2::date) as r",
        [s.org, today],
      )).rows[0]!.r;
      expect(report).toMatchObject({ sent: 1, answered: 1, promoters: 1, detractors: 0 });
      expect(report.by_assignee).toEqual([{ user_id: s.member, answered: 1, promoters: 1, detractors: 0 }]);

      await actAs(db, s.member);
      expect(await errorCode(db, "select crm.report_nps($1, $2::date, $2::date)", [s.org, today])).toBe("42501");
    }));

  it("keeps ratings from the team: members read nothing and nobody writes them", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await actAs(db, s.member);
      expect((await db.query("select 1 from crm.nps_surveys")).rowCount).toBe(0);
      expect((await db.query("select 1 from crm.nps_settings")).rowCount).toBe(0);
      await actAs(db, s.owner);
      expect((await db.query("select 1 from crm.nps_surveys")).rowCount).toBe(1);
      expect(await errorCode(db, "update crm.nps_surveys set score = 10")).toBe("42501");
    }));
});
