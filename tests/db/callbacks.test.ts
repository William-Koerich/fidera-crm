import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

const TODAY = "2026-11-07";
// A visit at 10:00 in Brasília, `daysAgo` days before TODAY.
const visit = (daysAgo: number) => new Date(Date.parse(`${TODAY}T13:00:00Z`) - daysAgo * 86_400_000).toISOString();

describe.skipIf(!hasDatabase())("chamar hoje", () => {
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
    const id = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
    const corte = await id("insert into crm.services (organization_id, name, duration_minutes, return_after_days) values ($1, 'Corte', 30, 30) returning id", [org]);
    await db.query("insert into crm.services (organization_id, name, duration_minutes) values ($1, 'Escova', 60)", [org]);
    const contact = async (name: string) => id("insert into crm.contacts (organization_id, display_name, phone_normalized, source) values ($1, $2, '5548900000001', 'manual') returning id", [org, name]);
    const appointment = (contactId: string, service: string, startsAt: string, status = "done") =>
      db.query(
        "insert into crm.appointments (organization_id, client_name, contact_id, service, starts_at, ends_at, status) values ($1, 'x', $2, $3, $4, $4::timestamptz + interval '30 minutes', $5)",
        [org, contactId, service, startsAt, status],
      );
    const list = async (asUser = owner) => {
      await actAs(db, asUser);
      const rows = (await db.query<{ contact_name: string; due_on: string }>("select contact_name, due_on::text from crm.list_callbacks($1, $2::date)", [org, TODAY])).rows;
      await actAsAdmin(db);
      return rows;
    };
    return { org, owner, member, corte, contact, appointment, list };
  }

  it("lists who is past the return date, from the last done visit", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const ana = await s.contact("Ana");
      const bia = await s.contact("Bia");
      await s.appointment(ana, "Corte", visit(60));
      await s.appointment(ana, " corte ", visit(31));
      await s.appointment(bia, "Corte", visit(29));
      expect(await s.list()).toEqual([{ contact_name: "Ana", due_on: "2026-11-06" }]);
    }));

  it("is due on the day itself", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await s.appointment(await s.contact("Ana"), "Corte", visit(30));
      expect(await s.list()).toEqual([{ contact_name: "Ana", due_on: TODAY }]);
    }));

  it("ignores visits not done, services without a return period, and walk-ins without a contact", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const ana = await s.contact("Ana");
      await s.appointment(ana, "Corte", visit(40), "no_show");
      await s.appointment(ana, "Corte", visit(40), "cancelled");
      await s.appointment(ana, "Escova", visit(400));
      await db.query(
        "insert into crm.appointments (organization_id, client_name, service, starts_at, ends_at, status) values ($1, 'Sem cadastro', 'Corte', $2, $2::timestamptz + interval '30 minutes', 'done')",
        [s.org, visit(40)],
      );
      expect(await s.list()).toEqual([]);
    }));

  it("leaves out who already has a time booked, or asked not to be called", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const ana = await s.contact("Ana");
      const bia = await s.contact("Bia");
      await s.appointment(ana, "Corte", visit(40));
      await s.appointment(bia, "Corte", visit(40));
      await s.appointment(ana, "Escova", new Date(Date.now() + 86_400_000).toISOString(), "scheduled");
      await db.query("update crm.contacts set do_not_contact = true where id = $1", [bia]);
      expect(await s.list()).toEqual([]);
    }));

  it("handles each visit once, and a new visit starts over", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const ana = await s.contact("Ana");
      await s.appointment(ana, "Corte", visit(40));
      const lastVisit = visit(40);
      await actAs(db, s.member);
      await db.query("insert into crm.callbacks (organization_id, contact_id, service_id, last_visit_at, status) values ($1, $2, $3, $4, 'called')", [s.org, ana, s.corte, lastVisit]);
      expect(await errorCode(db, "insert into crm.callbacks (organization_id, contact_id, service_id, last_visit_at, status) values ($1, $2, $3, $4, 'skipped')", [s.org, ana, s.corte, lastVisit])).toBe("23505");
      expect(await s.list()).toEqual([]);

      await s.appointment(ana, "Corte", visit(35));
      expect(await s.list()).toEqual([{ contact_name: "Ana", due_on: "2026-11-02" }]);
    }));

  it("follows team permissions, and stays inside the organization", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const ana = await s.contact("Ana");
      await s.appointment(ana, "Corte", visit(40));
      await db.query("insert into crm.access_settings (organization_id, member_visibility) values ($1, 'own')", [s.org]);
      // Ana has no conversation, so a member restricted to their own sees no contact of hers.
      expect(await s.list(s.member)).toEqual([]);
      expect(await s.list(s.owner)).toHaveLength(1);

      const stranger = await createUser(db, "stranger");
      await actAsAdmin(db);
      await createOrg(db, stranger, "Outro");
      expect(await s.list(stranger)).toEqual([]);
    }));

  it("records a callback only as oneself, and nobody changes it later", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const ana = await s.contact("Ana");
      await actAs(db, s.member);
      expect(
        await errorCode(db, "insert into crm.callbacks (organization_id, contact_id, service_id, last_visit_at, status, created_by) values ($1, $2, $3, now(), 'called', $4)", [s.org, ana, s.corte, s.owner]),
      ).toBe("42501");
      await db.query("insert into crm.callbacks (organization_id, contact_id, service_id, last_visit_at, status) values ($1, $2, $3, now(), 'called')", [s.org, ana, s.corte]);
      expect(await errorCode(db, "update crm.callbacks set status = 'skipped'")).toBe("42501");
      expect(await errorCode(db, "delete from crm.callbacks")).toBe("42501");
    }));
});
