import Link from "next/link";
import { Alert } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

/** On the pages the AI attendant replaces: says why they are quiet while it is on. */
export async function AgentOnNotice({ organizationId, what, note }: { organizationId: string; what: string; note?: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_agent_settings").select("enabled").eq("organization_id", organizationId).maybeSingle();
  if (!data?.enabled) return null;
  return (
    <Alert tone="info" title={`${what} não envia nada enquanto o Atendente com IA estiver ligado`}>
      {note ?? "A IA cumprimenta, responde e agenda no lugar."} Dá para desligá-la em <Link href="/settings/atendente-ia">Atendente com IA</Link>.
    </Alert>
  );
}
