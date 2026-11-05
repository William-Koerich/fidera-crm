"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

type Mode = "password" | "signup" | "magic";

const TITLES: Record<Mode, string> = {
  password: "Entrar",
  signup: "Criar conta",
  magic: "Receber link por e-mail",
};

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/inbox";
  const [mode, setMode] = useState<Mode>("password");
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { status: "idle" });

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value={mode} />

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1 text-sm">
        {(["password", "signup", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`min-h-9 rounded-lg px-2 ${mode === m ? "bg-info-soft font-medium text-info shadow-sm" : "text-text-muted"}`}
          >
            {m === "password" ? "Entrar" : m === "signup" ? "Criar conta" : "Link"}
          </button>
        ))}
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-text">
        E-mail
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </label>

      {mode !== "magic" ? (
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Senha
          <Input
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </label>
      ) : null}

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "sent" ? <Alert tone="success">{state.message}</Alert> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Aguarde..." : TITLES[mode]}
      </Button>
    </form>
  );
}
