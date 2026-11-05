import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const POINTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "inbox",
    title: "Todas as conversas num lugar só",
    text: "As mensagens do WhatsApp do seu negócio aparecem aqui, no celular ou no computador, para você e sua equipe.",
  },
  {
    icon: "clock",
    title: "Ninguém fica sem resposta",
    text: "Veja quem está esperando e quanto tempo falta para responder dentro da janela de 24 horas.",
  },
  {
    icon: "phone",
    title: "Continue usando o seu celular",
    text: "O WhatsApp Business segue funcionando no celular. O que você responde por lá também aparece aqui.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-8">
        <Link href="/" aria-label="Fidera, página inicial" className="mr-auto">
          <Logo size="sm" />
        </Link>
        <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text hover:text-info">
          Entrar
        </Link>
      </header>

      <main id="conteudo" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-8 sm:pt-20 lg:pt-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-info">Para salões e barbearias</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Quem você precisa chamar hoje?
            </h1>
            <p className="mt-4 max-w-xl text-lg text-pretty text-text-muted">
              O Fidera organiza o WhatsApp do seu negócio para você responder rápido e trazer os clientes de volta.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/login?mode=signup" className="sm:px-6">
                Criar conta
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" className="sm:px-6">
                Já tenho conta
              </ButtonLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="como-funciona" className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8">
            <h2 id="como-funciona" className="text-sm font-medium text-text-muted">
              Como o Fidera ajuda
            </h2>
            <ul className="mt-6 grid gap-8 md:grid-cols-3">
              {POINTS.map((p) => (
                <li key={p.title}>
                  <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Icon name={p.icon} />
                  </span>
                  <h3 className="mt-4 font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-text-muted">{p.text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-sm text-text-muted">
              Em breve: a lista diária de clientes para chamar de volta, com mensagem pronta.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-sm text-text-muted sm:px-8">
          <span>© 2026 Fidera</span>
          <Link href="/login" className="inline-flex min-h-11 items-center hover:text-text">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  );
}
