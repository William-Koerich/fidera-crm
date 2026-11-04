import { createHash } from "node:crypto";
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

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function emailOf(db: Db, userId: string): Promise<string> {
  await actAsAdmin(db);
  const { rows } = await db.query<{ email: string }>("select email from auth.users where id = $1", [userId]);
  return rows[0]!.email;
}

describe.skipIf(!hasDatabase())("invitations", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  async function seed(db: Db, opts: { expired?: boolean } = {}) {
    await actAsAdmin(db);
    const owner = await createUser(db, "owner");
    const invitee = await createUser(db, "invitee");
    const stranger = await createUser(db, "stranger");
    const org = await createOrg(db, owner, "Salão");
    const token = `tok-${Math.random()}`;
    const email = await emailOf(db, invitee);
    await actAs(db, owner);
    await db.query(
      `insert into crm.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, 'admin', $3, $4, now() + $5::interval)`,
      [org, email, sha256(token), owner, opts.expired ? "-1 day" : "7 days"],
    );
    return { owner, invitee, stranger, org, token };
  }

  it("the invited email accepts and becomes a member with the invited role", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.invitee);
      const { rows } = await db.query("select crm.accept_invitation($1) as org", [s.token]);
      expect(rows[0]?.org).toBe(s.org);
      const m = await db.query("select role from crm.memberships where organization_id = $1 and user_id = $2", [
        s.org,
        s.invitee,
      ]);
      expect(m.rows[0]?.role).toBe("admin");
      // Single use.
      expect(await errorCode(db, "select crm.accept_invitation($1)", [s.token])).toBe("P0002");
    }));

  it("another user cannot use the token", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.stranger);
      expect(await errorCode(db, "select crm.accept_invitation($1)", [s.token])).toBe("42501");
    }));

  it("expired or unknown tokens are rejected", () =>
    withRollback(db, async (db) => {
      const s = await seed(db, { expired: true });
      await actAs(db, s.invitee);
      expect(await errorCode(db, "select crm.accept_invitation($1)", [s.token])).toBe("P0002");
      expect(await errorCode(db, "select crm.accept_invitation('nope')")).toBe("P0002");
    }));

  it("list_members only returns rows to members", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.owner);
      expect((await db.query("select * from crm.list_members($1)", [s.org])).rowCount).toBe(1);
      await actAs(db, s.stranger);
      expect((await db.query("select * from crm.list_members($1)", [s.org])).rowCount).toBe(0);
    }));
});
