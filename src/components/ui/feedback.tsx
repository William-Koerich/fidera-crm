import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons";
import { cx } from "./cx";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const BADGE: Record<Tone, string> = {
  neutral: "bg-background text-text-muted ring-border",
  info: "bg-info-soft text-info ring-info/15",
  success: "bg-success/10 text-success ring-success/15",
  warning: "bg-warning/10 text-warning ring-warning/20",
  danger: "bg-danger/10 text-danger ring-danger/15",
  brand: "bg-brand-soft text-brand ring-brand/15",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ALERT: Record<Exclude<Tone, "brand" | "neutral">, { box: string; icon: IconName }> = {
  info: { box: "border-info/20 bg-info-soft text-info", icon: "info" },
  success: { box: "border-success/20 bg-success/10 text-success", icon: "check" },
  warning: { box: "border-warning/25 bg-warning/10 text-warning", icon: "alert" },
  danger: { box: "border-danger/20 bg-danger/10 text-danger", icon: "alert" },
};

/** Inline message about the current screen. Errors are announced (role=alert). */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Exclude<Tone, "brand" | "neutral">;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon } = ALERT[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}>
      <Icon name={icon} className="mt-0.5 size-4" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cx(title ? "mt-0.5 text-text/80" : null, "[&_a]:font-medium [&_a]:underline")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="font-display text-xl font-medium text-text">{title}</h2>
      {description ? <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
