import { cx } from "./cx";

/** Initials from a name ("Ana Souza" -> "AS"), or the last digits of a phone. */
export function initials(name: string | null | undefined, phone?: string | null): string {
  // Ignore notes in parentheses, e.g. "Ana Souza (cliente antiga)".
  const clean = (name ?? "").replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\s]/gu, " ").trim();
  if (clean) {
    const parts = clean.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
  }
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-2) : "?";
}

export function Avatar({
  name,
  phone,
  src,
  size = "md",
  className,
}: {
  name?: string | null;
  phone?: string | null;
  /** Photo drawn over the initials, which remain visible if it fails to load. */
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-background font-semibold text-text-muted ring-1 ring-border",
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-14 text-base",
        className,
      )}
    >
      {initials(name, phone)}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- private route, already small
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : null}
    </span>
  );
}
