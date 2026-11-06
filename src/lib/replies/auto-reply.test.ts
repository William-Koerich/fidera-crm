import { describe, expect, it, vi } from "vitest";
import type { NormalizedEvent } from "../channels/types";
import {
  MAX_AUTO_REPLIES_PER_HOUR,
  decideAutoReply,
  isWithinBusinessHours,
  parseAutoReplyForm,
  parseBusinessHours,
  runAutoReplies,
  type AutoReplyContext,
  type AutoReplySettings,
  type AutoReplyStore,
} from "./auto-reply";

// Friday, 14:00 in São Paulo (UTC-3).
const OPEN = new Date("2026-11-06T17:00:00Z");
// Friday, 22:00 in São Paulo: already Saturday in UTC.
const CLOSED = new Date("2026-11-07T01:00:00Z");

const settings: AutoReplySettings = {
  greetingEnabled: true,
  greetingText: "Olá!",
  awayEnabled: true,
  awayText: "Estamos fechados.",
  businessHours: { "5": { open: "09:00", close: "18:00" } },
};
const decide = (over: Partial<Parameters<typeof decideAutoReply>[0]>) =>
  decideAutoReply({ settings, now: OPEN, isFirstMessage: false, greetedAt: null, lastAwayReplyAt: null, ...over });

describe("isWithinBusinessHours", () => {
  it("uses the business's local day and time, not UTC", () => {
    expect(isWithinBusinessHours(OPEN, settings.businessHours)).toBe(true);
    expect(isWithinBusinessHours(CLOSED, settings.businessHours)).toBe(false);
    expect(isWithinBusinessHours(new Date("2026-11-07T00:30:00Z"), { "5": { open: "21:00", close: "22:00" } })).toBe(true);
  });

  it("includes the opening minute, excludes the closing minute and treats missing days as closed", () => {
    const hours = { "5": { open: "14:00", close: "15:00" } };
    expect(isWithinBusinessHours(OPEN, hours)).toBe(true);
    expect(isWithinBusinessHours(OPEN, { "5": { open: "13:00", close: "14:00" } })).toBe(false);
    expect(isWithinBusinessHours(OPEN, {})).toBe(false);
  });
});

describe("decideAutoReply", () => {
  it("greets only the first message, once", () => {
    expect(decide({ isFirstMessage: true })).toEqual({ kind: "greeting", body: "Olá!" });
    expect(decide({ isFirstMessage: false })).toBeNull();
    expect(decide({ isFirstMessage: true, greetedAt: OPEN.toISOString() })).toBeNull();
  });

  it("sends the away message outside hours, even on first contact, then waits for the cooldown", () => {
    expect(decide({ now: CLOSED, isFirstMessage: true })).toMatchObject({ kind: "away" });
    expect(decide({ now: CLOSED, lastAwayReplyAt: new Date(CLOSED.getTime() - 3_600_000).toISOString() })).toBeNull();
    expect(decide({ now: CLOSED, lastAwayReplyAt: new Date(CLOSED.getTime() - 13 * 3_600_000).toISOString() })).toMatchObject({
      kind: "away",
    });
  });

  it("does nothing while disabled", () => {
    const off = { ...settings, greetingEnabled: false, awayEnabled: false };
    expect(decide({ settings: off, now: CLOSED, isFirstMessage: true })).toBeNull();
  });
});

describe("parseAutoReplyForm", () => {
  const form = (values: Record<string, string>) => parseAutoReplyForm((name) => values[name] ?? null);

  it("reads enabled days and ignores the unchecked ones", () => {
    const result = form({
      away_enabled: "on",
      away_text: " Fechado ",
      day_1_enabled: "on",
      day_1_open: "09:00",
      day_1_close: "18:00",
      day_2_open: "09:00",
      day_2_close: "18:00",
    });
    expect(result).toEqual({
      ok: true,
      settings: {
        greetingEnabled: false,
        greetingText: "",
        awayEnabled: true,
        awayText: "Fechado",
        businessHours: { "1": { open: "09:00", close: "18:00" } },
      },
    });
  });

  it("refuses what could not work", () => {
    expect(form({ greeting_enabled: "on" })).toMatchObject({ ok: false });
    expect(form({ away_enabled: "on", away_text: "x" })).toMatchObject({ ok: false, message: "Marque ao menos um dia de atendimento." });
    expect(
      form({ day_1_enabled: "on", day_1_open: "18:00", day_1_close: "09:00" }),
    ).toMatchObject({ ok: false, message: expect.stringContaining("Segunda") });
    expect(form({ day_1_enabled: "on", day_1_open: "25:00", day_1_close: "26:00" })).toMatchObject({ ok: false });
  });

  it("allows saving everything off", () => {
    expect(form({})).toMatchObject({ ok: true });
  });
});

describe("parseBusinessHours", () => {
  it("keeps schedules apart by prefix", () => {
    const values: Record<string, string> = {
      a_day_1_enabled: "on",
      a_day_1_open: "08:00",
      a_day_1_close: "12:00",
      b_day_2_enabled: "on",
      b_day_2_open: "13:00",
      b_day_2_close: "19:00",
    };
    const get = (name: string) => values[name] ?? null;
    expect(parseBusinessHours(get, "a_")).toEqual({ ok: true, hours: { "1": { open: "08:00", close: "12:00" } } });
    expect(parseBusinessHours(get, "b_")).toEqual({ ok: true, hours: { "2": { open: "13:00", close: "19:00" } } });
    expect(parseBusinessHours(get, "c_")).toEqual({ ok: true, hours: {} });
  });
});

describe("runAutoReplies", () => {
  const event = (over: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
    kind: "message",
    channel: "whatsapp",
    accountExternalId: "acc",
    direction: "inbound",
    origin: "customer",
    contact: { externalId: "5548999990000", phoneNormalized: "5548999990000", profileName: null },
    externalMessageId: "M1",
    type: "text",
    body: "Oi",
    mediaExternalId: null,
    mediaMimeType: null,
    occurredAt: OPEN,
    ...over,
  } as NormalizedEvent);

  const context: AutoReplyContext = {
    organizationId: "org",
    accountId: "acc-id",
    conversationId: "conv",
    accountActive: true,
    isFirstMessage: true,
    greetedAt: null,
    lastAwayReplyAt: null,
    lastOutboundAt: null,
    settings,
  };

  function setup(over: Partial<AutoReplyContext> | null = {}, recent = 0, claimed = true) {
    const store = {
      loadContext: vi.fn<AutoReplyStore["loadContext"]>(async () => (over === null ? null : { ...context, ...over })),
      countRecent: vi.fn<AutoReplyStore["countRecent"]>(async () => recent),
      claim: vi.fn<AutoReplyStore["claim"]>(async () => claimed),
      createPending: vi.fn<AutoReplyStore["createPending"]>(async () => "pending-id"),
      markFailed: vi.fn<AutoReplyStore["markFailed"]>(async () => {}),
      markSent: vi.fn<AutoReplyStore["markSent"]>(async () => {}),
    };
    const sendMessage = vi.fn(async () => ({ ok: true as const, externalMessageId: "EXT", acceptedAt: OPEN }));
    return { store, provider: { sendMessage } };
  }

  it("replies to the sender and records the send", async () => {
    const { store, provider } = setup();
    await runAutoReplies([event()], provider, store, { now: OPEN });
    expect(store.claim).toHaveBeenCalledWith("conv", "greeting", OPEN);
    expect(provider.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: "5548999990000", body: "Olá!", idempotencyKey: "pending-id" }),
    );
    expect(store.markSent).toHaveBeenCalledWith(expect.anything(), "pending-id", "EXT", OPEN);
  });

  it("never reacts to its own echo, phone replies, history or old messages", async () => {
    const { store, provider } = setup();
    await runAutoReplies(
      [
        event({ direction: "outbound", origin: "business_app_echo" } as Partial<NormalizedEvent>),
        event({ origin: "history" } as Partial<NormalizedEvent>),
        event({ occurredAt: new Date(OPEN.getTime() - 11 * 60_000) } as Partial<NormalizedEvent>),
        { kind: "status", channel: "whatsapp", accountExternalId: "acc", externalMessageId: "M", status: "read", occurredAt: OPEN, errorCode: null },
      ],
      provider,
      store,
      { now: OPEN },
    );
    expect(store.loadContext).not.toHaveBeenCalled();
    expect(provider.sendMessage).not.toHaveBeenCalled();
  });

  it("does not send when another run claimed it, the account is down or nothing is enabled", async () => {
    for (const { store, provider } of [setup({}, 0, false), setup({ accountActive: false }), setup(null)]) {
      await runAutoReplies([event()], provider, store, { now: OPEN });
      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(store.createPending).not.toHaveBeenCalled();
    }
  });

  it("stops at the hourly limit without using up the conversation's claim", async () => {
    const { store, provider } = setup({}, MAX_AUTO_REPLIES_PER_HOUR);
    const onOutcome = vi.fn();
    await runAutoReplies([event()], provider, store, { now: OPEN, onOutcome });
    expect(store.claim).not.toHaveBeenCalled();
    expect(provider.sendMessage).not.toHaveBeenCalled();
    expect(onOutcome).toHaveBeenCalledWith("hourly_limit");
  });

  it("records a failed send and keeps going after an error", async () => {
    const { store, provider } = setup();
    provider.sendMessage.mockResolvedValueOnce({ ok: false, errorCode: "http_500", errorMessage: "x", retryable: true } as never);
    store.loadContext.mockRejectedValueOnce(new Error("db down"));
    const onError = vi.fn();
    await runAutoReplies([event(), event({ externalMessageId: "M2" } as Partial<NormalizedEvent>)], provider, store, { now: OPEN, onError });
    expect(onError).toHaveBeenCalledOnce();
    expect(store.markFailed).toHaveBeenCalledWith("pending-id", "http_500");
    expect(store.markSent).not.toHaveBeenCalled();
  });
});
