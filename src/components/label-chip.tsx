import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A label as a small colored pill. The color tints the background and the dot; the text stays in
 * the normal ink so it reads on any color. A funnel stage also gets an outline in its color.
 */
export function LabelChip({
  name,
  color,
  stage,
  size = "sm",
  className,
  children,
}: {
  name: string;
  color: string;
  stage?: boolean;
  size?: "xs" | "sm";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium text-text",
        size === "xs" ? "h-5 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
        borderColor: stage ? `color-mix(in oklab, ${color} 60%, transparent)` : "transparent",
      }}
    >
      <span aria-hidden className={cx("shrink-0 rounded-full", size === "xs" ? "size-1.5" : "size-2")} style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
      {children}
    </span>
  );
}
