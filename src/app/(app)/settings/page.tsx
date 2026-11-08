import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { visibleSections } from "./sections";

export const metadata: Metadata = { title: "Ajustes" };

/** The menu of Ajustes: on phones it is the way in, on wide screens an overview. */
export default function SettingsIndex() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em] sm:text-[2rem]">Ajustes</h1>
        <p className="mt-1.5 text-[0.95rem] text-text-muted">Escolha o que quer configurar.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 rounded-[var(--radius-card)]" />}>
        <Sections />
      </Suspense>
    </div>
  );
}

async function Sections() {
  const me = await requireMembership();
  return (
    <div className="grid gap-7">
      {visibleSections(canManage(me.role)).map((section) => (
        <section key={section.title} aria-labelledby={`settings-${section.title}`}>
          <h2 id={`settings-${section.title}`} className="mb-2.5 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
            {section.title}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {section.items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex min-h-16 items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon name={item.icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="block text-sm text-text-muted">{item.description}</span>
                  </span>
                  <Icon name="chevron-right" className="size-4 shrink-0 text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
