import { describe, expect, it, vi } from "vitest";
import { CoexyApiError, CoexyClient } from "./client";

const channel = {
  id: "ch_1",
  name: "Salão A",
  status: "pending",
  display_phone_number: null,
  phone_number_id: null,
  waba_id: null,
  channel_token: "tok_1",
  connect_url: "https://coexy.com.br/connect/abc",
  connected_at: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("CoexyClient", () => {
  it("creates a channel with the API key header", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(201, channel));
    const created = await new CoexyClient({ apiKey: "crt_pk_x", fetch: fetchMock }).createChannel("Salão A");
    expect(created).toMatchObject({ id: "ch_1", status: "pending", connect_url: channel.connect_url, channel_token: "tok_1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.coexy.com.br/functions/v1/api/channels");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("crt_pk_x");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Salão A" });
  });

  it("reads a connected channel, including a { data } wrapper", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(200, { data: { ...channel, status: "active", phone_number_id: "1234", waba_id: "5678", display_phone_number: "+55 48 99999-0000" } }),
    );
    const got = await new CoexyClient({ apiKey: "k", fetch: fetchMock }).getChannel("ch_1");
    expect(got).toMatchObject({ status: "active", phone_number_id: "1234", waba_id: "5678" });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.coexy.com.br/functions/v1/api/channels/ch_1");
  });

  it("throws a typed error without leaking the response body", async () => {
    const client = new CoexyClient({ apiKey: "k", fetch: async () => json(401, { code: "invalid_api_key", message: "x" }) });
    await expect(client.getChannel("ch_1")).rejects.toEqual(new CoexyApiError(401, "invalid_api_key"));
  });
});
