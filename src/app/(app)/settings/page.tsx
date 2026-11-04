import type { Metadata } from "next";
import { Suspense } from "react";
import { Button, Card, Skeleton } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../../login/actions";
import { changeRoleAction, removeMemberAction, revokeInvitationAction } from "../org-actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Ajustes" };

const ROLE_LABEL = { owner: "Dono", admin: "Administrador", member: "Membro" } as const;

export default function SettingsPage() {
  return (
    <main className="grid gap-4 p-4">
      <h1 className="text-xl font-semibold">Ajustes</h1>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Team />
      </Suspense>
      <form action={signOutAction}>
        <Button variant="secondary" type="submit" className="w-full">
          Sair
        </Button>
      </form>
    </main>
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
      : Promise.resolve({ data: [] as { id: string; email: string; role: keyof typeof ROLE_LABEL; expires_at: string }[] }),
  ]);

  return (
    <>
      <Card title="Equipe">
        <ul className="divide-y divide-border">
          {(members ?? []).map((m) => {
            const isMe = m.user_id === me.user.id;
            const editable = manage && !isMe && (me.role === "owner" || m.role !== "owner");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.email}
                    {isMe ? " (você)" : ""}
                  </p>
                  <p className="text-xs text-text-muted">{ROLE_LABEL[m.role]}</p>
                </div>
                {editable ? (
                  <div className="flex gap-2">
                    <form action={changeRoleAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={m.user_id} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="rounded-lg border border-border bg-transparent px-2 text-sm"
                        aria-label={`Papel de ${m.email}`}
                      >
                        <option value="member">Membro</option>
                        <option value="admin">Administrador</option>
                        {me.role === "owner" ? <option value="owner">Dono</option> : null}
                      </select>
                      <Button variant="ghost" type="submit" className="min-h-9 px-2">
                        Salvar
                      </Button>
                    </form>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="userId" value={m.user_id} />
                      <Button variant="ghost" type="submit" className="min-h-9 px-2 text-danger">
                        Remover
                      </Button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      {manage ? (
        <Card title="Convidar pessoa">
          <InviteForm />
          {invites && invites.length > 0 ? (
            <div className="mt-4 grid gap-2">
              <h3 className="text-sm font-medium text-text-muted">Convites pendentes</h3>
              <ul className="grid gap-2">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {i.email} · {ROLE_LABEL[i.role]}
                    </span>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <Button variant="ghost" type="submit" className="min-h-9 px-2 text-danger">
                        Cancelar
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
