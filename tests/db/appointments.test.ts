import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

const OVERLAP = "23P01";
const at = (hour: number, minute = 0) => `2026-11-07T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

describe.skipIf(!hasDatabase())("appointments", () => {
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
    const ana = await createUser(db, "ana");
    const bia = await createUser(db, "bia");
    const stranger = await createUser(db, "stranger");
    const org = await createOrg(db, owner, "Salão");
    const otherOrg = await createOrg(db, stranger, "Outro");
    await actAsAdmin(db);
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')", [org, ana, bia]);
    await actAs(db, ana);
    const insert = (staff: string | null, from: string, to: string, targetOrg = org) =>
      `insert into crm.appointments (organization_id, client_name, staff_id, starts_at, ends_at) values ('${targetOrg}', 'Cliente', ${staff ? `'${staff}'` : "null"}, '${from}', '${to}') returning id`;
    return { org, otherOrg, owner, ana, bia, stranger, insert };
  }

  it("refuses two clients at once for the same person, including partial overlaps", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await db.query(s.insert(s.ana, at(12), at(13)));
      expect(await errorCode(db, s.insert(s.ana, at(12), at(13)))).toBe(OVERLAP);
      expect(await errorCode(db, s.insert(s.ana, at(12, 30), at(13, 30)))).toBe(OVERLAP);
      expect(await errorCode(db, s.insert(s.ana, at(11, 30), at(12, 30)))).toBe(OVERLAP);
      expect(await errorCode(db, s.insert(s.ana, at(12, 15), at(12, 45)))).toBe(OVERLAP);
    }));

  it("allows back-to-back appointments, other people, and no person yet", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await db.query(s.insert(s.ana, at(12), at(13)));
      await db.query(s.insert(s.ana, at(13), at(14)));
      await db.query(s.insert(s.bia, at(12), at(13)));
      await db.query(s.insert(null, at(12), at(13)));
      await db.query(s.insert(null, at(12), at(13)));
    }));

  it("frees the time when cancelled, and checks again when brought back or moved", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const first = (await db.query<{ id: string }>(s.insert(s.ana, at(12), at(13)))).rows[0]!.id;
      await db.query("update crm.appointments set status = 'cancelled' where id = $1", [first]);
      const second = (await db.query<{ id: string }>(s.insert(s.ana, at(12), at(13)))).rows[0]!.id;
      expect(await errorCode(db, "update crm.appointments set status = 'scheduled' where id = $1", [first])).toBe(OVERLAP);

      const third = (await db.query<{ id: string }>(s.insert(s.ana, at(15), at(16)))).rows[0]!.id;
      expect(await errorCode(db, "update crm.appointments set starts_at = $1, ends_at = $2 where id = $3", [at(12), at(13), third])).toBe(OVERLAP);
      // Editing an appointment does not conflict with itself.
      await db.query("update crm.appointments set notes = 'x', ends_at = $1 where id = $2", [at(13, 30), second]);
    }));

  it("refuses impossible periods", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      expect(await errorCode(db, s.insert(s.ana, at(13), at(12)))).toBe("23514");
      expect(await errorCode(db, s.insert(s.ana, "2026-11-07T00:00:00Z", "2026-11-08T00:00:00Z"))).toBe("23514");
    }));

  it("is shared inside the organization and invisible outside it", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await db.query(s.insert(s.ana, at(12), at(13)));
      await actAs(db, s.bia);
      expect((await db.query("select 1 from crm.appointments")).rowCount).toBe(1);
      expect((await db.query("update crm.appointments set notes = 'pela Bia'")).rowCount).toBe(1);

      await actAs(db, s.stranger);
      expect((await db.query("select 1 from crm.appointments")).rowCount).toBe(0);
      expect((await db.query("update crm.appointments set notes = 'x'")).rowCount).toBe(0);
      expect(await errorCode(db, s.insert(null, at(12), at(13)))).toBe("42501");
    }));

  it("cannot name someone from another organization, or be deleted", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      expect(await errorCode(db, s.insert(s.stranger, at(12), at(13)))).toBe("23503");
      await db.query(s.insert(null, at(12), at(13)));
      expect(await errorCode(db, "delete from crm.appointments")).toBe("42501");
    }));

  it("services are read by the team, changed by managers, and private to the organization", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      const add = "insert into crm.services (organization_id, name, duration_minutes) values ($1, 'Corte', 30)";
      expect(await errorCode(db, add, [s.org])).toBe("42501");
      await actAs(db, s.owner);
      await db.query(add, [s.org]);
      expect(await errorCode(db, add, [s.org])).toBe("23505");
      await actAs(db, s.ana);
      expect((await db.query("select 1 from crm.services")).rowCount).toBe(1);
      expect((await db.query("delete from crm.services")).rowCount).toBe(0);
      await actAs(db, s.stranger);
      expect((await db.query("select 1 from crm.services")).rowCount).toBe(0);
    }));

  it("the bot's settings are for managers, and its sessions are server-only", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await actAs(db, s.ana);
      expect(await errorCode(db, "insert into crm.bot_settings (organization_id) values ($1)", [s.org])).toBe("42501");
      expect(await errorCode(db, "select * from crm.bot_sessions")).toBe("42501");
      await actAs(db, s.owner);
      expect(await errorCode(db, "insert into crm.bot_settings (organization_id, enabled) values ($1, true)", [s.org])).toBe("23514");
      await db.query("insert into crm.bot_settings (organization_id) values ($1)", [s.org]);
      await actAs(db, s.stranger);
      expect((await db.query("select 1 from crm.bot_settings")).rowCount).toBe(0);
    }));

  it("keeps the appointment when the person leaves the team", () =>
    withRollback(db, async (db) => {
      const s = await setup(db);
      await db.query(s.insert(s.ana, at(12), at(13)));
      await actAsAdmin(db);
      await db.query("delete from crm.memberships where organization_id = $1 and user_id = $2", [s.org, s.ana]);
      const { rows } = await db.query<{ staff_id: string | null; client_name: string }>("select staff_id, client_name from crm.appointments where organization_id = $1", [s.org]);
      expect(rows).toEqual([{ staff_id: null, client_name: "Cliente" }]);
    }));
});
