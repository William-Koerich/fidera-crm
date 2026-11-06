import { Avatar, DescriptionList } from "@/components/ui";
import { formatDate, formatPhone, formatShortDate } from "@/lib/inbox/format";
import type { ConversationDetail } from "@/lib/inbox/queries";
import { WindowBadge } from "../window-badge";

const SOURCE_LABEL: Record<ConversationDetail["contact"]["source"], string> = {
  whatsapp_inbound: "Mandou mensagem no WhatsApp",
  instagram_inbound: "Mandou mensagem no Instagram",
  business_app_echo: "Você chamou pelo celular",
  history: "Histórico do WhatsApp",
  capture_link: "Página de captação",
  manual: "Cadastrado manualmente",
  import: "Contatos do celular",
};

/** Client context next to the messages (wide screens). */
export function ContactPanel({ conversation }: { conversation: ConversationDetail }) {
  const { contact } = conversation;
  const name = contact.name || formatPhone(contact.phone) || "Contato";
  return (
    <div className="grid gap-6 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={contact.name} phone={contact.phone} src={contact.avatarUrl} size="lg" />
        <h2 className="mt-3 text-base font-semibold">{name}</h2>
        {contact.phone ? <p className="text-sm text-text-muted tabular">{formatPhone(contact.phone)}</p> : null}
        <div className="mt-2">
          <WindowBadge endsAt={conversation.replyWindowEndsAt} />
        </div>
      </div>

      <DescriptionList
        items={[
          { term: "Canal", detail: conversation.channel === "whatsapp" ? "WhatsApp" : "Instagram" },
          { term: "Como chegou", detail: SOURCE_LABEL[contact.source] },
          { term: "Cliente desde", detail: formatDate(contact.createdAt) },
          {
            term: "Última conversa",
            detail: contact.lastInteractionAt ? formatShortDate(contact.lastInteractionAt) : "Sem registro",
          },
        ]}
      />

      <p className="text-xs text-text-muted">
        Visitas, serviços e lembretes de retorno deste cliente vão aparecer aqui quando esses recursos forem lançados.
      </p>
    </div>
  );
}
