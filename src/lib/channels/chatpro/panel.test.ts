import { describe, expect, it, vi } from "vitest";
import { ChatProPanel } from "./panel";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function fakeFetch(webhookReply: (authorization: string) => unknown) {
  return vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("action=token")) return json({ success: true, token: "JWT" });
    return json(webhookReply((init?.headers as Record<string, string>).Authorization!));
  });
}

const panel = (f: typeof fetch) => new ChatProPanel({ email: "a@b.com", password: "pw", fetch: f });

describe("ChatProPanel", () => {
  it("logs in and sets the webhook with the documented fields", async () => {
    const f = fakeFetch(() => ({ success: true }));
    await panel(f).setWebhook("chatpro-a", "https://app/hook");
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body))).toEqual({ email: "a@b.com", senha: "pw" });
    const [url, init] = f.mock.calls[1]!;
    expect(url).toBe("https://api.chatpro.com.br/painel/ws/endpoint.php?action=alterar_webhook");
    expect(JSON.parse(String(init?.body))).toEqual({ code: "chatpro-a", new_webhook: "https://app/hook" });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer JWT");
  });

  it("retries with the raw token when the bearer form is rejected", async () => {
    const f = fakeFetch((auth) => (auth === "JWT" ? { success: true } : { success: false, message: "JWT inválido" }));
    await expect(panel(f).setWebhook("a", "https://x")).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("reports failures without exposing the password", async () => {
    const f = fakeFetch(() => ({ success: false, message: "Instância não encontrada (ou não ativa)" }));
    await expect(panel(f).setWebhook("a", "https://x")).rejects.toThrow("Instância não encontrada");
    const failedLogin = vi.fn<typeof fetch>(async () => json({ success: false }));
    await expect(panel(failedLogin).setWebhook("a", "https://x")).rejects.toThrow("login failed");
    await expect(panel(failedLogin).setWebhook("a", "https://x")).rejects.not.toThrow("pw");
  });
});
