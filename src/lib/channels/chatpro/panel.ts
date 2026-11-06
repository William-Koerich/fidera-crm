/**
 * ChatPro Painel API (instance management), https://chatpro.readme.io.
 * Used only on the server, with the account's e-mail and password from env.
 * Kept free of imports and TS-only syntax so scripts can run it directly.
 *
 * Documented: POST ?action=token { email, senha } -> { success, token },
 * POST ?action=alterar_webhook { code, new_webhook } -> { success, message },
 * GET ?action=instancias (success response not documented).
 * Authorization is documented as bearer-formatted, without a full example, so
 * the raw token is tried if the bearer form is rejected.
 */
export const CHATPRO_PANEL_URL = "https://api.chatpro.com.br/painel/ws/endpoint.php";

interface PanelResponse {
  success?: boolean;
  message?: string;
  token?: string;
  [key: string]: unknown;
}

export class ChatProPanel {
  private readonly email: string;
  private readonly password: string;
  private readonly fetchImpl: typeof fetch;
  private token: string | null = null;

  constructor(options: { email: string; password: string; fetch?: typeof fetch }) {
    this.email = options.email;
    this.password = options.password;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request(action: string, init: RequestInit): Promise<PanelResponse> {
    const response = await this.fetchImpl(`${CHATPRO_PANEL_URL}?action=${action}`, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => null)) as PanelResponse | null;
    return json ?? { success: false, message: `HTTP ${response.status}` };
  }

  private async login(): Promise<string> {
    if (this.token) return this.token;
    const json = await this.request("token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, senha: this.password }),
    });
    if (!json.success || !json.token) throw new Error("ChatPro panel login failed");
    this.token = json.token;
    return json.token;
  }

  private async authorized(action: string, init: RequestInit): Promise<PanelResponse> {
    const token = await this.login();
    const withAuth = (value: string) =>
      this.request(action, { ...init, headers: { ...(init.headers ?? {}), Authorization: value } });
    const first = await withAuth(`Bearer ${token}`);
    return !first.success && /jwt/i.test(first.message ?? "") ? withAuth(token) : first;
  }

  async setWebhook(instanceId: string, url: string): Promise<void> {
    const json = await this.authorized("alterar_webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: instanceId, new_webhook: url }),
    });
    if (!json.success) throw new Error(`ChatPro webhook update failed: ${json.message ?? "no details"}`);
  }

  /** Raw response: its success format is not documented. */
  listInstances(): Promise<PanelResponse> {
    return this.authorized("instancias", { method: "GET" });
  }
}
