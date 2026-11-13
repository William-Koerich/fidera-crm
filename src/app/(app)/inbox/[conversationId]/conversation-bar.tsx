"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/field";
import type { InboxOption, TeamMember } from "@/lib/inbox/queries";
import {
  finishConversationAction,
  reopenConversationAction,
  setContactOwnerAction,
  setDepartmentAction,
} from "../team-actions";
import { AssigneeSelect } from "./assignee-select";
import { ConversationSummary } from "./conversation-summary";
import { ScheduleButton } from "./schedule";
import { memberName } from "@/lib/team";

/** How the team organizes this conversation. Collapsed so the messages keep the space on phones. */
export function ConversationBar({
  conversationId,
  status,
  assignedTo,
  departmentId,
  contactOwnerId,
  canChangeOwner,
  members,
  currentUserId,
  departments,
  endings,
  ratingEnabled,
  upcoming,
  aiEnabled,
}: {
  conversationId: string;
  status: "open" | "closed";
  assignedTo: string | null;
  departmentId: string | null;
  contactOwnerId: string | null;
  canChangeOwner: boolean;
  members: TeamMember[];
  currentUserId: string;
  departments: InboxOption[];
  endings: InboxOption[];
  ratingEnabled: boolean;
  upcoming: string[];
  aiEnabled: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [department, setDepartment] = useState(departmentId ?? "");
  const [owner, setOwner] = useState(contactOwnerId ?? "");
  const [pending, startTransition] = useTransition();

  const router = useRouter();

  const run = (work: () => Promise<{ status: string; notice?: string; lostAccess?: boolean } | null>, undo?: () => void) => {
    setNotice(null);
    startTransition(async () => {
      const result = await work().catch(() => null);
      if (result?.lostAccess) {
        router.replace("/inbox");
        return;
      }
      if (result?.status !== "saved") undo?.();
      setNotice(result ? (result.notice ?? null) : "Não foi possível salvar. Tente de novo.");
    });
  };

  const assignee = members.find((m) => m.id === assignedTo);

  return (
    <details className="group shrink-0 border-b border-border bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm sm:px-4 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">Atendimento</span>
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {upcoming[0] ? `Agendado: ${upcoming[0]}` : status === "closed" ? "Finalizada" : assignee ? memberName(assignee) : "Sem responsável"}
        </span>
        <span aria-hidden className="text-lg leading-none text-text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>

      <div className="relative grid max-h-[45dvh] gap-4 overflow-y-auto overscroll-contain border-t border-border p-3 sm:px-4">
        <div className="grid gap-2">
          {upcoming.length > 0 ? (
            <div>
              <p className="text-sm text-text-muted">Próximos horários</p>
              <ul className="mt-1 grid gap-0.5 text-sm">
                {upcoming.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <ScheduleButton className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover sm:min-h-9">
              Agendar cliente
            </ScheduleButton>
          </div>
        </div>

        {aiEnabled ? <ConversationSummary conversationId={conversationId} /> : null}

        <AssigneeSelect conversationId={conversationId} assignedTo={assignedTo} members={members} currentUserId={currentUserId} />

        <div className="flex items-center gap-3">
          <label htmlFor="contact-owner" className="w-24 shrink-0 text-sm text-text-muted">
            Dono do cliente
          </label>
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Select
              id="contact-owner"
              value={owner}
              disabled={pending || !canChangeOwner}
              onChange={(e) => {
                const previous = owner;
                const next = e.target.value;
                setOwner(next);
                run(() => setContactOwnerAction(conversationId, next), () => setOwner(previous));
              }}
            >
              <option value="">Ninguém</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberName(m)}
                  {m.id === currentUserId ? " (você)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {departments.length > 0 ? (
          <div className="flex items-center gap-3">
            <label htmlFor="conversation-department" className="w-24 shrink-0 text-sm text-text-muted">
              Departamento
            </label>
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <Select
                id="conversation-department"
                value={department}
                disabled={pending}
                onChange={(e) => {
                  const previous = department;
                  const next = e.target.value;
                  setDepartment(next);
                  run(() => setDepartmentAction(conversationId, next), () => setDepartment(previous));
                }}
              >
                <option value="">Nenhum</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}

        <div>
          {status === "closed" ? (
            <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => reopenConversationAction(conversationId))}>
              Reabrir conversa
            </Button>
          ) : (
            <ConfirmDialog
              trigger="Finalizar conversa"
              triggerVariant="secondary"
              title="Finalizar esta conversa?"
              description={
                <div className="grid gap-2">
                  <p>Ela sai das conversas abertas. Se o cliente escrever de novo, volta sozinha.</p>
                  <label htmlFor="finish-ending" className="mt-1 font-medium text-text">
                    Motivo
                  </label>
                  <Select id="finish-ending" name="endingId" defaultValue="">
                    <option value="">Sem motivo</option>
                    {endings.map((ending) => (
                      <option key={ending.id} value={ending.id}>
                        {ending.name}
                      </option>
                    ))}
                  </Select>
                  {ratingEnabled ? (
                    <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-text">
                      <input type="checkbox" name="askRating" defaultChecked className="size-5 shrink-0 accent-brand" />
                      Pedir avaliação ao cliente
                    </label>
                  ) : null}
                </div>
              }
              confirmLabel="Finalizar"
              confirmVariant="primary"
              action={async (formData) => {
                const result = await finishConversationAction(
                  conversationId,
                  String(formData.get("endingId") ?? ""),
                  formData.get("askRating") === "on",
                ).catch(() => null);
                setNotice(result ? (result.notice ?? null) : "Não foi possível finalizar. Tente de novo.");
              }}
              fields={{}}
            />
          )}
        </div>

        {notice ? (
          <p role="status" className="text-xs text-text-muted">
            {notice}
          </p>
        ) : null}
      </div>
    </details>
  );
}
