import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

const control =
  "w-full rounded-lg border border-border bg-surface px-3 text-base text-text shadow-xs transition-colors placeholder:text-text-muted/70 " +
  "hover:border-text-muted/40 focus:border-info focus:outline-none focus:ring-3 focus:ring-info/15 " +
  "disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70 " +
  "aria-invalid:border-danger aria-invalid:focus:ring-danger/15 sm:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(control, "min-h-11 sm:min-h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(control, "min-h-11 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cx(control, "min-h-11 appearance-none pr-9 sm:min-h-10", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

/**
 * Label + control + hint/error, wired with ids. Pass the same `id` to the
 * control and spread `fieldA11y(id, { hint, error })` on it.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {optional ? <span className="font-normal text-text-muted"> (opcional)</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function fieldA11y(id: string, { hint, error }: { hint?: unknown; error?: unknown } = {}) {
  const describedBy = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ");
  return {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy || undefined,
  };
}
