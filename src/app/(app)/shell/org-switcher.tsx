"use client";

import { AutoSubmitSelect } from "@/components/ui/inputs-client";
import { switchOrganizationAction } from "../org-actions";

/** Business switcher (only rendered when the user belongs to more than one). */
export function OrgSwitcher({
  organizations,
  activeId,
}: {
  organizations: { id: string; name: string }[];
  activeId: string;
}) {
  return (
    <form action={switchOrganizationAction}>
      <label htmlFor="org-switcher" className="sr-only">
        Negócio
      </label>
      <AutoSubmitSelect id="org-switcher" name="organizationId" defaultValue={activeId} className="font-medium">
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </AutoSubmitSelect>
    </form>
  );
}
