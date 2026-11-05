import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="mb-10 self-start" aria-label="Fidera, página inicial">
        <Logo />
      </Link>
      <p className="text-sm font-medium text-text-muted">Erro 404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Não encontramos esta página</h1>
      <p className="mt-2 text-text-muted">
        O endereço pode estar errado ou a página foi removida. Se você chegou aqui por um link de convite, peça um novo.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/inbox">Ir para a inbox</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Página inicial
        </ButtonLink>
      </div>
    </main>
  );
}
