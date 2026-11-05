"use client";

import { AutoSubmitSelect } from "@/components/ui/inputs-client";

/** Changes a member's role as soon as a new one is picked. */
export function RoleSelect({
  userId,
  email,
  role,
  allowOwner,
  action,
}: {
  userId: string;
  email: string;
  role: string;
  allowOwner: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const id = `role-${userId}`;
  return (
    <form action={action} className="min-w-0 flex-1 sm:w-44 sm:flex-none">
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor={id} className="sr-only">
        Papel de {email}
      </label>
      <AutoSubmitSelect id={id} name="role" defaultValue={role}>
        <option value="member">Membro</option>
        <option value="admin">Administrador</option>
        {allowOwner ? <option value="owner">Dono</option> : null}
      </AutoSubmitSelect>
    </form>
  );
}
