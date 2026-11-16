/**
 * Prepares a ChatPro instance for one business, so its owner can connect the
 * number in Ajustes -> Canais by reading the QR Code. Run it once per business,
 * after creating the instance in the ChatPro panel.
 *
 * Usage: npm run chatpro:add -- <organization id> <instance id>
 * The two keys of the instance are asked for here, never passed as arguments,
 * and go to Supabase Vault. The connection key is checked against ChatPro first
 * (a status read; nothing is sent). Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SECRET_KEY in .env.local.
 */
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const CHATPRO_API_URL = (process.env.CHATPRO_API_URL ?? "https://oci.chatpro.com.br").replace(/\/$/, "");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const [organizationId, instanceId] = process.argv.slice(2).map((a) => a.trim());
  if (!organizationId || !instanceId) throw new Error("Usage: npm run chatpro:add -- <organization id> <instance id>");
  if (instanceId === process.env.CHATPRO_INSTANCE_ID) throw new Error("This instance is the one in CHATPRO_INSTANCE_ID; it uses the env keys.");

  const db = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    db: { schema: "crm" },
    auth: { persistSession: false },
  });

  const { data: org, error: orgError } = await db.from("organizations").select("id, name").eq("id", organizationId).maybeSingle();
  if (orgError) throw new Error(`Could not read the business (${orgError.code}).`);
  if (!org) throw new Error("No business with this id. Copy it from Ajustes -> Canais of the business.");

  const { data: taken } = await db
    .from("channel_accounts")
    .select("id, organization_id")
    .eq("provider", "chatpro")
    .eq("external_account_id", instanceId)
    .maybeSingle();
  if (taken && taken.organization_id !== organizationId) throw new Error("This instance already belongs to another business.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Business: ${org.name}`);
  const token = (await rl.question("Instance token (ChatPro panel, connection): ")).trim();
  const chatToken = (await rl.question("ChatPro Chat token (instance-token): ")).trim();
  rl.close();
  if (!token || !chatToken) throw new Error("Both keys are needed.");

  const status = await fetch(`${CHATPRO_API_URL}/${encodeURIComponent(instanceId)}/api/v1/status`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(15_000),
  });
  if (!status.ok) throw new Error(`ChatPro refused the connection key for this instance (HTTP ${status.status}).`);

  // Running it again only replaces the keys; a connected number stays connected.
  let accountId = taken?.id;
  if (!accountId) {
    const { data: created, error: createError } = await db
      .from("channel_accounts")
      .insert({
        organization_id: organizationId,
        channel: "whatsapp",
        provider: "chatpro",
        external_account_id: instanceId,
        display_name: "WhatsApp do negócio",
        status: "disconnected",
      })
      .select("id")
      .single();
    if (createError) throw new Error(`Could not save the channel account (${createError.code}).`);
    accountId = created.id;
  }

  const { error: keyError } = await db.rpc("set_channel_token", {
    p_account_id: accountId,
    // Same shape parseChatProCredentials reads (src/lib/channels/chatpro/credentials.ts).
    p_token: JSON.stringify({ token, chatToken }),
  });
  if (keyError) throw new Error(`Could not store the keys (${keyError.code}).`);

  console.log(`Ready. ${org.name} can now open Ajustes -> Canais and read the QR Code.`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
