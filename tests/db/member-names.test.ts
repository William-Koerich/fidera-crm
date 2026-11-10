import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsAdmin, connect, createOrg, createUser, errorCode, hasDatabase, withRollback, type Db } from "./helpers";

describe.skipIf(!hasDatabase())("member names", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function seed(db: Db) {
    await actAsAdmin(db);
    const owner = await createUser(db, "owner");
    const ana = await createUser(db, "ana");
    const bia = await createUser(db, "bia");
    const stranger = await createUser(db, "stranger");
    const org = await createOrg(db, owner, "Salão");
    await db.query("insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')", [org, ana, bia]);
    return { owner, ana, bia, stranger, org };
  }
  const nameOf = async (db: Db, org: string, user: string) => {
    await actAsAdmin(db);
    const { rows } = await db.query<{ display_name: string | null }>("select display_name from crm.memberships where organization_id = $1 and user_id = $2", [org, user]);
    return rows[0]!.display_name;
  };

  it("lets people name themselves and owners name anyone", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ana);
      await db.query("select crm.set_member_name($1, $2, $3)", [s.org, s.ana, "  Ana  "]);
      expect(await nameOf(db, s.org, s.ana)).toBe("Ana");
      await actAs(db, s.owner);
      await db.query("select crm.set_member_name($1, $2, $3)", [s.org, s.bia, "Bia"]);
      expect(await nameOf(db, s.org, s.bia)).toBe("Bia");
      await actAs(db, s.owner);
      await db.query("select crm.set_member_name($1, $2, $3)", [s.org, s.bia, ""]);
      expect(await nameOf(db, s.org, s.bia)).toBeNull();
    }));

  it("does not let a member rename someone else, or a stranger anyone", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ana);
      expect(await errorCode(db, "select crm.set_member_name($1, $2, $3)", [s.org, s.bia, "X"])).toBe("42501");
      await actAs(db, s.stranger);
      expect(await errorCode(db, "select crm.set_member_name($1, $2, $3)", [s.org, s.stranger, "X"])).toBe("42501");
      await actAs(db, s.owner);
      expect(await errorCode(db, "select crm.set_member_name($1, $2, $3)", [s.org, s.owner, "x".repeat(61)])).toBe("22001");
    }));

  it("shows the name in the team list", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.owner);
      await db.query("select crm.set_member_name($1, $2, $3)", [s.org, s.ana, "Ana"]);
      const { rows } = await db.query<{ display_name: string | null }>("select display_name from crm.list_members($1)", [s.org]);
      expect(rows.map((r) => r.display_name)).toContain("Ana");
    }));
});
