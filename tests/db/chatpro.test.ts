import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseChatProHistory, parseChatProWebhook } from "@/lib/channels/chatpro/parse";
import { actAsAdmin, connect, createOrg, createUser, hasDatabase, withRollback, type Db } from "./helpers";

const instanceId = "chatpro-test-instance";
const message = (id: string, fromMe: boolean, body: string) => ({
  instanceId,
  event: {
    Type: "send_message",
    Body: {
      Info: {
        Id: id,
        RemoteJid: "554899990000@s.whatsapp.net",
        FromMe: fromMe,
        Timestamp: 1793000000 + (fromMe ? 60 : 0),
        PushName: "Ana",
      },
      Text: body,
    },
  },
});

async function ingest(db: Db, payload: unknown) {
  const { rows } = await db.query<{ r: { inserted: number; duplicates: number; statuses: number; skipped: number } }>(
    "select crm.ingest_events('chatpro', $1::jsonb) as r",
    [JSON.stringify(parseChatProWebhook(payload))],
  );
  return rows[0]!.r;
}

describe.skipIf(!hasDatabase())("ChatPro ingestion", () => {
  let db: Db;
  beforeAll(async () => {
    db = await connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  it("routes events by instance and stores the conversation", () =>
    withRollback(db, async (db) => {
      await actAsAdmin(db);
      const owner = await createUser(db, "owner");
      const org = await createOrg(db, owner, "Salão");
      await actAsAdmin(db);
      await db.query(
        `insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status)
         values ($1, 'whatsapp', 'chatpro', $2, 'active')`,
        [org, instanceId],
      );

      expect(await ingest(db, message("M1", false, "Oi"))).toMatchObject({ inserted: 1, skipped: 0 });
      expect(await ingest(db, message("M1", false, "Oi"))).toMatchObject({ inserted: 0, duplicates: 1 });
      await ingest(db, message("M2", true, "Olá!"));
      expect(
        await ingest(db, { instanceId, event: ["Msg", { cmd: "ack", id: "M2", ack: 3, t: 1793000100 }] }),
      ).toMatchObject({ statuses: 1 });

      const conv = await db.query("select awaiting_reply, unread_count from crm.conversations where organization_id = $1", [org]);
      expect(conv.rows).toEqual([{ awaiting_reply: false, unread_count: 1 }]);
      const msgs = await db.query(
        "select direction, status from crm.messages where organization_id = $1 order by occurred_at",
        [org],
      );
      expect(msgs.rows).toEqual([
        { direction: "inbound", status: "received" },
        { direction: "outbound", status: "read" },
      ]);
    }));

  it("imported history shows the conversation without counting as unread", () =>
    withRollback(db, async (db) => {
      await actAsAdmin(db);
      const owner = await createUser(db, "owner");
      const org = await createOrg(db, owner, "Salão");
      await actAsAdmin(db);
      await db.query(
        `insert into crm.channel_accounts (organization_id, channel, provider, external_account_id, status)
         values ($1, 'whatsapp', 'chatpro', $2, 'active')`,
        [org, instanceId],
      );
      const events = parseChatProHistory(
        [
          { id: "H2", from_me: false, number: "554899990000@s.whatsapp.net", message: "Tudo bem?", ts_receive: "2026-11-06T18:18:00.000Z", type: "receveid_message" },
          { id: "H1", from_me: true, number: "554899990000@s.whatsapp.net", message: "Olá", ts_receive: "2026-11-06T18:17:00.000Z", type: "send_message" },
        ],
        instanceId,
        "Ana",
      );
      const run = () => db.query<{ r: { inserted: number; duplicates: number } }>("select crm.ingest_events('chatpro', $1::jsonb) as r", [JSON.stringify(events)]);

      expect((await run()).rows[0]!.r).toMatchObject({ inserted: 2 });
      expect((await run()).rows[0]!.r).toMatchObject({ inserted: 0, duplicates: 2 });
      const conv = await db.query(
        `select c.unread_count, c.awaiting_reply, ct.display_name from crm.conversations c
         join crm.contacts ct on ct.id = c.contact_id where c.organization_id = $1`,
        [org],
      );
      expect(conv.rows).toEqual([{ unread_count: 0, awaiting_reply: true, display_name: "Ana" }]);
    }));

  it("skips events for an instance that is not connected to any business", () =>
    withRollback(db, async (db) => {
      await actAsAdmin(db);
      expect(await ingest(db, { ...message("M9", false, "Oi"), instanceId: "chatpro-unknown" })).toMatchObject({
        inserted: 0,
        skipped: 1,
      });
    }));
});
