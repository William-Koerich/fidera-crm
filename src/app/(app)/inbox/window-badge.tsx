"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/inbox/format";

/** Remaining time of the 24h reply window, updated every 30s. */
export function WindowBadge({ endsAt, compact = false }: { endsAt: string | null; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!endsAt || now === null) return null;
  const remaining = new Date(endsAt).getTime() - now;
  const open = remaining > 0;
  const urgent = open && remaining < 2 * 3_600_000;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        !open ? "bg-background text-text-muted" : urgent ? "bg-warning/10 text-warning" : "bg-info-soft text-info"
      }`}
      title="Tempo para responder pela API dentro da janela de 24h"
    >
      {open ? (compact ? formatRemaining(remaining) : `Janela: ${formatRemaining(remaining)}`) : "Janela fechada"}
    </span>
  );
}
