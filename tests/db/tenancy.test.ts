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

describe.skipIf(!hasDatabase())("tenancy and RLS isolation", () => {
  let db: Db;

  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  /** Two organizations, each with one owner; org A also has admin and member. */
  async function seed(db: Db) {
    await actAsAdmin(db);
    const ownerA = await createUser(db, "owner-a");
    const ownerB = await createUser(db, "owner-b");
    const adminA = await createUser(db, "admin-a");
    const memberA = await createUser(db, "member-a");
    const outsider = await createUser(db, "outsider");
    const orgA = await createOrg(db, ownerA, "Salão A");
    const orgB = await createOrg(db, ownerB, "Barbearia B");
    await actAs(db, ownerA);
    await db.query(
      "insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'member')",
      [orgA, adminA, memberA],
    );
    await actAs(db, ownerB);
    await db.query(
      "insert into crm.invitations (organization_id, email, role, token_hash) values ($1, 'x@b.com', 'member', 'hash-b')",
      [orgB],
    );
    return { ownerA, ownerB, adminA, memberA, outsider, orgA, orgB };
  }

  it("each user only sees their own organization", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);

      await actAs(db, s.ownerA);
      const a = await db.query("select id from crm.organizations");
      expect(a.rows.map((r) => r.id)).toEqual([s.orgA]);

      await actAs(db, s.ownerB);
      const b = await db.query("select id from crm.organizations");
      expect(b.rows.map((r) => r.id)).toEqual([s.orgB]);

      await actAs(db, s.outsider);
      expect((await db.query("select id from crm.organizations")).rowCount).toBe(0);
    }));

  it("memberships and invitations of another organization are invisible", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      const m = await db.query("select organization_id from crm.memberships");
      expect(new Set(m.rows.map((r) => r.organization_id))).toEqual(new Set([s.orgA]));
      expect(m.rowCount).toBe(3);
      expect((await db.query("select 1 from crm.invitations")).rowCount).toBe(0);
    }));

  it("cannot update or delete another organization", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      const upd = await db.query("update crm.organizations set name = 'hacked' where id = $1", [s.orgB]);
      expect(upd.rowCount).toBe(0);
      const del = await db.query("delete from crm.organizations where id = $1", [s.orgB]);
      expect(del.rowCount).toBe(0);

      await actAs(db, s.ownerB);
      const { rows } = await db.query("select name from crm.organizations where id = $1", [s.orgB]);
      expect(rows[0]?.name).toBe("Barbearia B");
    }));

  it("cannot join or add people to another organization", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(
        await errorCode(
          db,
          "insert into crm.memberships (organization_id, user_id, role) values ($1, $2, 'owner')",
          [s.orgB, s.ownerA],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        await errorCode(
          db,
          "insert into crm.invitations (organization_id, email, token_hash) values ($1, 'a@a.com', 'h')",
          [s.orgB],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("cannot move rows into another organization", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.ownerA);
      expect(
        await errorCode(db, "update crm.memberships set organization_id = $1 where user_id = $2", [
          s.orgB,
          s.memberA,
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  it("organizations are only created through create_organization", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.outsider);
      expect(await errorCode(db, "insert into crm.organizations (name) values ('direct')")).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }));

  it("anonymous users have no access to the crm schema", () =>
    withRollback(db, async (db) => {
      await seed(db);
      await actAs(db, null);
      expect(await errorCode(db, "select * from crm.organizations")).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await errorCode(db, "select crm.create_organization('x')")).toBe(INSUFFICIENT_PRIVILEGE);
    }));

  describe("roles", () => {
    it("members cannot invite or manage memberships", () =>
      withRollback(db, async (db) => {
        const s = await seed(db);
        await actAs(db, s.memberA);
        expect(
          await errorCode(
            db,
            "insert into crm.invitations (organization_id, email, token_hash) values ($1, 'n@a.com', 'h2')",
            [s.orgA],
          ),
        ).toBe(INSUFFICIENT_PRIVILEGE);
        const upd = await db.query(
          "update crm.memberships set role = 'admin' where organization_id = $1 and user_id = $2",
          [s.orgA, s.memberA],
        );
        expect(upd.rowCount).toBe(0);
      }));

    it("admins manage members but cannot grant or touch owners", () =>
      withRollback(db, async (db) => {
        const s = await seed(db);
        await actAs(db, s.adminA);
        const promote = await db.query(
          "update crm.memberships set role = 'admin' where organization_id = $1 and user_id = $2",
          [s.orgA, s.memberA],
        );
        expect(promote.rowCount).toBe(1);
        expect(
          await errorCode(
            db,
            "update crm.memberships set role = 'owner' where organization_id = $1 and user_id = $2",
            [s.orgA, s.memberA],
          ),
        ).toBe(INSUFFICIENT_PRIVILEGE);
        const demoteOwner = await db.query(
          "update crm.memberships set role = 'member' where organization_id = $1 and user_id = $2",
          [s.orgA, s.ownerA],
        );
        expect(demoteOwner.rowCount).toBe(0);
      }));

    it("the last owner cannot leave or be demoted", () =>
      withRollback(db, async (db) => {
        const s = await seed(db);
        await actAs(db, s.ownerA);
        expect(
          await errorCode(db, "delete from crm.memberships where organization_id = $1 and user_id = $2", [
            s.orgA,
            s.ownerA,
          ]),
        ).toBe("23514");
      }));

    it("an owner can delete the organization", () =>
      withRollback(db, async (db) => {
        const s = await seed(db);
        await actAs(db, s.ownerA);
        const del = await db.query("delete from crm.organizations where id = $1", [s.orgA]);
        expect(del.rowCount).toBe(1);
      }));
  });
});
