import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { CHAT_KEY } from "./visitor";

/** The server secret that signs visitor ids. Without it the website chat is off. */
export function webchatSecret(): string | null {
  const secret = process.env.WEBCHAT_SECRET ?? "";
  return secret.length >= 32 ? secret : null;
}

/** The public address of this app, from server configuration only. */
export function publicOrigin(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.NEXT_PUBLIC_SITE_URL ?? (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
}

/** The active website chat with this key, and the business it belongs to. */
export async function findChat(key: string) {
  if (!CHAT_KEY.test(key)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("channel_accounts")
    .select("id, organization_id, organizations(name)")
    .eq("provider", "webchat")
    .eq("channel", "webchat")
    .eq("external_account_id", key)
    .eq("status", "active")
    .maybeSingle();
  return data ? { accountId: data.id, organizationId: data.organization_id, businessName: data.organizations?.name ?? "" } : null;
}

/** The visitor's conversation, if they have written before. */
export async function findVisitorConversation(chat: { accountId: string; organizationId: string }, visitorId: string) {
  const admin = createAdminClient();
  const { data: identity } = await admin
    .from("contact_identities")
    .select("contact_id")
    .eq("organization_id", chat.organizationId)
    .eq("channel", "webchat")
    .eq("external_id", visitorId)
    .maybeSingle();
  if (!identity) return null;
  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("channel_account_id", chat.accountId)
    .eq("contact_id", identity.contact_id)
    .maybeSingle();
  return conversation?.id ?? null;
}
