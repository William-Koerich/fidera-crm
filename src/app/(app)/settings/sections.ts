import type { IconName } from "@/components/icons";

export interface SettingsItem {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: IconName;
  /** Hidden from members: only owners and admins change these. */
  managersOnly?: boolean;
}

/** Ajustes, one page per subject, grouped as people think about running a salon. */
export const SETTINGS_SECTIONS: { title: string; items: SettingsItem[] }[] = [
  {
    title: "Canais",
    items: [
      { key: "canais", href: "/settings/canais", label: "WhatsApp", description: "Conectar o número e trazer as conversas.", icon: "phone" },
      { key: "chat-do-site", href: "/settings/chat-do-site", label: "Chat do site", description: "Um botão de conversa no seu site.", icon: "message", managersOnly: true },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { key: "respostas-rapidas", href: "/settings/respostas-rapidas", label: "Respostas rápidas", description: "Textos prontos, chamados com / na conversa.", icon: "send" },
      { key: "servicos", href: "/settings/servicos", label: "Serviços", description: "Duração e prazo de retorno de cada serviço.", icon: "calendar" },
      { key: "finalizacao", href: "/settings/finalizacao", label: "Motivos de finalização", description: "O que a equipe escolhe ao finalizar.", icon: "check" },
      { key: "departamentos", href: "/settings/departamentos", label: "Departamentos", description: "Separar conversas por área.", icon: "inbox" },
      { key: "etiquetas", href: "/settings/etiquetas", label: "Etiquetas", description: "Marcar clientes, como VIP.", icon: "info" },
    ],
  },
  {
    title: "Automação",
    items: [
      { key: "atendente-ia", href: "/settings/atendente-ia", label: "Atendente com IA", description: "Responde, agenda e chama a equipe sozinha.", icon: "sparkles", managersOnly: true },
      { key: "robo", href: "/settings/robo", label: "Robô de atendimento", description: "Menu que responde, agenda e passa para a equipe.", icon: "wrench", managersOnly: true },
      { key: "respostas-automaticas", href: "/settings/respostas-automaticas", label: "Respostas automáticas", description: "Saudação, fora do horário e horário de atendimento.", icon: "clock", managersOnly: true },
      { key: "avaliacao", href: "/settings/avaliacao", label: "Avaliação do atendimento", description: "Nota de 0 a 10 ao finalizar.", icon: "chart", managersOnly: true },
    ],
  },
  {
    title: "Equipe",
    items: [
      { key: "equipe", href: "/settings/equipe", label: "Pessoas", description: "Quem tem acesso e com qual papel.", icon: "users" },
      { key: "distribuicao", href: "/settings/distribuicao", label: "Distribuição", description: "Quem recebe conversas, e em que horário.", icon: "plug", managersOnly: true },
      { key: "permissoes", href: "/settings/permissoes", label: "Permissões", description: "O que cada membro vê.", icon: "settings", managersOnly: true },
    ],
  },
  {
    title: "Conta",
    items: [{ key: "conta", href: "/settings/conta", label: "Minha conta", description: "Seus dados, negócio e sair.", icon: "user" }],
  },
];

export function visibleSections(manager: boolean) {
  return SETTINGS_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => manager || !item.managersOnly),
  })).filter((section) => section.items.length > 0);
}
