import { describe, expect, it } from "vitest";
import { parseCampaignForm } from "./config";

const form = (values: Record<string, string>) => parseCampaignForm((name) => values[name] ?? null);
const base = { name: "Curso de unhas", trigger_text: "Quero saber do curso de unhas", label_id: "label-1", reply_format: "none", enabled: "on" };

describe("parseCampaignForm", () => {
  it("reads a campaign that only labels", () => {
    expect(form(base)).toEqual({
      ok: true,
      values: {
        name: "Curso de unhas",
        triggerText: "Quero saber do curso de unhas",
        labelId: "label-1",
        newLabelName: null,
        replyFormat: "none",
        replyText: "",
        replyAudioPath: null,
        enabled: true,
      },
    });
  });

  it("creates a label by name, and keeps the audio only for audio replies", () => {
    const parsed = form({ ...base, label_id: "new", new_label_name: " Curso  unhas ", reply_format: "audio", greeting_audio_path: "org/greetings/a.ogg" });
    expect(parsed).toMatchObject({ ok: true, values: { labelId: null, newLabelName: "Curso unhas", replyFormat: "audio", replyAudioPath: "org/greetings/a.ogg" } });
    expect(form({ ...base, reply_format: "text", reply_text: "Oi!", greeting_audio_path: "x" })).toMatchObject({ ok: true, values: { replyAudioPath: null } });
  });

  it("refuses what could not work", () => {
    expect(form({ ...base, name: "" })).toMatchObject({ ok: false });
    expect(form({ ...base, trigger_text: "oi" })).toMatchObject({ ok: false });
    expect(form({ ...base, label_id: "new" })).toMatchObject({ ok: false, message: "Escreva o nome da nova etiqueta." });
    expect(form({ ...base, reply_format: "text" })).toMatchObject({ ok: false, message: "Escreva a resposta automática." });
    expect(form({ ...base, reply_format: "audio" })).toMatchObject({ ok: false, message: "Grave ou escolha o áudio da resposta." });
  });
});
