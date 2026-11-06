import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

const DAY = "2026-10-15";
// 10:00 in Brasília.
const at = (hoursAfter: number) => new Date(Date.parse(`${DAY}T13:00:00Z`) + hoursAfter * 3_600_000).toISOString();

describe.skipIf(!hasDatabase())("reports", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function setup(db: Db) {
    await actAsAdmin(db);
    const owner = await createUser(db, "owner");
    const member = await createUser(db, "member");
    const org = await createOrg(db, owner, "Salão");
    await actAsAdmin(db);
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member')", [org, member]);
    const contact = (await db.query<{ id: string }>("insert into crm.contacts (organization_id, display_name, phone_normalized, source) values ($1, '=Ana', '5548900000001', 'manual') returning id", [org])).rows[0]!.id;
    const account = (await db.query<{ id: string }>("insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status) values ($1, 'whatsapp', 'mock', $2, 'active') returning id", [org, `report-${org}`])).rows[0]!.id;
    const conversation = (await db.query<{ id: string }>("insert into crm.conversations (organization_id, contact_id, channel_account_id, channel) values ($1, $2, $3, 'whatsapp') returning id", [org, contact, account])).rows[0]!.id;
    let n = 0;
    const message = (direction: string, origin: string, hours: number, status = direction === "inbound" ? "received" : "sent") =>
      db.query(
        `insert into crm.messages (organization_id, conversation_id, channel_account_id, direction, origin, type, body, status, external_message_id, occurred_at)
         values ($1, $2, $3, $4::crm.message_direction, $5::crm.message_origin, 'text', 'x', $6::crm.message_status, $7, $8)`,
        [org, conversation, account, direction, origin, status, `R${n++}`, at(hours)],
      );
    return { org, owner, member, conversation, message };
  }

  const summary = async (db: Db, org: string, from = DAY, to = "2026-10-17") =>
    (await db.query<{ r: Record<string, never> }>("select crm.report_summary($1, $2::date, $3::date) as r", [org, from, to])).rows[0]!.r as unknown as {
      by_day: { day: string; attendances: number; inbound: number; outbound: number }[];
      automatic: number;
      responses: number;
      median_response_seconds: number | null;
    };

  it("counts one attendance per person every 24 hours, whatever the number of messages", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.message("inbound", "customer", 0);
      await s.message("inbound", "customer", 1);
      await s.message("inbound", "customer", 23);
      await s.message("inbound", "customer", 24);
      await actAs(db, s.owner);
      const r = await summary(db, s.org);
      expect(r.by_day.map((d) => d.attendances)).toEqual([1, 1, 0]);
      // 23 hours after 10:00 is already the next day: still the same attendance.
      expect(r.by_day.map((d) => d.inbound)).toEqual([2, 2, 0]);
    }));

  it("does not open an attendance when only the business writes", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.message("outbound", "api", 0);
      await actAs(db, s.owner);
      expect((await summary(db, s.org)).by_day[0]).toMatchObject({ attendances: 0, outbound: 1 });
    }));

  it("measures first response to a person's reply, not an automatic one, from the first waiting message", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.message("inbound", "customer", 0);
      await s.message("outbound", "automation", 0.1);
      await s.message("inbound", "customer", 0.2);
      await s.message("outbound", "api", 1);
      await s.message("outbound", "api", 1.5);
      await actAs(db, s.owner);
      const r = await summary(db, s.org);
      expect(r.automatic).toBe(1);
      expect(r.responses).toBe(1);
      expect(r.median_response_seconds).toBe(3600);
      expect(r.by_day[0]?.outbound).toBe(2);
    }));

  it("ignores failed sends and messages outside the period", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.message("inbound", "customer", 0);
      await s.message("outbound", "api", 1, "failed");
      await s.message("inbound", "customer", 24 * 30);
      await actAs(db, s.owner);
      const r = await summary(db, s.org);
      expect(r.responses).toBe(0);
      expect(r.by_day.reduce((sum, d) => sum + d.inbound, 0)).toBe(1);
    }));

  it("counts a message on the day it happened in Brasília", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      // 01:00 UTC on the 16th is still 22:00 on the 15th in Brasília.
      await s.message("inbound", "customer", 12);
      await actAs(db, s.owner);
      expect((await summary(db, s.org)).by_day[0]?.inbound).toBe(1);
    }));

  it("is only for managers of the organization, in both functions", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const other = await createUser(db, "other");
      await actAsAdmin(db);
      await createOrg(db, other, "Outro");
      for (const user of [s.member, other]) {
        await actAs(db, user);
        expect(await errorCode(db, "select crm.report_summary($1, '2026-10-15'::date, '2026-10-16'::date)", [s.org])).toBe("42501");
        expect(await errorCode(db, "select * from crm.report_conversations($1, '2026-10-15'::date, '2026-10-16'::date)", [s.org])).toBe("42501");
      }
    }));

  it("refuses an oversized period", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await actAs(db, s.owner);
      expect(await errorCode(db, "select crm.report_summary($1, '2024-01-01'::date, '2026-01-01'::date)", [s.org])).toBe("22023");
    }));

  it("exports one row per conversation with its counts", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.message("inbound", "customer", 0);
      await s.message("outbound", "api", 1);
      await s.message("outbound", "api", 2, "failed");
      await actAs(db, s.owner);
      const { rows } = await db.query("select contact_name, phone, status, received, sent from crm.report_conversations($1, '2026-10-15'::date, '2026-10-16'::date)", [s.org]);
      expect(rows).toEqual([{ contact_name: "=Ana", phone: "5548900000001", status: "open", received: "1", sent: "1" }]);
    }));
});
