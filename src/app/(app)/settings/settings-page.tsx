import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/ui";

/** One Ajustes page: its title, a way back to the menu on phones, and its content. */
export function SettingsPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <header>
        <Link
          href="/settings"
          className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-text-muted hover:text-text lg:hidden"
        >
          <Icon name="back" className="size-4" />
          Ajustes
        </Link>
        <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em] sm:text-[2rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-prose text-[0.95rem] text-text-muted">{description}</p> : null}
      </header>
      <Suspense fallback={<Skeleton className="h-64 rounded-[var(--radius-card)]" />}>{children}</Suspense>
    </div>
  );
}

export function ManagersOnly() {
  return <p className="text-sm text-text-muted">Apenas donos e administradores podem alterar isto.</p>;
}
