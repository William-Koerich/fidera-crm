/**
 * Prepares a business's ChatPro instance, in one of two ways:
 *
 * QR Code (default): the owner connects the number in Ajustes -> WhatsApp by
 * reading the QR Code (WhatsApp Web, outside Meta's official API).
 *   npm run chatpro:add -- <organization id> <instance id>
 *
 * Official API (--oficial): links the instance to the number's WhatsApp Business
 * Account on Meta (Cloud API; with coexistence the WhatsApp Business app keeps
 * working on the phone). Needs the number already on a WABA (ChatPro or Meta's
 * embedded signup does that) and a permanent Meta token (system user).
 *   npm run chatpro:add -- <organization id> <instance id> --oficial
 * It asks for the Meta token, the WABA id and the phone number id, sends them to
 * ChatPro (waba/register) and keeps none of them here.
 *
 * Keys are asked for, never passed as arguments. A business's own instance keeps its
 * two ChatPro keys in Supabase Vault; the instance in CHATPRO_INSTANCE_ID uses the env
 * keys. Running it again replaces the keys; a connected QR Code number stays connected.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 */
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const CHATPRO_API_URL = (process.env.CHATPRO_API_URL ?? "https://oci.chatpro.com.br").replace(/\/$/, "");
const CHATPRO_CHAT_URL = "https://sparks.chatpro.com.br";
const USAGE = "Usage: npm run chatpro:add -- <organization id> <instance id> [--oficial]";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).map((a) => a.trim());
  const official = args.includes("--oficial");
  const [organizationId, instanceId] = args.filter((a) => !a.startsWith("--"));
  if (!organizationId || !instanceId) throw new Error(USAGE);
  const envInstance = instanceId === process.env.CHATPRO_INSTANCE_ID;
  if (envInstance && process.env.CHATPRO_ORGANIZATION_ID !== organizationId) {
    throw new Error("The instance in CHATPRO_INSTANCE_ID belongs to CHATPRO_ORGANIZATION_ID.");
  }

  const db = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    db: { schema: "crm" },
    auth: { persistSession: false },
  });

  const { data: org, error: orgError } = await db.from("organizations").select("id, name").eq("id", organizationId).maybeSingle();
  if (orgError) throw new Error(`Could not read the business (${orgError.code}).`);
  if (!org) throw new Error("No business with this id. Copy it from Ajustes -> WhatsApp of the business.");

  const { data: taken } = await db
    .from("channel_accounts")
    .select("id, organization_id")
    .eq("provider", "chatpro")
    .eq("external_account_id", instanceId)
    .maybeSingle();
  if (taken && taken.organization_id !== organizationId) throw new Error("This instance already belongs to another business.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Business: ${org.name} · ${official ? "official API (Meta)" : "QR Code"}`);
  let token = process.env.CHATPRO_TOKEN ?? "";
  let chatToken = process.env.CHATPRO_CHAT_TOKEN ?? "";
  if (!envInstance) {
    token = (await rl.question("ChatPro instance token (connection): ")).trim();
    chatToken = (await rl.question("ChatPro Chat token (instance-token): ")).trim();
  }
  const meta = official
    ? {
        apiToken: (await rl.question("Meta permanent token (system user): ")).trim(),
        wabaId: (await rl.question("WhatsApp Business Account id (WABA): ")).trim(),
        phoneId: (await rl.question("Phone number id: ")).trim(),
        apiVersion: process.env.META_GRAPH_API_VERSION ?? "v23.0",
      }
    : null;
  rl.close();
  if (!token || !chatToken) throw new Error("Both ChatPro keys are needed.");

  if (meta) {
    if (!meta.apiToken || !/^\d+$/.test(meta.wabaId) || !/^\d+$/.test(meta.phoneId)) {
      throw new Error("The Meta token is needed, and the WABA and phone number ids are numbers.");
    }
    const registered = await fetch(`${CHATPRO_CHAT_URL}/waba/register`, {
      method: "POST",
      headers: { "instance-token": chatToken, "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, ...meta }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!registered.ok) throw new Error(`ChatPro refused to link the official number (HTTP ${registered.status}).`);
  } else {
    const status = await fetch(`${CHATPRO_API_URL}/${encodeURIComponent(instanceId)}/api/v1/status`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(15_000),
    });
    if (!status.ok) throw new Error(`ChatPro refused the connection key for this instance (HTTP ${status.status}).`);
  }

  const values = official
    ? { official_api: true, status: "active" as const, connected_at: new Date().toISOString(), disconnected_reason: null }
    : { official_api: false };
  let accountId = taken?.id;
  if (accountId) {
    const { error } = await db.from("channel_accounts").update(values).eq("id", accountId);
    if (error) throw new Error(`Could not update the channel account (${error.code}).`);
  } else {
    const { data: created, error: createError } = await db
      .from("channel_accounts")
      .insert({
        organization_id: organizationId,
        channel: "whatsapp",
        provider: "chatpro",
        external_account_id: instanceId,
        display_name: "WhatsApp do negócio",
        status: "disconnected",
        ...values,
      })
      .select("id")
      .single();
    if (createError) throw new Error(`Could not save the channel account (${createError.code}).`);
    accountId = created.id;
  }

  if (!envInstance) {
    const { error: keyError } = await db.rpc("set_channel_token", {
      p_account_id: accountId,
      // Same shape parseChatProCredentials reads (src/lib/channels/chatpro/credentials.ts).
      p_token: JSON.stringify({ token, chatToken }),
    });
    if (keyError) throw new Error(`Could not store the keys (${keyError.code}).`);
  }

  console.log(
    official
      ? `Ready. ${org.name} is on the official API. Approved templates appear in conversations once the 24h window closes.`
      : `Ready. ${org.name} can now open Ajustes -> WhatsApp and read the QR Code.`,
  );
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
