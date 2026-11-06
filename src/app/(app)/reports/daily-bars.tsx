"use client";

import { useState, type KeyboardEvent } from "react";
import { cx } from "@/components/ui";
import type { ChartBucket } from "@/lib/reports/period";

const count = (n: number) => `${n} ${n === 1 ? "atendimento" : "atendimentos"}`;

/** Atendimentos per period. Each column is its own hit target, taller and wider than its bar. */
export function DailyBars({ buckets, unit }: { buckets: ChartBucket[]; unit: "dia" | "semana" }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...buckets.map((b) => b.attendances), 1);
  const shown = active === null ? null : buckets[active];

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    setActive((current) => Math.min(buckets.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : buckets.length)) + step)));
  }

  return (
    <div>
      <p role="status" className="min-h-5 text-sm text-text-muted">
        {shown ? `${shown.label}: ${count(shown.attendances)}` : `Maior ${unit}: ${count(max)}. Passe o dedo ou o mouse para ver cada ${unit}.`}
      </p>
      <div
        role="group"
        aria-label={`Atendimentos por ${unit}. Use as setas para percorrer.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="mt-2 flex h-44 items-end border-b border-border"
      >
        {buckets.map((bucket, i) => (
          <div
            key={bucket.label}
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
            className="flex h-full min-w-0 flex-1 items-end justify-center px-px"
          >
            {bucket.attendances > 0 ? (
              <div
                className={cx("w-full max-w-6 rounded-t bg-brand transition-opacity", active !== null && active !== i && "opacity-40")}
                style={{ height: `${Math.max((bucket.attendances / max) * 100, 2)}%` }}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-text-muted tabular">
        <span>{buckets[0]!.label}</span>
        <span>{buckets.at(-1)!.label}</span>
      </div>
    </div>
  );
}
