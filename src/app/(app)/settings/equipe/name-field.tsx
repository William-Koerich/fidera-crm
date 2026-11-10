"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { setMemberNameAction } from "./name-actions";

/** The name clients and the agenda see. Saved on its own, without touching the role. */
export function NameField({ memberId, name, email }: { memberId: string; name: string | null; email: string }) {
  const [value, setValue] = useState(name ?? "");
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const [pending, start] = useTransition();
  const changed = value.trim() !== (name ?? "");
  const id = `member-name-${memberId}`;
  return (
    <form
      className="flex w-full items-center gap-2 sm:w-auto"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await setMemberNameAction(memberId, value);
          setState(result.ok ? "saved" : (result.message ?? "Não foi possível salvar."));
        });
      }}
    >
      <label htmlFor={id} className="sr-only">
        Nome de {email}
      </label>
      <Input
        id={id}
        value={value}
        maxLength={60}
        placeholder="Nome, ex.: Bia"
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        aria-describedby={state !== "idle" ? `${id}-status` : undefined}
      />
      <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={!changed}>
        Salvar
      </Button>
      {state !== "idle" ? (
        <span id={`${id}-status`} role="status" className={state === "saved" ? "text-xs text-success" : "text-xs text-danger"}>
          {state === "saved" ? "Salvo" : state}
        </span>
      ) : null}
    </form>
  );
}
