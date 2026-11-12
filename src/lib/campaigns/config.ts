/** A campaign as the settings form edits it. Pure, so it is tested without the database. */
export const CAMPAIGN_REPLY_FORMATS = ["none", "text", "audio"] as const;
export type CampaignReplyFormat = (typeof CAMPAIGN_REPLY_FORMATS)[number];

export interface CampaignValues {
  name: string;
  triggerText: string;
  /** An existing label, or null with newLabelName to create one. */
  labelId: string | null;
  newLabelName: string | null;
  replyFormat: CampaignReplyFormat;
  replyText: string;
  replyAudioPath: string | null;
  enabled: boolean;
}

/** The label a new campaign creates, when the business does not pick one. */
export const NEW_LABEL_COLOR = "#6d28d9";

export function parseCampaignForm(get: (name: string) => string | null): { ok: true; values: CampaignValues } | { ok: false; message: string } {
  const name = (get("name") ?? "").trim().replace(/\s+/g, " ");
  const triggerText = (get("trigger_text") ?? "").trim();
  const label = get("label_id") ?? "";
  const newLabelName = label === "new" ? (get("new_label_name") ?? "").trim().replace(/\s+/g, " ") : "";
  const replyFormat = CAMPAIGN_REPLY_FORMATS.find((f) => f === get("reply_format")) ?? "none";
  const replyText = (get("reply_text") ?? "").trim();
  const replyAudioPath = (get("greeting_audio_path") ?? "").trim() || null;

  if (!name) return { ok: false, message: "Dê um nome para a campanha." };
  if (name.length > 80) return { ok: false, message: "Use um nome de até 80 letras." };
  if (triggerText.length < 3) return { ok: false, message: "Escreva a mensagem que o cliente envia pela campanha." };
  if (triggerText.length > 1000) return { ok: false, message: "A mensagem da campanha está longa demais." };
  if (label === "new" && !newLabelName) return { ok: false, message: "Escreva o nome da nova etiqueta." };
  if (newLabelName.length > 40) return { ok: false, message: "Use um nome de etiqueta de até 40 letras." };
  if (replyFormat === "text" && !replyText) return { ok: false, message: "Escreva a resposta automática." };
  if (replyText.length > 4096) return { ok: false, message: "A resposta está longa demais." };
  if (replyFormat === "audio" && !replyAudioPath) return { ok: false, message: "Grave ou escolha o áudio da resposta." };

  return {
    ok: true,
    values: {
      name,
      triggerText,
      labelId: label && label !== "new" ? label : null,
      newLabelName: newLabelName || null,
      replyFormat,
      replyText,
      replyAudioPath: replyFormat === "audio" ? replyAudioPath : null,
      enabled: get("enabled") === "on",
    },
  };
}
