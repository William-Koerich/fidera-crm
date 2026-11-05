import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FIXTURE_PHONE_NUMBER_ID,
  FIXTURE_WABA_ID,
  contactStateSync,
  historyChunk,
  inboundText,
  messageEcho,
  partnerRemoved,
  statusUpdate,
} from "@/lib/channels/whatsapp/fixtures";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp/parse";
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

interface IngestResult {
  inserted: number;
  duplicates: number;
  statuses: number;
  skipped: number;
  organization_ids: string[];
}

async function ingest(db: Db, payload: unknown): Promise<IngestResult> {
  await actAsAdmin(db);
  const events = parseWhatsAppWebhook(payload);
  const { rows } = await db.query<{ r: IngestResult }>("select crm.ingest_events('mock', $1::jsonb) as r", [
    JSON.stringify(events),
  ]);
  return rows[0]!.r;
}

const t0 = new Date("2026-11-04T12:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

describe.skipIf(!hasDatabase())("ingest_events", () => {
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
    const org = await createOrg(db, owner, "Salão");
    await actAsAdmin(db);
    // The fixture phone_number_id is global; isolate it by removing leftovers is
    // unnecessary because each test runs in a rolled-back transaction.
    const { rows } = await db.query<{ id: string }>(
      `insert into crm.channel_accounts
         (organization_id, channel, provider, external_account_id, external_business_id, status)
       values ($1, 'whatsapp', 'mock', $2, $3, 'active') returning id`,
      [org, FIXTURE_PHONE_NUMBER_ID, FIXTURE_WABA_ID],
    );
    return { owner, org, account: rows[0]!.id };
  }

  /** Rows are always scoped to the test organization: the shared database may hold other data. */
  async function conversation(db: Db, org: string) {
    const { rows } = await db.query(
      `select awaiting_reply, unread_count, last_inbound_at, last_outbound_at, reply_window_ends_at,
              last_message_preview
       from crm.conversations where organization_id = $1`,
      [org],
    );
    return rows;
  }

  it("creates contact, identity, conversation and message from an inbound text", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      const r = await ingest(db, inboundText({ from: "554899990000", name: "Ana", body: "Oi", id: "wamid.1", at: t0 }));
      expect(r).toMatchObject({ inserted: 1, duplicates: 0, skipped: 0, organization_ids: [s.org] });

      const contacts = await db.query("select display_name, phone_normalized, source from crm.contacts where organization_id = $1", [s.org]);
      expect(contacts.rows).toEqual([{ display_name: "Ana", phone_normalized: "5548999990000", source: "whatsapp_inbound" }]);
      const ids = await db.query("select external_id from crm.contact_identities where organization_id = $1", [s.org]);
      expect(ids.rows).toEqual([{ external_id: "554899990000" }]);
      const [conv] = await conversation(db, s.org);
      expect(conv).toMatchObject({ awaiting_reply: true, unread_count: 1, last_message_preview: "Oi" });
      expect((conv.reply_window_ends_at as Date).toISOString()).toBe("2026-11-05T12:00:00.000Z");
    }));

  it("is idempotent: the same delivery twice stores one message", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      const payload = inboundText({ from: "5548999990000", body: "Oi", id: "wamid.dup", at: t0 });
      await ingest(db, payload);
      const again = await ingest(db, payload);
      expect(again).toMatchObject({ inserted: 0, duplicates: 1 });
      expect((await db.query("select 1 from crm.messages where organization_id = $1", [s.org])).rowCount).toBe(1);
      expect((await conversation(db, s.org))[0]).toMatchObject({ unread_count: 1 });
    }));

  it("an echo from the business app answers the conversation", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await ingest(db, inboundText({ from: "554899990000", body: "Tem horário?", id: "wamid.in", at: t0 }));
      await ingest(db, messageEcho({ to: "554899990000", body: "Tenho às 15h", id: "wamid.echo", at: at(5) }));
      const [conv] = await conversation(db, s.org);
      expect(conv).toMatchObject({ awaiting_reply: false, unread_count: 1, last_message_preview: "Tenho às 15h" });
      const msgs = await db.query("select direction, origin, status from crm.messages where organization_id = $1 order by occurred_at", [s.org]);
      expect(msgs.rows).toEqual([
        { direction: "inbound", origin: "customer", status: "received" },
        { direction: "outbound", origin: "business_app_echo", status: "sent" },
      ]);
    }));

  it("matches the same person with and without the 9th digit", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await ingest(db, contactStateSync({ phone: "+55 48 99999-0000", action: "add", fullName: "Ana Souza" }));
      await ingest(db, inboundText({ from: "554899990000", body: "Oi", id: "wamid.9", at: t0 }));
      const contacts = await db.query("select display_name from crm.contacts where organization_id = $1", [s.org]);
      expect(contacts.rows).toEqual([{ display_name: "Ana Souza" }]);
      expect((await db.query("select 1 from crm.contact_identities where organization_id = $1", [s.org])).rowCount).toBe(2);
    }));

  it("statuses only move forward", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await ingest(db, messageEcho({ to: "5548999990000", body: "Olá", id: "wamid.out", at: t0 }));
      await ingest(db, statusUpdate({ id: "wamid.out", to: "5548999990000", status: "read", at: at(2) }));
      const late = await ingest(db, statusUpdate({ id: "wamid.out", to: "5548999990000", status: "delivered", at: at(1) }));
      expect(late.statuses).toBe(0);
      const { rows } = await db.query("select status from crm.messages where organization_id = $1", [s.org]);
      expect(rows[0]?.status).toBe("read");
    }));

  it("history is stored without counting as unread and keeps progress", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      const r = await ingest(
        db,
        historyChunk({
          phase: 0,
          chunkOrder: 1,
          progress: 30,
          threads: [
            {
              userId: "5548988887777",
              messages: [
                { id: "h.1", fromBusiness: false, body: "Oi", at: t0 },
                { id: "h.2", fromBusiness: true, body: "Olá", at: at(1) },
              ],
            },
          ],
        }),
      );
      expect(r.inserted).toBe(2);
      expect((await conversation(db, s.org))[0]).toMatchObject({ unread_count: 0, awaiting_reply: false });
      const acc = await db.query("select history_sync_progress from crm.channel_accounts where id = $1", [s.account]);
      expect(acc.rows[0]?.history_sync_progress).toBe(30);
    }));

  it("skips events for unknown accounts", () =>
    withRollback(db, async (db) => {
      await seed(db);
      const r = await ingest(
        db,
        inboundText({ from: "5548999990000", body: "Oi", id: "wamid.x", phoneNumberId: "999", at: t0 }),
      );
      expect(r).toMatchObject({ inserted: 0, skipped: 1 });
    }));

  it("PARTNER_REMOVED disconnects the account and writes the audit log", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await ingest(db, partnerRemoved({ reason: "PRIMARY_INACTIVITY" }));
      const acc = await db.query("select status, disconnected_reason from crm.channel_accounts where id = $1", [s.account]);
      expect(acc.rows[0]).toEqual({ status: "disconnected", disconnected_reason: "PRIMARY_INACTIVITY" });
      const audit = await db.query("select action from crm.audit_log where organization_id = $1", [s.org]);
      expect(audit.rows.map((r) => r.action)).toContain("channel_account.partner_removed");
    }));

  it("users cannot call the server-only ingestion functions", () =>
    withRollback(db, async (db) => {
      const s = await seed(db);
      await actAs(db, s.owner);
      expect(await errorCode(db, "select crm.ingest_events('mock', '[]')")).toBe("42501");
      expect(await errorCode(db, "select * from crm.claim_webhook_events(1)")).toBe("42501");
    }));

  describe("queue", () => {
    it("claims once, backs off on failure and completes", () =>
      withRollback(db, async (db) => {
        await actAsAdmin(db);
        const { rows } = await db.query<{ id: string }>(
          `insert into crm.webhook_events (provider, channel, dedupe_key, payload)
           values ('mock', 'whatsapp', 'k-' || gen_random_uuid(), '{}') returning id`,
        );
        const id = rows[0]!.id;

        const first = await db.query("select id, attempts from crm.claim_webhook_events(10, $1)", [[id]]);
        expect(first.rows).toEqual([{ id, attempts: 1 }]);
        const second = await db.query("select id from crm.claim_webhook_events(10, $1)", [[id]]);
        expect(second.rowCount).toBe(0); // leased

        await db.query("select crm.complete_webhook_event($1, 'boom')", [id]);
        const failed = await db.query(
          "select status, last_error, next_attempt_at > now() as later from crm.webhook_events where id = $1",
          [id],
        );
        expect(failed.rows[0]).toEqual({ status: "failed", last_error: "boom", later: true });

        await db.query("update crm.webhook_events set next_attempt_at = now() - interval '1 second' where id = $1", [id]);
        const retry = await db.query("select attempts from crm.claim_webhook_events(10, $1)", [[id]]);
        expect(retry.rows[0]?.attempts).toBe(2);
        await db.query("select crm.complete_webhook_event($1)", [id]);
        const done = await db.query("select status, processed_at is not null as done from crm.webhook_events where id = $1", [id]);
        expect(done.rows[0]).toEqual({ status: "processed", done: true });
      }));

    it("an expired lease makes a stuck event claimable again", () =>
      withRollback(db, async (db) => {
        await actAsAdmin(db);
        const { rows } = await db.query<{ id: string }>(
          `insert into crm.webhook_events (provider, channel, dedupe_key, payload, status, attempts, next_attempt_at)
           values ('mock', 'whatsapp', 'k-' || gen_random_uuid(), '{}', 'processing', 1, now() - interval '1 minute')
           returning id`,
        );
        const claimed = await db.query("select attempts from crm.claim_webhook_events(10, $1)", [[rows[0]!.id]]);
        expect(claimed.rows[0]?.attempts).toBe(2);
      }));
  });
});
