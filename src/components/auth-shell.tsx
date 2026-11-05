import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

/** Frame for sign-in, onboarding and invitations: logo, centered card on desktop, full width on mobile. */
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
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Link href="/" aria-label="Fidera, página inicial">
          <Logo size="sm" />
        </Link>
      </header>
      <main id="conteudo" className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px] sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-8 sm:shadow-sm">
          {eyebrow ? <div className="mb-3 text-sm font-medium text-info">{eyebrow}</div> : null}
          {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
          {description ? <p className="mt-1.5 text-sm text-text-muted">{description}</p> : null}
          <div className={title ? "mt-6" : undefined}>{children}</div>
        </div>
      </main>
      {footer ? <footer className="px-4 pb-6 text-center text-sm text-text-muted">{footer}</footer> : null}
    </div>
  );
}
