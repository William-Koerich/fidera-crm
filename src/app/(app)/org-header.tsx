import { getMemberships, requireMembership } from "@/lib/auth";
import { switchOrganizationAction } from "./org-actions";

export async function OrgHeader() {
  const active = await requireMembership();
  const memberships = await getMemberships();

  if (memberships.length < 2) {
    return <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">{active.organizationName}</span>;
  }

  return (
    <form action={switchOrganizationAction} className="ml-auto flex items-center gap-2">
      <select
        name="organizationId"
        defaultValue={active.organizationId}
        className="max-w-48 truncate rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        aria-label="Negócio"
      >
        {memberships.map((m) => (
          <option key={m.organizationId} value={m.organizationId}>
            {m.organizationName}
          </option>
        ))}
      </select>
      <button type="submit" className="text-sm text-emerald-700">
        Trocar
      </button>
    </form>
  );
}
