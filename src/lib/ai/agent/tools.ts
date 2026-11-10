/**
 * What the AI attendant can do, and the checks around it. The database sits behind AgentPort, so
 * every rule here is tested with a fake. The model only ever touches this conversation's client.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, formatDay, isoToLocal, localDateTimeToIso } from "../../agenda/time";
import { daysWithSlots, freeSlots, type Availability } from "../../bot/slots";
import type { AgentSettings } from "./config";
import type { AgentService } from "./prompt";

/** Bookings this far ahead at most: the agenda's free times are loaded for this window. */
export const BOOKING_HORIZON_DAYS = 30;
const MAX_TIMES_LISTED = 24;

export interface UpcomingAppointment {
  id: string;
  service: string | null;
  startsAt: string;
}

export interface AgentPort {
  /** Fresh = reload after a booking was refused because someone took the time meanwhile. */
  availability(fresh?: boolean): Promise<Availability>;
  upcoming(): Promise<UpcomingAppointment[]>;
  book(input: { clientName: string; serviceName: string; staffId: string; startsAt: string; endsAt: string }): Promise<
    { ok: true; id: string } | { ok: false; reason: "conflict" | "failed" }
  >;
  cancel(appointmentId: string): Promise<boolean>;
  handoff(reason: string): Promise<void>;
}

/** What the AI did, for the team's notes in the conversation. */
export type AgentAction =
  | { kind: "booked"; service: string; day: string; time: string }
  | { kind: "cancelled"; service: string | null; day: string; time: string }
  | { kind: "handoff"; reason: string };

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  action?: AgentAction;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

export function agentTools(settings: AgentSettings): Anthropic.Beta.BetaTool[] {
  const tools: Anthropic.Beta.BetaTool[] = [
    {
      name: "ver_horarios_livres",
      description:
        "Mostra os horários livres na agenda para um serviço. Com um dia (AAAA-MM-DD), lista os horários desse dia; com dia vazio, lista os próximos dias que têm vaga. Use sempre antes de oferecer ou confirmar um horário.",
      strict: true,
      input_schema: object(
        {
          servico_id: { type: "string", description: "O id do serviço, da lista de serviços." },
          dia: { type: "string", description: "AAAA-MM-DD, ou vazio para ver os próximos dias com vaga." },
        },
        ["servico_id", "dia"],
      ),
    },
    {
      name: "meus_agendamentos",
      description: "Lista os próximos agendamentos deste cliente, com o id de cada um.",
      strict: true,
      input_schema: object({}, []),
    },
    {
      name: "chamar_equipe",
      description:
        "Passa a conversa para a equipe e para de responder nela. Use quando o cliente pedir uma pessoa, reclamar, ou quando você não puder ou não souber ajudar.",
      strict: true,
      input_schema: object({ motivo: { type: "string", description: "Em poucas palavras, para a equipe: o que o cliente precisa." } }, ["motivo"]),
    },
  ];
  if (settings.canBook) {
    tools.push({
      name: "agendar",
      description:
        "Marca o cliente na agenda. Só use depois de consultar ver_horarios_livres e de o cliente confirmar serviço, dia e horário.",
      strict: true,
      input_schema: object(
        {
          servico_id: { type: "string", description: "O id do serviço, da lista de serviços." },
          dia: { type: "string", description: "AAAA-MM-DD" },
          horario: { type: "string", description: "HH:MM, um dos horários livres." },
          nome_cliente: { type: "string", description: "Como o cliente se chama." },
        },
        ["servico_id", "dia", "horario", "nome_cliente"],
      ),
    });
  }
  if (settings.canCancel) {
    tools.push({
      name: "cancelar_agendamento",
      description: "Cancela um agendamento deste cliente, pelo id que meus_agendamentos devolve. Confirme com o cliente antes.",
      strict: true,
      input_schema: object({ agendamento_id: { type: "string" } }, ["agendamento_id"]),
    });
  }
  return tools;
}

const str = (input: unknown, key: string) => {
  const value = (input as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value.trim() : "";
};

function checkDay(day: string, availability: Availability): string | null {
  if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return "Dia inválido: use AAAA-MM-DD.";
  const today = isoToLocal(availability.now).date;
  if (day < today) return "Esse dia já passou.";
  if (day > addDays(today, BOOKING_HORIZON_DAYS)) return `Só dá para agendar até ${BOOKING_HORIZON_DAYS} dias à frente. Chame a equipe se o cliente precisar.`;
  return null;
}

function nextDaysText(service: AgentService, availability: Availability): string {
  const days = daysWithSlots(service.durationMinutes, availability, { limit: 5, horizon: BOOKING_HORIZON_DAYS });
  if (days.length === 0) return `Não há horários livres para ${service.name} nos próximos ${BOOKING_HORIZON_DAYS} dias.`;
  return days
    .map((day) => {
      const times = freeSlots(day, service.durationMinutes, availability).map((s) => s.time);
      return `${formatDay(day)} (${day}): ${times.slice(0, 6).join(", ")}${times.length > 6 ? ` e mais ${times.length - 6}` : ""}`;
    })
    .join("\n");
}

const when = (startsAt: string) => {
  const { date, time } = isoToLocal(startsAt);
  return { day: date, time, label: `${formatDay(date)} às ${time}` };
};

export async function runAgentTool(
  name: string,
  input: unknown,
  context: { settings: AgentSettings; services: AgentService[]; port: AgentPort },
): Promise<ToolOutcome> {
  const { port, services, settings } = context;
  const serviceOf = (id: string) => services.find((s) => s.id === id);

  switch (name) {
    case "ver_horarios_livres": {
      const service = serviceOf(str(input, "servico_id"));
      if (!service) return { content: "Serviço não encontrado: use um id da lista de serviços.", isError: true };
      const availability = await port.availability();
      const day = str(input, "dia");
      if (!day) return { content: `Próximos dias com vaga para ${service.name}:\n${nextDaysText(service, availability)}` };
      const invalid = checkDay(day, availability);
      if (invalid) return { content: invalid, isError: true };
      const times = freeSlots(day, service.durationMinutes, availability).map((s) => s.time);
      if (times.length === 0) {
        return { content: `Sem horários livres para ${service.name} em ${formatDay(day)}. Próximos dias com vaga:\n${nextDaysText(service, availability)}` };
      }
      return {
        content: `Horários livres para ${service.name} em ${formatDay(day)} (${day}): ${times.slice(0, MAX_TIMES_LISTED).join(", ")}${times.length > MAX_TIMES_LISTED ? " (e outros mais tarde)" : ""}.`,
      };
    }

    case "agendar": {
      if (!settings.canBook) return { content: "Agendar está desligado. Chame a equipe.", isError: true };
      const service = serviceOf(str(input, "servico_id"));
      if (!service) return { content: "Serviço não encontrado: use um id da lista de serviços.", isError: true };
      const day = str(input, "dia");
      const time = str(input, "horario");
      const clientName = str(input, "nome_cliente").slice(0, 120);
      if (!clientName) return { content: "Falta o nome do cliente: pergunte antes de agendar.", isError: true };
      if (!TIME.test(time)) return { content: "Horário inválido: use HH:MM.", isError: true };
      let availability = await port.availability();
      const invalid = checkDay(day, availability);
      if (invalid) return { content: invalid, isError: true };

      for (const attempt of [1, 2]) {
        const slot = freeSlots(day, service.durationMinutes, availability).find((s) => s.time === time);
        if (!slot) {
          const others = freeSlots(day, service.durationMinutes, availability).map((s) => s.time);
          return {
            content: `${time} não está livre em ${formatDay(day)} para ${service.name}. ${others.length ? `Livres nesse dia: ${others.slice(0, 12).join(", ")}.` : "Esse dia está sem vagas."} Ofereça outro horário ao cliente.`,
            isError: true,
          };
        }
        const startsAt = localDateTimeToIso(day, time);
        const endsAt = new Date(Date.parse(startsAt) + service.durationMinutes * 60_000).toISOString();
        const result = await port.book({ clientName, serviceName: service.name, staffId: slot.staffId, startsAt, endsAt });
        if (result.ok) {
          return {
            content: `Agendado: ${service.name}, ${formatDay(day)} às ${time}, para ${clientName}. Confirme ao cliente.`,
            action: { kind: "booked", service: service.name, day, time },
          };
        }
        if (result.reason === "failed") return { content: "Não consegui agendar agora. Chame a equipe.", isError: true };
        // Someone took that person's time meanwhile: another free person may still have it.
        if (attempt === 1) availability = await port.availability(true);
      }
      return { content: `${time} acabou de ser ocupado. Consulte de novo e ofereça outro horário.`, isError: true };
    }

    case "meus_agendamentos": {
      const upcoming = await port.upcoming();
      if (upcoming.length === 0) return { content: "Este cliente não tem agendamentos marcados." };
      return {
        content: upcoming.map((a) => `- id ${a.id}: ${a.service ?? "Atendimento"}, ${when(a.startsAt).label}`).join("\n"),
      };
    }

    case "cancelar_agendamento": {
      if (!settings.canCancel) return { content: "Cancelar está desligado. Chame a equipe.", isError: true };
      const id = str(input, "agendamento_id");
      const appointment = (await port.upcoming()).find((a) => a.id === id);
      if (!appointment) return { content: "Agendamento não encontrado entre os deste cliente. Use meus_agendamentos.", isError: true };
      if (!(await port.cancel(appointment.id))) return { content: "Não consegui cancelar agora. Chame a equipe.", isError: true };
      const { day, time, label } = when(appointment.startsAt);
      return {
        content: `Cancelado: ${appointment.service ?? "Atendimento"}, ${label}.`,
        action: { kind: "cancelled", service: appointment.service, day, time },
      };
    }

    case "chamar_equipe": {
      const reason = str(input, "motivo").slice(0, 300) || "O cliente precisa de ajuda.";
      await port.handoff(reason);
      return {
        content: "A equipe foi avisada e você não responde mais nesta conversa. Diga ao cliente, numa frase, que alguém da equipe vai continuar.",
        action: { kind: "handoff", reason },
      };
    }

    default:
      return { content: `Ferramenta desconhecida: ${name}.`, isError: true };
  }
}
