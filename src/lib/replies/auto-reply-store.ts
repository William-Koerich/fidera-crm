import "server-only";
import { isAgentOn } from "@/lib/ai/agent/runner";
import { recordSendUsage } from "@/lib/inbox/usage";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";
import { AWAY_COOLDOWN_MS, type AutoReplySettings, type AutoReplyStore, type BusinessHours, type SendTarget } from "./auto-reply";

export function toAutoReplySettings(row: Tables<"auto_reply_settings"> | null): AutoReplySettings {
  return {
    greetingEnabled: row?.greeting_enabled ?? false,
    greetingText: row?.greeting_text ?? "",
    awayEnabled: row?.away_enabled ?? false,
    awayText: row?.away_text ?? "",
    businessHours: (row?.business_hours ?? {}) as unknown as BusinessHours,
  };
}

/** Runs with the service role: webhooks have no signed-in user. Every query is scoped by account or conversation. */
export function supabaseAutoReplyStore(admin: AdminClient, provider: Enums<"channel_provider">): AutoReplyStore {
  return {
    async loadContext(accountExternalId, externalMessageId) {
      const { data: account } = await admin
        .from("channel_accounts")
        .select("id, organization_id, status")
        .eq("provider", provider)
        .eq("channel", "whatsapp")
        .eq("external_account_id", accountExternalId)
        .maybeSingle();
      if (!account) return null;

      const { data: row } = await admin
        .from("auto_reply_settings")
        .select("*")
        .eq("organization_id", account.organization_id)
        .maybeSingle();
      if (!row || (!row.greeting_enabled && !row.away_enabled)) return null;
      // The bot greets and answers instead, when it is on.
      const { data: bot } = await admin.from("bot_settings").select("enabled").eq("organization_id", account.organization_id).maybeSingle();
      if (bot?.enabled) return null;
      if (await isAgentOn(admin, account.organization_id)) return null;

      const { data: message } = await admin
        .from("messages")
        .select("id, occurred_at, conversation_id, conversations(greeted_at, last_away_reply_at, last_outbound_at)")
        .eq("channel_account_id", account.id)
        .eq("external_message_id", externalMessageId)
        .maybeSingle();
      if (!message?.conversations) return null;

      // A rating was answered: it gets its own thanks, not an automatic reply.
      const { data: rating } = await admin.from("nps_surveys").select("id").eq("response_message_id", message.id).maybeSingle();
      if (rating) return null;

      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", message.conversation_id)
        .lt("occurred_at", message.occurred_at);

      return {
        organizationId: account.organization_id,
        accountId: account.id,
        conversationId: message.conversation_id,
        accountActive: account.status === "active",
        isFirstMessage: count === 0,
        greetedAt: message.conversations.greeted_at,
        lastAwayReplyAt: message.conversations.last_away_reply_at,
        lastOutboundAt: message.conversations.last_outbound_at,
        settings: toAutoReplySettings(row),
      };
    },

    async countRecent(organizationId, since) {
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("origin", "automation")
        .gte("occurred_at", since.toISOString());
      return count ?? 0;
    },

    async claim(conversationId, kind, now) {
      const at = now.toISOString();
      const query =
        kind === "greeting"
          ? admin.from("conversations").update({ greeted_at: at }).eq("id", conversationId).is("greeted_at", null)
          : admin
              .from("conversations")
              .update({ last_away_reply_at: at })
              .eq("id", conversationId)
              .or(
                `last_away_reply_at.is.null,last_away_reply_at.lt.${new Date(now.getTime() - AWAY_COOLDOWN_MS).toISOString()}`,
              );
      const { data, error } = await query.select("id");
      if (error) throw new Error(`auto reply claim failed (${error.code})`);
      return data.length === 1;
    },

    async createPending(context: SendTarget, body, now) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          organization_id: context.organizationId,
          conversation_id: context.conversationId,
          channel_account_id: context.accountId,
          direction: "outbound",
          origin: "automation",
          type: "text",
          body,
          status: "pending",
          occurred_at: now.toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`auto reply insert failed (${error.code})`);
      return data.id;
    },

    async markFailed(messageId, errorCode) {
      await admin.from("messages").update({ status: "failed", error_code: errorCode }).eq("id", messageId);
    },

    async markSent(context, messageId, externalMessageId, now) {
      let storedId = messageId;
      const { error } = await admin
        .from("messages")
        .update({ status: "sent", external_message_id: externalMessageId })
        .eq("id", messageId);
      if (error?.code === "23505") {
        // The webhook echo of this send arrived first and stored it as sent from the
        // phone, which also cleared "awaiting reply". Keep that row and undo the effect.
        const { data: echoed } = await admin
          .from("messages")
          .update({ origin: "automation" })
          .eq("channel_account_id", context.accountId)
          .eq("external_message_id", externalMessageId)
          .select("id")
          .single();
        if (echoed) {
          await admin.from("messages").delete().eq("id", messageId);
          storedId = echoed.id;
        }
        await admin
          .from("conversations")
          .update({ last_outbound_at: context.lastOutboundAt, awaiting_reply: true })
          .eq("id", context.conversationId);
      } else if (error) {
        throw new Error(`auto reply update failed (${error.code})`);
      } else {
        // last_outbound_at stays: an automatic message is not a reply from the team.
        await admin.from("conversations").update({ last_message_at: now.toISOString() }).eq("id", context.conversationId);
      }
      await recordSendUsage(admin, {
        organizationId: context.organizationId,
        accountId: context.accountId,
        provider,
        messageId: storedId,
        now,
      });
    },
  };
}
