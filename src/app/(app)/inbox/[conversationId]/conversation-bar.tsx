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
  setContactLabelAction,
  setContactOwnerAction,
  setDepartmentAction,
} from "../team-actions";
import { AssigneeSelect } from "./assignee-select";

/** How the team organizes this conversation. Collapsed so the messages keep the space on phones. */
export function ConversationBar({
  conversationId,
  status,
  assignedTo,
  departmentId,
  contactOwnerId,
  canChangeOwner,
  contactLabelIds,
  members,
  currentUserId,
  departments,
  endings,
  labels,
  ratingEnabled,
}: {
  conversationId: string;
  status: "open" | "closed";
  assignedTo: string | null;
  departmentId: string | null;
  contactOwnerId: string | null;
  canChangeOwner: boolean;
  contactLabelIds: string[];
  members: TeamMember[];
  currentUserId: string;
  departments: InboxOption[];
  endings: InboxOption[];
  labels: InboxOption[];
  ratingEnabled: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [department, setDepartment] = useState(departmentId ?? "");
  const [owner, setOwner] = useState(contactOwnerId ?? "");
  const [activeLabels, setActiveLabels] = useState(() => new Set(contactLabelIds));
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
    <details className="group border-b border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm sm:px-4 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">Atendimento</span>
        <span className="min-w-0 flex-1 truncate text-text-muted">
          {status === "closed" ? "Finalizada" : assignee ? assignee.email : "Sem responsável"}
        </span>
        <span aria-hidden className="text-lg leading-none text-text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>

      <div className="grid gap-4 border-t border-border p-3 sm:px-4">
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
                  {m.email}
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

        {labels.length > 0 ? (
          <fieldset>
            <legend className="mb-1 text-sm text-text-muted">Etiquetas do contato</legend>
            <div className="flex flex-wrap gap-x-4">
              {labels.map((label) => (
                <label key={label.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand"
                    checked={activeLabels.has(label.id)}
                    disabled={pending}
                    onChange={(e) => {
                      const on = e.target.checked;
                      const change = (value: boolean) =>
                        setActiveLabels((current) => {
                          const copy = new Set(current);
                          if (value) copy.add(label.id);
                          else copy.delete(label.id);
                          return copy;
                        });
                      change(on);
                      run(() => setContactLabelAction(conversationId, label.id, on), () => change(!on));
                    }}
                  />
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: label.color ?? undefined }} />
                  {label.name}
                </label>
              ))}
            </div>
          </fieldset>
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
