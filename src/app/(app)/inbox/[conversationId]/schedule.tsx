"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { confirmationText, type SavedAppointment, type ServiceOption } from "@/lib/agenda/form";
import { findDateTimes } from "@/lib/agenda/date-parser";
import { isoToLocal } from "@/lib/agenda/form";
import type { TeamMember } from "@/lib/inbox/queries";
import { AppointmentDialog, type AppointmentDraft } from "../../agenda/appointment-dialog";

type OpenSchedule = (when: { date: string; time: string | null }) => void;

interface ScheduleContextValue {
  open: OpenSchedule;
  /** Text offered to the person after booking, until they use or dismiss it. */
  confirmation: string | null;
  dismissConfirmation: () => void;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

/** Lets anything in the conversation open the booking form, already filled in for this client. */
export function ScheduleProvider({
  children,
  conversationId,
  clientName,
  hasContactName,
  defaultStaffId,
  members,
  services,
}: {
  children: ReactNode;
  conversationId: string;
  clientName: string;
  /** False when clientName is only a phone number, which a greeting should not use. */
  hasContactName: boolean;
  defaultStaffId: string | null;
  members: TeamMember[];
  services: ServiceOption[];
}) {
  const [draft, setDraft] = useState<(AppointmentDraft & { nonce: number }) | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

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

  const value = useMemo(
    () => ({ open, confirmation, dismissConfirmation: () => setConfirmation(null) }),
    [open, confirmation],
  );

  return (
    <ScheduleContext value={value}>
      {children}
      {draft ? (
        <AppointmentDialog
          key={draft.nonce}
          draft={draft}
          members={members}
          services={services}
          onClose={() => setDraft(null)}
          onSaved={(saved: SavedAppointment) => setConfirmation(confirmationText(saved, hasContactName))}
        />
      ) : null}
    </ScheduleContext>
  );
}

export function useSchedule(): OpenSchedule {
  const context = useContext(ScheduleContext);
  if (!context) throw new Error("useSchedule must be inside ScheduleProvider");
  return context.open;
}

/** The confirmation waiting to be offered in the message box. */
export function useBookingConfirmation() {
  const context = useContext(ScheduleContext);
  return { text: context?.confirmation ?? null, dismiss: context?.dismissConfirmation ?? (() => {}) };
}

/** A message's text, with each date or time it mentions as a link that books it. */
export function MessageText({ text, sentAt }: { text: string; sentAt: string }) {
  const open = useContext(ScheduleContext)?.open;
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
