import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar, Badge, Panel, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canManage, requireMembership } from "@/lib/auth";
import { formatDate } from "@/lib/inbox/format";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { changeRoleAction, removeMemberAction, revokeInvitationAction } from "../../org-actions";
import { InviteForm } from "../invite-form";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = { title: "Equipe" };

type Role = Enums<"membership_role">;
const ROLE_LABEL: Record<Role, string> = { owner: "Dono", admin: "Administrador", member: "Membro" };

export default function TeamPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const me = await requireMembership();
  const supabase = await createClient();
  const manage = canManage(me.role);

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.rpc("list_members", { org_id: me.organizationId }),
    manage
      ? supabase
          .from("invitations")
          .select("id, email, role, expires_at")
          .eq("organization_id", me.organizationId)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: Role; expires_at: string }[] }),
  ]);

  return (
    <>
      <Panel
        flush
        title="Pessoas com acesso"
        description="Dono: tudo, inclusive a equipe. Administrador: equipe e canais. Membro: atende as conversas."
      >
        <ul className="divide-y divide-border">
          {(members ?? []).map((m) => {
            const isMe = m.user_id === me.user.id;
            const editable = manage && !isMe && (me.role === "owner" || m.role !== "owner");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={m.email.split("@")[0]} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.email}
                    {isMe ? <span className="font-normal text-text-muted"> (você)</span> : null}
                  </p>
                  <p className="text-xs text-text-muted">Desde {formatDate(m.created_at)}</p>
                </div>
                {editable ? (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <RoleSelect
                      userId={m.user_id}
                      email={m.email}
                      role={m.role}
                      allowOwner={me.role === "owner"}
                      action={changeRoleAction}
                    />
                    <ConfirmDialog
                      trigger="Remover"
                      title={`Remover ${m.email}?`}
                      description="A pessoa perde o acesso a este negócio na hora. As conversas e mensagens continuam salvas. Você pode convidar de novo depois."
                      confirmLabel="Remover acesso"
                      action={removeMemberAction}
                      fields={{ userId: m.user_id }}
                    />
                  </div>
                ) : (
                  <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      {manage ? (
        <Panel
          title="Convidar pessoa"
          description="Gere um link de convite e envie pelo WhatsApp ou e-mail. Ninguém recebe acesso sem aceitar."
        >
          <InviteForm />
          {invites && invites.length > 0 ? (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-medium">Convites pendentes</h3>
              <ul className="mt-2 divide-y divide-border">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{i.email}</p>
                      <p className="text-xs text-text-muted">
                        {ROLE_LABEL[i.role]} · vale até {formatDate(i.expires_at)}
                      </p>
                    </div>
                    <ConfirmDialog
                      trigger="Cancelar convite"
                      title="Cancelar este convite?"
                      description={`O link enviado para ${i.email} deixa de funcionar.`}
                      confirmLabel="Cancelar convite"
                      action={revokeInvitationAction}
                      fields={{ id: i.id }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : (
        <p className="text-sm text-text-muted">Apenas donos e administradores podem convidar pessoas.</p>
      )}
    </>
  );
}
