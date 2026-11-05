"use client";

import { Button, ButtonLink } from "./ui/button";
import { Icon } from "./icons";

export function digestOf(error: unknown): string | undefined {
  return error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
}

/** Friendly error screen; never shows technical details, only a reference code. */
export function ErrorView({ digest, onRetry, compact = false }: { digest?: string; onRetry: () => void; compact?: boolean }) {
  return (
    <div className={compact ? "px-4 py-16" : "mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16"}>
      <div className={compact ? "mx-auto max-w-md text-center" : undefined}>
        <span
          className={`mb-4 grid size-12 place-items-center rounded-full bg-danger/10 text-danger ${compact ? "mx-auto" : ""}`}
        >
          <Icon name="alert" className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Algo deu errado ao carregar esta tela</h1>
        <p className="mt-2 text-sm text-text-muted">
          Tente de novo em alguns segundos. Se continuar, avise o suporte informando o código abaixo.
        </p>
        <div className={`mt-6 flex flex-wrap gap-3 ${compact ? "justify-center" : ""}`}>
          <Button onClick={onRetry}>Tentar de novo</Button>
          <ButtonLink href="/inbox" variant="secondary">
            Ir para a inbox
          </ButtonLink>
        </div>
        {digest ? <p className="mt-6 font-mono text-xs text-text-muted">Código: {digest}</p> : null}
      </div>
    </div>
  );
}
