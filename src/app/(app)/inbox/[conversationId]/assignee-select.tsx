"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/field";
import type { TeamMember } from "@/lib/inbox/queries";
import { assignConversationAction } from "../actions";
import { memberName } from "@/lib/team";

/** Who answers this conversation. Picking someone else transfers it. */
export function AssigneeSelect({
  conversationId,
  assignedTo,
  members,
  currentUserId,
}: {
  conversationId: string;
  assignedTo: string | null;
  members: TeamMember[];
  currentUserId: string;
}) {
  const [value, setValue] = useState(assignedTo ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: string) {
    const previous = value;
    setValue(next);
    setNotice(null);
    startTransition(async () => {
      const result = await assignConversationAction(conversationId, next).catch(() => null);
      if (result?.lostAccess) {
        router.replace("/inbox");
        return;
      }
      if (result?.status !== "saved") setValue(previous);
      setNotice(result ? (result.notice ?? null) : "Não foi possível salvar. Tente de novo.");
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <label htmlFor="conversation-assignee" className="w-24 shrink-0 text-sm text-text-muted">
          Responsável
        </label>
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Select
            id="conversation-assignee"
            value={value}
            disabled={pending}
            aria-describedby={notice ? "conversation-assignee-notice" : undefined}
            onChange={(e) => change(e.target.value)}
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
      {notice ? (
        <p id="conversation-assignee-notice" role="status" className="mt-1.5 text-xs text-text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
