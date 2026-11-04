/**
 * Builders for WhatsApp Cloud API webhook payloads, shaped after the official
 * docs (messages, smb_message_echoes, history, smb_app_state_sync,
 * account_update). Used by tests and by the local mock simulator.
 * Field names verified against developers.facebook.com on 2026-11-04.
 */

export const FIXTURE_WABA_ID = "100000000000001";
export const FIXTURE_PHONE_NUMBER_ID = "200000000000001";
export const FIXTURE_BUSINESS_PHONE = "554833334444";

interface Base {
  phoneNumberId?: string;
  displayPhone?: string;
}

const ts = (date: Date) => String(Math.floor(date.getTime() / 1000));

function envelope(field: string, value: Record<string, unknown>, base: Base = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: FIXTURE_WABA_ID,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: base.displayPhone ?? FIXTURE_BUSINESS_PHONE,
                phone_number_id: base.phoneNumberId ?? FIXTURE_PHONE_NUMBER_ID,
              },
              ...value,
            },
            field,
          },
        ],
      },
    ],
  };
}

export function inboundText(
  opts: Base & { from: string; name?: string; body: string; id: string; at?: Date },
) {
  return envelope(
    "messages",
    {
      contacts: [{ profile: { name: opts.name ?? "Cliente" }, wa_id: opts.from }],
      messages: [
        { from: opts.from, id: opts.id, timestamp: ts(opts.at ?? new Date()), type: "text", text: { body: opts.body } },
      ],
    },
    opts,
  );
}

export function inboundImage(
  opts: Base & { from: string; id: string; mediaId: string; caption?: string; at?: Date },
) {
  return envelope(
    "messages",
    {
      contacts: [{ profile: { name: "Cliente" }, wa_id: opts.from }],
      messages: [
        {
          from: opts.from,
          id: opts.id,
          timestamp: ts(opts.at ?? new Date()),
          type: "image",
          image: { id: opts.mediaId, mime_type: "image/jpeg", sha256: "fixture", caption: opts.caption },
        },
      ],
    },
    opts,
  );
}

export function statusUpdate(
  opts: Base & { id: string; to: string; status: "sent" | "delivered" | "read" | "failed"; errorCode?: number; at?: Date },
) {
  return envelope(
    "messages",
    {
      statuses: [
        {
          id: opts.id,
          status: opts.status,
          timestamp: ts(opts.at ?? new Date()),
          recipient_id: opts.to,
          ...(opts.errorCode ? { errors: [{ code: opts.errorCode, title: "Fixture error" }] } : {}),
        },
      ],
    },
    opts,
  );
}

export function messageEcho(opts: Base & { to: string; body: string; id: string; at?: Date }) {
  return envelope(
    "smb_message_echoes",
    {
      message_echoes: [
        {
          from: opts.displayPhone ?? FIXTURE_BUSINESS_PHONE,
          to: opts.to,
          id: opts.id,
          timestamp: ts(opts.at ?? new Date()),
          type: "text",
          text: { body: opts.body },
        },
      ],
    },
    opts,
  );
}

export interface HistoryMessage {
  id: string;
  fromBusiness: boolean;
  body: string;
  at: Date;
}

export function historyChunk(
  opts: Base & {
    phase: 0 | 1 | 2;
    chunkOrder: number;
    progress: number;
    threads: { userId: string; messages: HistoryMessage[] }[];
  },
) {
  const business = opts.displayPhone ?? FIXTURE_BUSINESS_PHONE;
  return envelope(
    "history",
    {
      history: [
        {
          metadata: { phase: opts.phase, chunk_order: opts.chunkOrder, progress: opts.progress },
          threads: opts.threads.map((t) => ({
            id: t.userId,
            messages: t.messages.map((m) => ({
              from: m.fromBusiness ? business : t.userId,
              ...(m.fromBusiness ? { to: t.userId } : {}),
              id: m.id,
              timestamp: ts(m.at),
              type: "text",
              text: { body: m.body },
              history_context: { status: m.fromBusiness ? "READ" : "DELIVERED" },
            })),
          })),
        },
      ],
    },
    opts,
  );
}

export function contactStateSync(
  opts: Base & { phone: string; action: "add" | "remove"; fullName?: string; at?: Date },
) {
  return envelope(
    "smb_app_state_sync",
    {
      state_sync: [
        {
          type: "contact",
          contact:
            opts.action === "add"
              ? { full_name: opts.fullName ?? "Contato", first_name: (opts.fullName ?? "Contato").split(" ")[0], phone_number: opts.phone }
              : { phone_number: opts.phone },
          action: opts.action,
          metadata: { timestamp: ts(opts.at ?? new Date()) },
        },
      ],
    },
    opts,
  );
}

export function partnerRemoved(opts: { reason?: string; initiatedBy?: "USER" | "SYSTEM" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "300000000000001",
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            value: {
              event: "PARTNER_REMOVED",
              waba_info: { waba_id: FIXTURE_WABA_ID, owner_business_id: "400000000000001" },
              disconnection_info: {
                reason: opts.reason ?? "ACCOUNT_DISCONNECTED",
                initiated_by: opts.initiatedBy ?? "USER",
              },
            },
            field: "account_update",
          },
        ],
      },
    ],
  };
}
