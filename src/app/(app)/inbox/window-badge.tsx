"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/feedback";
import { formatRemaining } from "@/lib/inbox/format";

/**
 * Remaining time of the 24h reply window (updates every 30s). Blue while
 * open, amber in the last 2 hours, neutral when closed.
 */
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
  const text = open ? (compact ? formatRemaining(remaining) : `Responder em ${formatRemaining(remaining)}`) : "Janela fechada";

  return (
    <Badge tone={!open ? "neutral" : urgent ? "warning" : "info"}>
      <Icon name="clock" className="size-3" />
      <span>
        <span className="sr-only">Janela de resposta: </span>
        {text}
      </span>
    </Badge>
  );
}
