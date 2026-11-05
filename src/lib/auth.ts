import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "crm_org";

export interface CurrentUser {
  id: string;
  email: string | null;
}

export interface ActiveMembership {
  organizationId: string;
  organizationName: string;
  role: Enums<"membership_role">;
}

/** Signed-in user (verified JWT claims), or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

/** All organizations of the user (RLS returns only their memberships). */
export const getMemberships = cache(async (): Promise<ActiveMembership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) {
    if (error.code === "PGRST106") {
      throw new Error(
        'The "crm" schema is not exposed by the Supabase Data API. Add it in Project Settings -> Data API -> Exposed schemas.',
      );
    }
    throw new Error(`Could not load memberships (${error.code ?? "unknown"})`);
  }
  return data.map((m) => ({
    organizationId: m.organization_id,
    organizationName: m.organizations?.name ?? "",
    role: m.role,
  }));
});

/**
 * Active organization: the one in the crm_org cookie if the user is a member,
 * otherwise the first one. Redirects to onboarding when there is none.
 */
export const requireMembership = cache(async (): Promise<ActiveMembership & { user: CurrentUser }> => {
  const user = await requireUser();
  const memberships = await getMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.organizationId === preferred) ?? memberships[0]!;
  return { ...active, user };
});

export function canManage(role: Enums<"membership_role">): boolean {
  return role === "owner" || role === "admin";
}
