"use client";

import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DURATIONS, durationLabel, matchService, type SavedAppointment, type ServiceOption } from "@/lib/agenda/form";
import type { TeamMember } from "@/lib/inbox/queries";
import { saveAppointmentAction, type AppointmentFormState } from "./actions";

export interface AppointmentDraft {
  appointmentId?: string;
  conversationId?: string;
  clientName: string;
  date: string;
  time: string;
  durationMinutes: number;
  service?: string | null;
  notes?: string | null;
  staffId?: string | null;
}

/**
 * Create or edit an appointment. Mounted fresh for each draft, so the fields start from it.
 * `footer` holds extra actions when editing, like cancelling.
 */
export function AppointmentDialog({
  draft,
  members,
  services,
  onClose,
  onSaved,
  footer,
}: {
  draft: AppointmentDraft;
  members: TeamMember[];
  services: ServiceOption[];
  onClose: () => void;
  onSaved?: (saved: SavedAppointment) => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<AppointmentFormState, FormData>(saveAppointmentAction, { status: "idle" });
  const toast = useToast();
  const [duration, setDuration] = useState(String(draft.durationMinutes));

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    if (state.status !== "saved") return;
    toast(draft.appointmentId ? "Agendamento atualizado." : "Cliente agendado.");
    if (state.saved) onSaved?.(state.saved);
    ref.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per save
  }, [state.savedAt]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="appointment-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-text/40"
    >
      <KeepValuesForm action={action} className="grid gap-4 p-5">
        <h2 id="appointment-title" className="text-base font-semibold">
          {draft.appointmentId ? "Editar agendamento" : "Novo agendamento"}
        </h2>
        {draft.appointmentId ? <input type="hidden" name="appointmentId" value={draft.appointmentId} /> : null}
        {draft.conversationId ? <input type="hidden" name="conversationId" value={draft.conversationId} /> : null}

        <Field id="appointment-client" label="Cliente">
          <Input {...fieldA11y("appointment-client")} name="clientName" defaultValue={draft.clientName} maxLength={120} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="appointment-date" label="Data" className="min-w-0">
            <Input {...fieldA11y("appointment-date")} type="date" name="date" defaultValue={draft.date} required className="min-w-0 px-2 sm:px-3" />
          </Field>
          <Field id="appointment-time" label="Horário" className="min-w-0">
            <Input {...fieldA11y("appointment-time")} type="time" name="time" defaultValue={draft.time} required className="min-w-0 px-2 sm:px-3" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="appointment-duration" label="Duração" className="min-w-0">
            <Select {...fieldA11y("appointment-duration")} name="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="appointment-staff" label="Profissional" className="min-w-0">
            <Select {...fieldA11y("appointment-staff")} name="staffId" defaultValue={draft.staffId ?? ""}>
              <option value="">A definir</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.email}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field id="appointment-service" label="Serviço" optional>
          <Input
            {...fieldA11y("appointment-service")}
            name="service"
            list="appointment-services"
            defaultValue={draft.service ?? ""}
            maxLength={120}
            autoComplete="off"
            placeholder="Corte, escova, barba…"
            onChange={(e) => {
              const service = matchService(services, e.target.value);
              if (service) setDuration(String(service.durationMinutes));
            }}
          />
          <datalist id="appointment-services">
            {services.map((service) => (
              <option key={service.id} value={service.name} />
            ))}
          </datalist>
        </Field>
        <Field id="appointment-notes" label="Observação" optional>
          <Textarea {...fieldA11y("appointment-notes")} name="notes" defaultValue={draft.notes ?? ""} maxLength={1000} rows={2} />
        </Field>

        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            Fechar
          </Button>
          <Button type="submit" loading={pending}>
            {draft.appointmentId ? "Salvar" : "Agendar"}
          </Button>
        </div>
        {footer ? <div className="border-t border-border pt-4">{footer}</div> : null}
      </KeepValuesForm>
    </dialog>
  );
}
