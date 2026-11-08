import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

/** One person from the "Chamar hoje" list, shown on the welcome panel. Fictional, and said so. */
function Sample({ initials, tone, name, detail }: { initials: string; tone: string; name: string; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${tone}`}>{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-white">{name}</span>
        <span className="block text-sm text-on-plum-muted">{detail}</span>
      </span>
      <span aria-hidden className="rounded-full bg-on-plum px-3 py-1.5 text-xs font-semibold text-plum">
        Chamar
      </span>
    </div>
  );
}

/**
 * Frame for sign-in, onboarding and invitations. Wide screens: a plum welcome panel beside the
 * form. Phones: just the form, so it fits above the keyboard.
 */
export function AuthShell({
  title,
  description,
  eyebrow,
  children,
  footer,
}: {
  /** Omit when the content renders its own heading (e.g. the login form changes it per mode). */
  title?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-plum p-12 text-on-plum lg:flex lg:flex-col lg:justify-between xl:p-16">
        <span aria-hidden className="absolute -top-32 -right-32 size-[26rem] rounded-full border border-white/10" />
        <span aria-hidden className="absolute -top-12 -right-12 size-64 rounded-full border border-white/10" />
        <Link href="/" aria-label="Fidera, página inicial" className="relative">
          <Logo size="md" tone="light" />
        </Link>
        <div className="relative grid max-w-lg gap-7">
          <p className="font-display text-[2.75rem] leading-[1.08] font-medium tracking-[-0.02em] text-white xl:text-5xl">
            Seus clientes voltam quando alguém lembra deles.
          </p>
          <p className="text-lg text-on-plum-muted">WhatsApp, agenda e quem chamar hoje, num só lugar, para o salão inteiro.</p>
          <div className="grid gap-4 rounded-3xl border border-white/12 bg-white/6 p-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-on-plum-muted uppercase">Chamar hoje</p>
            <Sample initials="AS" tone="bg-[#f3c9b8] text-[#5a2a17]" name="Ana Souza" detail="Corte · última visita há 34 dias" />
            <Sample initials="CL" tone="bg-[#c9e4d8] text-[#1e4a37]" name="Carlos Lima" detail="Barba · última visita há 21 dias" />
          </div>
        </div>
        <p className="relative text-sm text-on-plum-muted">Pessoas fictícias, só para ilustrar.</p>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex h-16 items-center px-5 sm:px-8 lg:hidden">
          <Link href="/" aria-label="Fidera, página inicial">
            <Logo size="sm" />
          </Link>
        </header>
        <main id="conteudo" className="flex flex-1 items-start justify-center px-5 pt-4 pb-12 sm:items-center sm:pt-0">
          <div className="w-full max-w-[420px]">
            {eyebrow ? <div className="mb-3 text-sm font-semibold text-brand">{eyebrow}</div> : null}
            {title ? <h1 className="font-display text-[2rem] leading-tight font-medium tracking-[-0.02em]">{title}</h1> : null}
            {description ? <p className="mt-2 text-[0.95rem] text-text-muted">{description}</p> : null}
            <div className={title ? "mt-8" : undefined}>{children}</div>
          </div>
        </main>
        {footer ? <footer className="px-5 pb-6 text-center text-sm text-text-muted">{footer}</footer> : null}
      </div>
    </div>
  );
}
