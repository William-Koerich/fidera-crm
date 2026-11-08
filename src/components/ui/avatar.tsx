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

/** Warm pastels, each with ink that passes 4.5:1. Chosen from the name, so a person keeps theirs. */
const TONES = [
  "bg-[#f3c9b8] text-[#5a2a17]",
  "bg-[#c9e4d8] text-[#1e4a37]",
  "bg-[#d6dcf5] text-[#26326b]",
  "bg-[#ecd5f5] text-[#5b1d74]",
  "bg-[#f6e0b5] text-[#5c3d0a]",
  "bg-[#cfe7ef] text-[#164052]",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length]!;
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
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold",
        toneFor(name || phone || "?"),
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-18 text-xl",
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
