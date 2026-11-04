"use server";

import { randomBytes, createHash } from "node:crypto";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, canManage, getMemberships, requireMembership, requireUser } from "@/lib/auth";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/urls";

export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  inviteLink?: string;
}

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

async function setActiveOrg(orgId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, cookieOptions);
}

export async function createOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/onboarding");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    return { status: "error", message: "Informe o nome do negócio (2 a 120 caracteres)." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { org_name: name });
  if (error || !data) return { status: "error", message: "Não foi possível criar o negócio." };
  await setActiveOrg(data);
  redirect("/inbox");
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const orgId = String(formData.get("organizationId") ?? "");
  const memberships = await getMemberships();
  if (memberships.some((m) => m.organizationId === orgId)) await setActiveOrg(orgId);
  refresh();
}

const ROLES: readonly Enums<"membership_role">[] = ["member", "admin", "owner"];
const isRole = (v: unknown): v is Enums<"membership_role"> => ROLES.includes(v as Enums<"membership_role">);

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMembership();
  if (!canManage(me.role)) return { status: "error", message: "Apenas donos e administradores convidam." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = formData.get("role");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "E-mail inválido." };
  if (role !== "member" && role !== "admin") return { status: "error", message: "Papel inválido." };

  const token = randomBytes(32).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    organization_id: me.organizationId,
    email,
    role,
    token_hash: createHash("sha256").update(token).digest("hex"),
    invited_by: me.user.id,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "Já existe um convite pendente para esse e-mail." : "Não foi possível convidar.",
    };
  }
  refresh();
  return {
    status: "success",
    message: "Convite criado. Envie o link abaixo para a pessoa (vale 7 dias, uso único).",
    inviteLink: `${await getOrigin()}/invite/${token}`,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  await requireMembership();
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", String(formData.get("id") ?? ""));
  refresh();
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const me = await requireMembership();
  const role = formData.get("role");
  if (!isRole(role)) return;
  const supabase = await createClient();
  // RLS decides who may change what (admins cannot touch owners).
  await supabase
    .from("memberships")
    .update({ role })
    .eq("organization_id", me.organizationId)
    .eq("user_id", String(formData.get("userId") ?? ""));
  refresh();
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const me = await requireMembership();
  const userId = String(formData.get("userId") ?? "");
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("organization_id", me.organizationId).eq("user_id", userId);
  if (userId === me.user.id) {
    (await cookies()).delete(ACTIVE_ORG_COOKIE);
    redirect("/inbox");
  }
  refresh();
}

export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  await requireUser(`/invite/${token}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { invite_token: token });
  if (error || !data) {
    return {
      status: "error",
      message:
        error?.code === "42501"
          ? "Este convite foi enviado para outro e-mail. Entre com o e-mail convidado."
          : "Convite inválido ou expirado. Peça um novo convite.",
    };
  }
  await setActiveOrg(data);
  redirect("/inbox");
}
