/**
 * First steps of a new business, shown at the top of the conversations until all
 * are done: the shortest road to seeing the AI answer a real customer.
 */
export interface ChecklistFacts {
  whatsappConnected: boolean;
  servicesCount: number;
  hasBusinessHours: boolean;
  aiEnabled: boolean;
  hasCustomerMessage: boolean;
}

export interface ChecklistStep {
  key: "whatsapp" | "services" | "hours" | "ai" | "test";
  title: string;
  text: string;
  href: string | null;
  done: boolean;
}

export function buildChecklist(facts: ChecklistFacts): ChecklistStep[] {
  return [
    {
      key: "whatsapp",
      title: "Conecte o WhatsApp",
      text: "Leia o QR Code com o celular do salão. O número continua o mesmo.",
      href: "/settings/canais",
      done: facts.whatsappConnected,
    },
    {
      key: "services",
      title: "Cadastre seus serviços",
      text: "Nome, duração e prazo de retorno. A IA só oferece o que estiver aqui.",
      href: "/settings/servicos",
      done: facts.servicesCount > 0,
    },
    {
      key: "hours",
      title: "Informe o horário de funcionamento",
      text: "A agenda e a IA usam este horário para oferecer vagas.",
      href: "/settings/respostas-automaticas",
      done: facts.hasBusinessHours,
    },
    {
      key: "ai",
      title: "Ligue a IA",
      text: "Escreva as instruções como faria para uma recepcionista nova e ligue.",
      href: "/settings/atendente-ia",
      done: facts.aiEnabled,
    },
    {
      key: "test",
      title: "Faça um teste",
      text: "Peça para alguém mandar “oi” para o WhatsApp do salão e veja a conversa chegar aqui.",
      href: null,
      done: facts.hasCustomerMessage,
    },
  ];
}
