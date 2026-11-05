import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md";

/**
 * primary: the single main action of a screen (brand).
 * secondary: neutral actions. ghost: low emphasis. danger: destructive.
 * Touch targets stay >= 44px on mobile; "sm" shrinks only from the sm breakpoint.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}) {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    size === "md" ? "min-h-11 px-4 text-sm" : "min-h-11 px-3 text-sm sm:min-h-9",
    variant === "primary" && "bg-brand text-white shadow-sm hover:bg-brand-hover",
    variant === "secondary" && "border border-border bg-surface text-text shadow-xs hover:bg-background",
    variant === "ghost" && "text-text-muted hover:bg-background hover:text-text",
    variant === "danger" && "bg-danger text-white shadow-sm hover:bg-danger/90",
    variant === "danger-ghost" && "text-danger hover:bg-danger/10",
    block && "w-full",
  );
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; loading?: boolean }) {
  return (
    <button
      type={type}
      className={cx(buttonClasses({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

/** Internal navigation styled as a button. */
export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return <Link className={cx(buttonClasses({ variant, size, block }), className)} {...props} />;
}

/** External link styled as a button (opens in a new tab). */
export function ButtonAnchor({
  variant,
  size,
  block,
  className,
  ...props
}: ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cx(buttonClasses({ variant, size, block }), className)}
      {...props}
    />
  );
}

/** Square icon-only button; always pass an aria-label. */
export function IconButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { "aria-label": string }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-grid size-11 place-items-center rounded-lg text-text-muted transition-colors hover:bg-background hover:text-text disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
