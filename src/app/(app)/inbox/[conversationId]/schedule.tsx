"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AppointmentDialog, type AppointmentDraft } from "../../agenda/appointment-dialog";
import { findDateTimes } from "@/lib/agenda/date-parser";
import { isoToLocal } from "@/lib/agenda/form";
import type { TeamMember } from "@/lib/inbox/queries";

type OpenSchedule = (when: { date: string; time: string | null }) => void;

const ScheduleContext = createContext<OpenSchedule | null>(null);

/** Lets anything in the conversation open the booking form, already filled in for this client. */
export function ScheduleProvider({
  children,
  conversationId,
  clientName,
  defaultStaffId,
  members,
}: {
  children: ReactNode;
  conversationId: string;
  clientName: string;
  defaultStaffId: string | null;
  members: TeamMember[];
}) {
  const [draft, setDraft] = useState<(AppointmentDraft & { nonce: number }) | null>(null);

  const open = useCallback<OpenSchedule>(
    ({ date, time }) =>
      setDraft((current) => ({
        nonce: (current?.nonce ?? 0) + 1,
        conversationId,
        clientName,
        date,
        time: time ?? "",
        durationMinutes: 30,
        staffId: defaultStaffId,
      })),
    [clientName, conversationId, defaultStaffId],
  );

  return (
    <ScheduleContext value={open}>
      {children}
      {draft ? <AppointmentDialog key={draft.nonce} draft={draft} members={members} onClose={() => setDraft(null)} /> : null}
    </ScheduleContext>
  );
}

export function useSchedule(): OpenSchedule {
  const open = useContext(ScheduleContext);
  if (!open) throw new Error("useSchedule must be inside ScheduleProvider");
  return open;
}

/** A message's text, with each date or time it mentions as a link that books it. */
export function MessageText({ text, sentAt }: { text: string; sentAt: string }) {
  const open = useContext(ScheduleContext);
  const matches = useMemo(() => (open ? findDateTimes(text, sentAt) : []), [open, text, sentAt]);

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    parts.push(text.slice(cursor, match.start));
    parts.push(
      <button
        key={match.start}
        type="button"
        onClick={() => open?.({ date: match.date, time: match.time })}
        aria-label={`Agendar: ${match.text}`}
        className="rounded font-medium text-info underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {match.text}
      </button>,
    );
    cursor = match.end;
  }
  parts.push(text.slice(cursor));

  return <p className="whitespace-pre-wrap break-words">{parts}</p>;
}

/** Books with no date in the messages: suggests today, at the next full hour. */
export function ScheduleButton({ className, children }: { className?: string; children: ReactNode }) {
  const open = useSchedule();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const now = isoToLocal(new Date());
        open({ date: now.date, time: `${String((Number(now.time.slice(0, 2)) + 1) % 24).padStart(2, "0")}:00` });
      }}
    >
      {children}
    </button>
  );
}
