"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/inputs-client";
import { SegmentedControl } from "@/components/ui/segmented";
import { loginAction, type LoginState } from "./actions";

type Mode = "password" | "signup" | "magic";

const COPY: Record<Mode, { title: string; description: string; submit: string }> = {
  password: {
    title: "Entrar na sua conta",
    description: "Use o e-mail e a senha que você cadastrou.",
    submit: "Entrar",
  },
  signup: {
    title: "Criar sua conta",
    description: "Leva menos de um minuto. Depois você cadastra o seu negócio.",
    submit: "Criar conta",
  },
  magic: {
    title: "Receber link de acesso",
    description: "Enviamos um link para o seu e-mail. É só tocar nele para entrar, sem senha.",
    submit: "Enviar link",
  },
};

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/inbox";
  const linkError = params.get("error") === "link";
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "password");
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { status: "idle" });
  const copy = COPY[mode];
  const error = state.status === "error" ? state.message : undefined;

  return (
    <div>
      <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">{copy.title}</h1>
      <p className="mt-1.5 text-sm text-text-muted">{copy.description}</p>

      {mode !== "magic" ? (
        <SegmentedControl
          className="mt-6"
          label="Escolha entre entrar ou criar conta"
          value={mode}
          onChange={setMode}
          options={[
            { value: "password", label: "Entrar" },
            { value: "signup", label: "Criar conta" },
          ]}
        />
      ) : null}

      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />

        {linkError && state.status === "idle" ? (
          <Alert tone="warning" title="Este link não funciona mais">
            Ele expirou ou já foi usado. Entre com a senha ou peça um novo link.
          </Alert>
        ) : null}

        <Field id="login-email" label="E-mail">
          <Input
            {...fieldA11y("login-email")}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            required
          />
        </Field>

        {mode !== "magic" ? (
          <Field id="login-password" label="Senha" hint={mode === "signup" ? "Pelo menos 8 caracteres." : undefined}>
            <PasswordInput
              {...fieldA11y("login-password", { hint: mode === "signup" })}
              name="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </Field>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {state.status === "sent" ? (
          <Alert tone="success" title="Confira o seu e-mail">
            {state.message} O link pode levar alguns minutos para chegar.
          </Alert>
        ) : null}

        <Button type="submit" block loading={pending}>
          {copy.submit}
        </Button>
      </form>

      <div className="mt-6 border-t border-border pt-4 text-center">
        <button
          type="button"
          onClick={() => setMode(mode === "magic" ? "password" : "magic")}
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-info hover:underline"
        >
          {mode === "magic" ? "Entrar com senha" : "Prefiro receber um link por e-mail"}
        </button>
      </div>
    </div>
  );
}
