import { getMemberships, requireMembership } from "@/lib/auth";
import { switchOrganizationAction } from "./org-actions";

export async function OrgHeader() {
  const active = await requireMembership();
  const memberships = await getMemberships();

  if (memberships.length < 2) {
    return <span className="truncate text-sm text-text-muted">{active.organizationName}</span>;
  }

  return (
    <form action={switchOrganizationAction} className="ml-auto flex items-center gap-2">
      <select
        name="organizationId"
        defaultValue={active.organizationId}
        className="max-w-48 truncate rounded-lg border border-border bg-transparent px-2 py-1 text-sm focus:border-info"
        aria-label="Negócio"
      >
        {memberships.map((m) => (
          <option key={m.organizationId} value={m.organizationId}>
            {m.organizationName}
          </option>
        ))}
      </select>
      <button type="submit" className="text-sm text-info underline-offset-2 hover:underline">
        Trocar
      </button>
    </form>
  );
}
