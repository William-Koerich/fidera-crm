import { cx } from "./ui/cx";

/**
 * Fidera mark: a chat bubble with a "come back" arrow (bringing clients back).
 * Same drawing as public/icons/*.svg.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="8" fill="var(--color-brand)" />
      <path
        d="M10.5 8h11A3.5 3.5 0 0 1 25 11.5v7a3.5 3.5 0 0 1-3.5 3.5H15l-4.6 3.6c-.5.4-1.2 0-1.2-.6V22A3.5 3.5 0 0 1 7 18.5v-7A3.5 3.5 0 0 1 10.5 8Z"
        fill="#fff"
      />
      <path
        d="M20 17.5h-6.2a2.75 2.75 0 0 1 0-5.5H19"
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M17.2 15.4 20 17.5l-2.8 2.1"
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-text", className)}>
      <LogoMark className={size === "sm" ? "size-6" : size === "lg" ? "size-9" : "size-7"} />
      <span className={size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg"}>fidera</span>
    </span>
  );
}
