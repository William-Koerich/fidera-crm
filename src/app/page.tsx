import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ButtonLink, cx } from "@/components/ui";
import { AgendaMock, AiMock, CallbackMock, InboxMock, WebchatMock } from "./_landing/mocks";

export const metadata: Metadata = {
  title: { absolute: "Fidera: atendimento com IA, agenda e WhatsApp para salões e barbearias" },
  description:
    "A IA responde seus clientes no WhatsApp e marca na agenda. A equipe atende o mesmo número, e o Fidera lembra quem está na hora de voltar. Feito para salões e barbearias.",
};

const SIGNUP = "/login?mode=signup";
/** The Fidera team's own website chat: it lands in our inbox like any salon's would. Public by design. */
const SITE_CHAT_KEY = "4403e12144854315ed299fbf99242be8";

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  { icon: "sparkles", title: "Atendente com IA", text: "Responde, mostra horários livres e agenda sozinha, 24 horas." },
  { icon: "calendar", title: "Agenda do salão", text: "Dia e semana, cor por profissional, marcar com um clique." },
  { icon: "phone", title: "Chamar hoje", text: "Quem está na hora de voltar, com a mensagem pronta." },
  { icon: "users", title: "Equipe no mesmo número", text: "Todos atendem o WhatsApp, cada um no seu celular." },
  { icon: "message", title: "Chat do site", text: "Um botão de conversa no seu site, respondido no Fidera." },
  { icon: "chart", title: "Relatórios", text: "Atendimentos, tempo de resposta e avaliação dos clientes." },
];

const FEATURES: { eyebrow: string; title: string; text: string; points: string[]; visual: ReactNode }[] = [
  {
    eyebrow: "Atendente com IA",
    title: "A IA responde e marca o horário enquanto você atende",
    text: "Você escreve as instruções como faria para uma recepcionista nova: tom, preços, regras da casa. A IA consulta a agenda de verdade, oferece os horários livres e só agenda depois que o cliente confirma.",
    points: [
      "O cliente escolhe o profissional pelo nome, ou fica com quem estiver livre",
      "Remarca e cancela os agendamentos do próprio cliente",
      "Sai da conversa quando alguém da equipe escreve, e chama a equipe quando não souber ajudar",
      "Tudo o que ela faz fica anotado na conversa",
    ],
    visual: <AiMock />,
  },
  {
    eyebrow: "Agenda",
    title: "A agenda do salão, como numa agenda de papel bem organizada",
    text: "Cada atendimento no seu horário, com a altura da duração e a cor de quem atende. Clique num horário vazio para marcar, ou clique numa data dentro da conversa e o horário já vem preenchido.",
    points: ["Visão de dia e de semana, no computador e no celular", "Horário de funcionamento destacado", "Concluído, faltou e cancelado em um toque"],
    visual: <AgendaMock />,
  },
  {
    eyebrow: "Conversas em equipe",
    title: "Um número, a equipe toda atendendo, ninguém esquecido",
    text: "As conversas do WhatsApp num só lugar, com nome e foto como no celular. Veja quem está esperando, passe a conversa para outra pessoa e deixe notas que o cliente não vê.",
    points: [
      "Filtros de sem resposta, minhas e finalizadas",
      "Respostas rápidas com / e sugestões escritas pela IA",
      "Etiquetas, departamentos, distribuição automática e avaliação de 0 a 10",
    ],
    visual: <InboxMock />,
  },
  {
    eyebrow: "Chamar hoje",
    title: "O cliente volta porque alguém lembrou dele",
    text: "Cada serviço tem o seu prazo de retorno. Todo dia o Fidera monta a lista de quem está na hora de voltar, com uma mensagem pronta para você revisar e enviar.",
    points: ["Prazo por serviço, como 30 dias para o corte", "Mensagem com o nome do cliente", "Nada é enviado sem você clicar"],
    visual: <CallbackMock />,
  },
  {
    eyebrow: "Chat do site",
    title: "Quem visita seu site também conversa com o salão",
    text: "Cole uma linha no seu site e aparece um botão de conversa no canto. As mensagens chegam no Fidera junto com as do WhatsApp, e a IA pode responder também. O botão aqui no canto desta página é o nosso.",
    points: ["Funciona em qualquer site", "O visitante pode deixar o telefone", "Resposta na mesma caixa de entrada"],
    visual: <WebchatMock />,
  },
];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "user", title: "Crie sua conta", text: "Cadastre o seu negócio com e-mail e senha." },
  { icon: "phone", title: "Conecte o WhatsApp", text: "Leia o QR Code com o celular, em Ajustes." },
  { icon: "calendar", title: "Cadastre serviços e horários", text: "Duração, prazo de retorno e quando o salão abre." },
  { icon: "sparkles", title: "Ligue a IA", text: "Escreva as instruções e deixe a IA atender e agendar." },
];

/**
 * Example prices, shown with a notice on the page: pricing is not final and the app
 * does not enforce these limits. Each plan pays for one ChatPro plan per customer,
 * with the same allowance: Conecta (R$ 199), Plus (R$ 399) and Pro (R$ 799).
 */
const PLANS = [
  { name: "Essencial", price: "397", conversations: "500", users: "3", recommended: true },
  { name: "Profissional", price: "797", conversations: "3.000", users: "10", recommended: false },
  { name: "Rede", price: "1.597", conversations: "10.000", users: "20", recommended: false },
];

const PLAN_INCLUDES = [
  "Conversas do WhatsApp em equipe",
  "Agenda e Chamar hoje",
  "Atendente com IA",
  "Chat do site",
  "Respostas rápidas e automáticas",
];

const QUESTIONS = [
  {
    q: "A IA responde sozinha? E se ela errar?",
    a: "Responde, se você ligar. Ela só usa o que está nas suas instruções, nos serviços e na agenda, e não inventa preço nem horário. Antes de agendar, confirma com o cliente. Quando não sabe, chama a equipe. Assim que alguém da equipe escreve na conversa, ela sai, e dá para pausar a IA em qualquer conversa.",
  },
  {
    q: "Preciso trocar de número?",
    a: "Não. Você conecta o número que já usa, lendo um QR Code. O WhatsApp precisa continuar instalado e conectado no celular.",
  },
  {
    q: "É a API oficial do WhatsApp?",
    a: "Hoje a conexão é por QR Code, fora da API oficial da Meta. Nesse tipo de conexão, o WhatsApp pode restringir ou bloquear o número, principalmente com envio em massa. Use para conversar com os seus clientes. O Fidera não faz disparo em massa e limita as mensagens automáticas por hora.",
  },
  {
    q: "A agenda substitui a que eu uso hoje?",
    a: "Pode substituir. A agenda do Fidera tem visão de dia e de semana, cor por profissional e marcação direto da conversa. Quem agenda pela IA ou pela equipe aparece no mesmo lugar.",
  },
  {
    q: "As mensagens antigas aparecem?",
    a: "As conversas individuais guardadas no serviço de conexão podem ser importadas. Mensagens de antes da conexão e conversas em grupo não entram.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim. O Fidera abre no navegador do celular e do computador, com as mesmas conversas e a mesma agenda nos dois.",
  },
];

function Check({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "light" }) {
  return (
    <li className="flex gap-2.5 text-[0.95rem]">
      <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", tone === "brand" ? "bg-brand-soft text-brand" : "bg-white/15 text-white")}>
        <Icon name="check" className="size-3.5" />
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-1 px-4 sm:px-8">
          <Link href="/" aria-label="Fidera, página inicial" className="mr-auto inline-flex min-h-11 items-center">
            <Logo size="sm" />
          </Link>
          <nav aria-label="Seções da página" className="mr-3 hidden items-center gap-1 md:flex">
            {[
              ["#recursos", "Recursos"],
              ["#como-funciona", "Como funciona"],
              ["#planos", "Planos"],
              ["#perguntas", "Perguntas"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text-muted hover:text-text">
                {label}
              </a>
            ))}
          </nav>
          <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-text hover:text-brand">
            Entrar
          </Link>
          <ButtonLink href={SIGNUP} size="sm">
            Criar conta
          </ButtonLink>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] size-[640px] rounded-full bg-brand-soft blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute top-60 left-[-15%] size-[480px] rounded-full bg-[#fbe6d4] blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-24">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-medium shadow-xs ring-1 ring-border">
                <Icon name="sparkles" className="size-4 text-brand" /> Agora com atendente de IA
              </p>
              <h1 className="mt-5 font-display text-[2.6rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-6xl">
                Seu salão atende, agenda e lembra do cliente. Até quando você está ocupado.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-pretty text-text-muted">
                A IA responde no WhatsApp e marca na agenda. A equipe atende o mesmo número pelo celular ou computador. E todo dia o Fidera mostra
                quem está na hora de voltar.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href={SIGNUP} className="sm:px-7">
                  Criar conta
                </ButtonLink>
                <ButtonLink href="#recursos" variant="secondary" className="sm:px-7">
                  Ver o que ele faz
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-text-muted">Feito para salões de beleza, barbearias, esmalterias e estúdios.</p>
              <p className="mt-1 text-xs text-text-muted">Telas ilustrativas, com pessoas fictícias.</p>
            </div>
            <div className="relative min-w-0 lg:pl-6">
              <AiMock className="mx-auto max-w-md" />
              <div className="absolute -bottom-16 -left-2 hidden w-72 rotate-[-3deg] rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-border sm:block lg:-left-14" aria-hidden>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand text-white">
                    <Icon name="calendar" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">Sábado, 9:00 · Corte</p>
                    <p className="truncate text-[12px] text-text-muted">Carla com Bia · agendado pela IA</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section aria-labelledby="tudo-titulo" className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8 sm:py-16">
            <h2 id="tudo-titulo" className="text-center font-display text-3xl font-medium tracking-[-0.02em] text-balance">
              Tudo o que a recepção faz, num lugar só
            </h2>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title} className="flex gap-4 rounded-2xl bg-background p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon name={h.icon} className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{h.title}</h3>
                    <p className="mt-0.5 text-sm text-pretty text-text-muted">{h.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="recursos" aria-label="Recursos" className="scroll-mt-16">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-20 px-4 py-16 sm:gap-28 sm:px-8 sm:py-24">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="grid min-w-0 grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
                <div className={cx("min-w-0", i % 2 === 1 && "md:order-2")}>
                  <p className="text-sm font-semibold tracking-[0.04em] text-brand uppercase">{f.eyebrow}</p>
                  <h2 className="mt-2 font-display text-3xl leading-tight font-medium tracking-[-0.02em] text-balance sm:text-[2.4rem]">{f.title}</h2>
                  <p className="mt-4 text-pretty text-text-muted">{f.text}</p>
                  <ul className="mt-6 grid gap-3">
                    {f.points.map((p) => (
                      <Check key={p}>{p}</Check>
                    ))}
                  </ul>
                </div>
                <div className={cx("min-w-0 rounded-[2rem] bg-sunken p-4 sm:p-8", i % 2 === 1 && "md:order-1")}>{f.visual}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-16 bg-plum text-on-plum">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
            <h2 id="como-funciona-titulo" className="text-center font-display text-3xl font-medium tracking-[-0.02em] text-white sm:text-4xl">
              Pronto para atender em uma tarde
            </h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl bg-white/8 p-6 ring-1 ring-white/10">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-white/12 text-white">
                      <Icon name={s.icon} />
                    </span>
                    <span className="text-sm font-medium text-on-plum-muted">Passo {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-white">{s.title}</h3>
                  <p className="mt-1 text-sm text-on-plum-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Plans */}
        <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
            <h2 id="planos-titulo" className="text-center font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
              Planos para o tamanho do seu negócio
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-pretty text-text-muted">
              Valores de exemplo. Os planos e preços do Fidera ainda estão sendo definidos e podem mudar.
            </p>
            <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
              {PLANS.map((plan) => (
                <li
                  key={plan.name}
                  className={cx(
                    "relative flex flex-col rounded-[var(--radius-card)] bg-surface shadow-sm",
                    plan.recommended ? "ring-2 ring-brand" : "ring-1 ring-border",
                  )}
                >
                  {plan.recommended ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">Recomendado</span>
                  ) : null}
                  <div className="border-b border-border p-6">
                    <h3 className="font-display text-xl font-medium">{plan.name}</h3>
                    <p className="mt-2 flex items-baseline gap-1">
                      <span className="font-display text-4xl font-medium tracking-[-0.02em] tabular">R$ {plan.price}</span>
                      <span className="text-sm text-text-muted">/mês</span>
                    </p>
                    <p className="mt-1 text-xs text-text-muted">Valor de exemplo</p>
                  </div>
                  <div className="flex flex-1 flex-col gap-5 p-6">
                    <dl className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-sm text-text-muted">Atendimentos/mês</dt>
                        <dd className="text-xl font-semibold tabular">{plan.conversations}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-text-muted">Pessoas na equipe</dt>
                        <dd className="text-xl font-semibold tabular">{plan.users}</dd>
                      </div>
                    </dl>
                    <ul className="grid gap-2.5">
                      {PLAN_INCLUDES.map((item) => (
                        <Check key={item}>{item}</Check>
                      ))}
                    </ul>
                    <ButtonLink href={SIGNUP} variant={plan.recommended ? undefined : "secondary"} block className="mt-auto">
                      Criar conta
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-pretty text-text-muted">
              Um atendimento é um cliente que escreve para você, contado uma vez a cada 24 horas, com quantas mensagens forem.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="perguntas" aria-labelledby="perguntas-titulo" className="scroll-mt-16 border-t border-border bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8 sm:py-20">
            <h2 id="perguntas-titulo" className="text-center font-display text-3xl font-medium tracking-[-0.02em]">
              Perguntas frequentes
            </h2>
            <div className="mt-8 divide-y divide-border rounded-[var(--radius-card)] bg-background ring-1 ring-border">
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
            <p className="mt-6 text-center text-sm text-text-muted">
              Outra dúvida? Fale com a gente pelo botão de conversa no canto da tela.
            </p>
          </div>
        </section>

        {/* Final call */}
        <section aria-labelledby="final-titulo" className="px-4 pb-16 sm:px-8">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand px-6 py-14 text-center sm:py-20">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10 blur-2xl" />
            <h2 id="final-titulo" className="relative mx-auto max-w-2xl font-display text-3xl font-medium tracking-[-0.02em] text-balance text-white sm:text-5xl">
              Deixe a recepção com o Fidera e cuide do cliente na cadeira
            </h2>
            <ul className="relative mx-auto mt-8 grid max-w-md gap-2.5 text-left text-white">
              <Check tone="light">Atendente com IA que agenda sozinha</Check>
              <Check tone="light">Agenda e lista de quem chamar hoje</Check>
              <Check tone="light">A equipe toda no mesmo WhatsApp</Check>
            </ul>
            <Link
              href={SIGNUP}
              className="relative mt-9 inline-flex min-h-12 items-center justify-center rounded-xl bg-surface px-8 text-sm font-semibold text-brand shadow-lg transition-colors hover:bg-brand-soft"
            >
              Criar conta
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 text-sm text-text-muted sm:px-8">
          <span>© 2026 Fidera</span>
          <Link href="/login" className="inline-flex min-h-11 items-center hover:text-text">
            Entrar
          </Link>
        </div>
      </footer>

      {/* Our own website chat: messages land in the Fidera team's inbox. */}
      <Script src="/widget.js" data-key={SITE_CHAT_KEY} strategy="lazyOnload" />
    </div>
  );
}
