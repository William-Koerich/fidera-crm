import { getMemberships, requireMembership } from "@/lib/auth";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

/** Active business: a switcher when there are several, otherwise its name. */
export async function SidebarOrganization() {
  const active = await requireMembership();
  const memberships = await getMemberships();
  if (memberships.length < 2) {
    return (
      <div className="px-3">
        <p className="text-xs font-medium text-text-muted">Negócio</p>
        <p className="truncate text-sm font-semibold text-text">{active.organizationName}</p>
      </div>
    );
  }
  return (
    <OrgSwitcher
      activeId={active.organizationId}
      organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
    />
  );
}

export async function SidebarUser() {
  const me = await requireMembership();
  return <UserMenu email={me.user.email} organizationName={me.organizationName} placement="up" />;
}

export async function MobileTitle() {
  const me = await requireMembership();
  return <span className="truncate text-sm font-semibold text-text">{me.organizationName}</span>;
}

export async function MobileUser() {
  const me = await requireMembership();
  return <UserMenu email={me.user.email} organizationName={me.organizationName} placement="down" />;
}
