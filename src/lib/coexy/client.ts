/**
 * Coexy Management API client (channels). Based on the Coexy spec used by
 * third-party integrations; confirm field names in the Coexy panel/docs.
 *
 * Base: https://api.coexy.com.br/functions/v1/api, header "x-api-key: crt_pk_...".
 * Channel: { id, name, status: pending|active|disconnected|suspended,
 *   display_phone_number, phone_number_id, waba_id, channel_token,
 *   connect_url, connected_at, created_at }.
 */

export const COEXY_API_URL = "https://api.coexy.com.br/functions/v1/api";

export type CoexyChannelStatus = "pending" | "active" | "disconnected" | "suspended";

export interface CoexyChannel {
  id: string;
  name: string;
  status: CoexyChannelStatus;
  display_phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  channel_token: string | null;
  connect_url: string | null;
  connected_at: string | null;
}

export class CoexyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Coexy API error ${status} (${code})`);
  }
}

export interface CoexyClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

const STATUSES: readonly CoexyChannelStatus[] = ["pending", "active", "disconnected", "suspended"];

function toChannel(raw: unknown): CoexyChannel {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  // Some APIs wrap the object in { data: ... }.
  const o = (typeof r.data === "object" && r.data !== null ? r.data : r) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" && o[k] !== "" ? (o[k] as string) : null);
  const id = s("id");
  if (!id) throw new CoexyApiError(502, "invalid_channel_payload");
  const status = s("status");
  return {
    id,
    name: s("name") ?? "",
    status: STATUSES.includes(status as CoexyChannelStatus) ? (status as CoexyChannelStatus) : "pending",
    display_phone_number: s("display_phone_number"),
    phone_number_id: s("phone_number_id"),
    waba_id: s("waba_id"),
    channel_token: s("channel_token"),
    connect_url: s("connect_url"),
    connected_at: s("connected_at"),
  };
}

export class CoexyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: CoexyClientOptions) {
    this.baseUrl = (options.baseUrl ?? COEXY_API_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { "x-api-key": this.options.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof json === "object" && json !== null && "code" in json ? String((json as { code: unknown }).code) : "error";
      throw new CoexyApiError(response.status, code);
    }
    return json;
  }

  async createChannel(name: string): Promise<CoexyChannel> {
    return toChannel(await this.call("POST", "/channels", { name }));
  }

  async getChannel(id: string): Promise<CoexyChannel> {
    return toChannel(await this.call("GET", `/channels/${encodeURIComponent(id)}`));
  }

  async deleteChannel(id: string): Promise<void> {
    await this.call("DELETE", `/channels/${encodeURIComponent(id)}?force=true`);
  }
}
