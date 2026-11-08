import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "../icons";
import { cx } from "./cx";

/** Bordered surface. Do not nest panels inside panels. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding (lists that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section className={cx("rounded-[var(--radius-card)] border border-border bg-surface shadow-xs", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 pt-5 pb-1 sm:px-6">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-base font-semibold text-text">{title}</h2> : null}
            {description ? <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? (title || actions ? "pt-3" : undefined) : "p-5 sm:p-6"}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cx("flex flex-wrap items-end gap-x-4 gap-y-3", className)}>
      <div className="min-w-0 flex-1 basis-72">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-text-muted hover:text-text sm:min-h-0"
          >
            <Icon name="back" className="size-4" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em] text-text sm:text-[2rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-prose text-[0.95rem] text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** Link-based tabs (server-friendly). Active tab uses the info color (selection). */
export function TabLinks({
  items,
  active,
  label,
  className,
}: {
  items: { href: string; label: ReactNode; key: string; count?: number }[];
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cx("-mx-1 flex gap-1 overflow-x-auto px-1", className)}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors sm:min-h-9",
              isActive ? "bg-plum text-on-plum" : "border border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            {item.label}
            {item.count ? (
              <span className={cx("rounded-full px-1.5 text-xs", isActive ? "bg-white/15" : "bg-sunken")}>{item.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Two-column key/value list for details. */
export function DescriptionList({ items }: { items: { term: ReactNode; detail: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {items.map((item, i) => (
        <div key={i} className="grid gap-0.5">
          <dt className="text-xs font-medium text-text-muted">{item.term}</dt>
          <dd className="text-text">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
