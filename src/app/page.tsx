import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Badge, ButtonLink, cx } from "@/components/ui";
import { AutoReplyMock, InboxMock, QuickRepliesMock, WaitingMock } from "./_landing/mocks";

export const metadata: Metadata = {
  title: { absolute: "Fidera: o WhatsApp do seu salão ou barbearia organizado" },
  description:
    "Conversas do WhatsApp num só lugar, para a equipe toda responder pelo celular ou computador. Com respostas rápidas e automáticas, feito para salões e barbearias.",
};

const SIGNUP = "/login?mode=signup";

const FEATURES: { title: string; text: string; points: string[]; visual: ReactNode }[] = [
  {
    title: "Ninguém fica sem resposta",
    text: "Veja na hora quem está esperando. Toda a equipe atende o mesmo número, sem passar um único celular de mão em mão.",
    points: ["Filtro de conversas aguardando resposta", "Mensagens novas aparecem sozinhas", "Convite para a equipe, com papéis de acesso"],
    visual: <WaitingMock />,
  },
  {
    title: "Responda em segundos com textos prontos",
    text: "Horário, endereço, preços: as perguntas de sempre viram atalhos. Digite / na conversa, escolha o texto e ajuste antes de enviar.",
    points: ["Atalhos compartilhados com a equipe", "Você revisa antes de enviar", "Funciona no celular e no computador"],
    visual: <QuickRepliesMock />,
  },
  {
    title: "O cliente tem retorno mesmo com o salão fechado",
    text: "Ligue uma saudação para o primeiro contato e um aviso para fora do horário. A conversa continua na fila, esperando a resposta da sua equipe.",
    points: ["Você define os dias e horários", "Aviso no máximo uma vez a cada 12 horas por conversa", "Grupos nunca recebem resposta automática"],
    visual: <AutoReplyMock />,
  },
];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "user", title: "Crie sua conta", text: "Cadastre o seu negócio com e-mail e senha." },
  { icon: "phone", title: "Conecte o WhatsApp", text: "Leia o QR Code com o celular, em Ajustes." },
  { icon: "users", title: "Atenda em equipe", text: "Convide quem atende e responda tudo pelo Fidera." },
];

const SOON = [
  { title: "Chamar hoje", text: "A lista diária de clientes para trazer de volta, com mensagem pronta." },
  { title: "Instagram", text: "As mensagens do Instagram na mesma caixa de entrada." },
  { title: "Relatórios", text: "Quantos clientes você chamou e quantos responderam." },
];

const QUESTIONS = [
  {
    q: "Preciso trocar de número?",
    a: "Não. Você conecta o número que já usa, lendo um QR Code. O WhatsApp precisa continuar instalado e conectado no celular.",
  },
  {
    q: "É a API oficial do WhatsApp?",
    a: "Hoje a conexão é por QR Code, fora da API oficial da Meta. Nesse tipo de conexão, o WhatsApp pode restringir ou bloquear o número, principalmente com envio em massa. Use para conversar com os seus clientes. O Fidera não faz disparo em massa.",
  },
  {
    q: "As mensagens antigas aparecem?",
    a: "As conversas individuais guardadas no serviço de conexão podem ser importadas. Mensagens de antes da conexão e conversas em grupo não entram.",
  },
  {
    q: "A resposta automática substitui o atendimento?",
    a: "Não. Ela avisa o cliente e deixa a conversa aguardando a sua equipe. As respostas automáticas vêm desligadas e só funcionam se você ligar.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim. O Fidera abre no navegador do celular e do computador, com as mesmas conversas nos dois.",
  },
];

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm">
      <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand" />
      <span>{children}</span>
    </li>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-1 px-4 sm:px-8">
          <Link href="/" aria-label="Fidera, página inicial" className="mr-auto inline-flex min-h-11 items-center">
            <Logo size="sm" />
          </Link>
          <nav aria-label="Seções da página" className="mr-3 hidden items-center gap-1 md:flex">
            <a href="#recursos" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text-muted hover:text-text">
              Recursos
            </a>
            <a href="#como-funciona" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text-muted hover:text-text">
              Como funciona
            </a>
            <a href="#perguntas" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text-muted hover:text-text">
              Perguntas
            </a>
          </nav>
          <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text hover:text-info">
            Entrar
          </Link>
          <ButtonLink href={SIGNUP}>
            Criar conta
          </ButtonLink>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        <section className="overflow-hidden bg-linear-to-b from-brand-soft via-info-soft to-surface">
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-14 text-center sm:px-8 sm:pt-20 sm:pb-20">
            <p className="text-sm font-medium text-brand">Para salões e barbearias</p>
            <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              O WhatsApp do seu negócio, organizado
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-text-muted">
              Todas as conversas num só lugar, para a equipe responder rápido pelo celular ou pelo computador. Sem cliente
              esquecido no meio das mensagens.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href={SIGNUP} className="sm:px-7">
                Criar conta
              </ButtonLink>
              <ButtonLink href="#como-funciona" variant="secondary" className="sm:px-7">
                Ver como funciona
              </ButtonLink>
            </div>
            <div className="mx-auto mt-12 max-w-4xl sm:mt-16">
              <InboxMock />
              <p className="mt-3 text-xs text-text-muted">Tela ilustrativa, com pessoas fictícias.</p>
            </div>
          </div>
        </section>

        <section id="recursos" aria-label="Recursos" className="scroll-mt-16">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 px-4 py-16 sm:gap-24 sm:px-8 sm:py-24">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="grid min-w-0 grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16">
                <div className={cx("min-w-0", i % 2 === 1 && "md:order-2")}>
                  <h2 className="text-3xl font-semibold tracking-tight text-balance">{f.title}</h2>
                  <p className="mt-3 text-pretty text-text-muted">{f.text}</p>
                  <ul className="mt-5 grid gap-2.5">
                    {f.points.map((p) => (
                      <Check key={p}>{p}</Check>
                    ))}
                  </ul>
                </div>
                <div className={cx("min-w-0 rounded-3xl bg-brand-soft p-4 sm:p-8", i % 2 === 1 && "md:order-1")}>{f.visual}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-16 border-y border-border bg-background">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
            <h2 id="como-funciona-titulo" className="text-center text-3xl font-semibold tracking-tight">
              Comece em três passos
            </h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border bg-surface p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                      <Icon name={s.icon} />
                    </span>
                    <span className="text-sm font-medium text-text-muted">Passo {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="em-breve-titulo">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
            <h2 id="em-breve-titulo" className="text-center text-3xl font-semibold tracking-tight">
              O que vem por aí
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-pretty text-text-muted">
              Ainda não está pronto, mas é para onde o Fidera vai: fazer o cliente voltar.
            </p>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {SOON.map((s) => (
                <li key={s.title} className="rounded-2xl border border-dashed border-border p-6">
                  <Badge tone="info">Em breve</Badge>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-text-muted">{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="perguntas" aria-labelledby="perguntas-titulo" className="scroll-mt-16 border-t border-border bg-background">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8 sm:py-20">
            <h2 id="perguntas-titulo" className="text-center text-3xl font-semibold tracking-tight">
              Perguntas frequentes
            </h2>
            <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-surface">
              {QUESTIONS.map((item) => (
                <details key={item.q} className="group px-5">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden className="text-xl leading-none font-normal text-text-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-sm text-pretty text-text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="final-titulo" className="bg-brand">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-8 sm:py-20">
            <h2 id="final-titulo" className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              Organize as conversas do seu negócio
            </h2>
            <Link
              href={SIGNUP}
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-lg bg-surface px-7 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft"
            >
              Criar conta
            </Link>
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
