"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";
import type { TeamMember } from "@/lib/inbox/queries";

export function StaffFilter({ members, value, monday }: { members: TeamMember[]; value: string | null; monday: string }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="agenda-staff" className="sr-only">
        Filtrar por profissional
      </label>
      <Select
        id="agenda-staff"
        value={value ?? ""}
        onChange={(e) => router.push(`/agenda?semana=${monday}${e.target.value ? `&pessoa=${e.target.value}` : ""}`)}
      >
        <option value="">Todos os profissionais</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.email}
          </option>
        ))}
      </Select>
    </>
  );
}
