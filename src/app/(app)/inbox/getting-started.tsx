import Link from "next/link";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { buildChecklist } from "@/lib/onboarding/checklist";
import { createClient } from "@/lib/supabase/server";

/**
 * First steps for owners and admins of a new business, above the conversations.
 * Gone once every step is done, so it never stays in the way.
 */
export async function GettingStarted({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const [whatsapp, services, autoReply, agent, inbound] = await Promise.all([
    supabase
      .from("channel_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .eq("status", "active"),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("auto_reply_settings").select("business_hours").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("ai_agent_settings").select("enabled").eq("organization_id", organizationId).maybeSingle(),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("direction", "inbound")
      .limit(1),
  ]);

  const steps = buildChecklist({
    whatsappConnected: (whatsapp.count ?? 0) > 0,
    servicesCount: services.count ?? 0,
    hasBusinessHours: Object.keys((autoReply.data?.business_hours ?? {}) as object).length > 0,
    aiEnabled: agent.data?.enabled === true,
    hasCustomerMessage: (inbound.count ?? 0) > 0,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <section aria-labelledby="primeiros-passos" className="mx-4 mt-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="primeiros-passos" className="font-semibold">
          Primeiros passos
        </h2>
        <span className="text-sm text-text-muted tabular">
          {done} de {steps.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid gap-1">
        {steps.map((step) => {
          const current = step === next;
          const body = (
            <>
              <span
                className={cx(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  step.done ? "bg-brand text-white" : current ? "ring-2 ring-brand text-brand" : "ring-1 ring-border text-text-muted",
                )}
              >
                {step.done ? <Icon name="check" className="size-3.5" /> : null}
              </span>
              <span className="min-w-0">
                <span className={cx("block text-sm font-medium", step.done && "text-text-muted line-through")}>{step.title}</span>
                {current ? <span className="mt-0.5 block text-sm text-pretty text-text-muted">{step.text}</span> : null}
              </span>
            </>
          );
          return (
            <li key={step.key}>
              {step.href && !step.done ? (
                <Link
                  href={step.href}
                  className={cx("flex min-h-11 gap-3 rounded-lg px-2 py-2 hover:bg-background", current && "bg-brand-soft/60 hover:bg-brand-soft")}
                >
                  {body}
                </Link>
              ) : (
                <div className={cx("flex min-h-11 gap-3 px-2 py-2", current && "rounded-lg bg-brand-soft/60")}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
