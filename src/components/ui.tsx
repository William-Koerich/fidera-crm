import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * primary: the one main action of a screen (brand purple).
 * secondary: neutral actions. danger: destructive. ghost: low-emphasis.
 */
export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-brand text-white hover:bg-brand-hover",
        variant === "secondary" && "border border-border bg-surface text-text hover:bg-background",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        variant === "ghost" && "text-text-muted hover:bg-background",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none focus:border-info focus:ring-2 focus:ring-info/20",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "min-h-11 rounded-xl border border-border bg-surface px-3 text-text outline-none focus:border-info focus:ring-2 focus:ring-info/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, ...props }: ComponentProps<"label">) {
  return (
    <label className="grid gap-1 text-sm font-medium text-text" {...props}>
      {children}
    </label>
  );
}

export function Card({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-border bg-surface p-4", className)}>
      {title ? <h2 className="mb-3 text-base font-semibold text-text">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-xl px-3 py-2 text-sm",
        tone === "info" && "bg-info-soft text-info",
        tone === "error" && "bg-danger/10 text-danger",
        tone === "success" && "bg-success/10 text-success",
        tone === "warning" && "bg-warning/10 text-warning",
      )}
    >
      {children}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-border", className)} />;
}

export { cx };
