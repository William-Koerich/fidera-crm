import { describe, expect, it, vi } from "vitest";
import { ChatProTeamSync } from "./team";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Routes = Record<string, Response | (() => Response)>;
function setup(routes: Routes) {
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    const route = routes[String(url).replace("https://sparks.test/", "")];
    if (!route) return json(404, {});
    return typeof route === "function" ? route() : route.clone();
  });
  return { sync: new ChatProTeamSync({ chatToken: "CHAT", baseUrl: "https://sparks.test", fetch: fetchMock }), fetchMock };
}
const bodyOf = (mock: ReturnType<typeof setup>["fetchMock"], path: string) => {
  const call = mock.mock.calls.find(([url]) => String(url).endsWith(path));
  return JSON.parse(String(call?.[1]?.body));
};
const session = { "sessions/getOrCreateByNumber": json(201, { id: "s1" }) };

describe("ChatProTeamSync", () => {
  it("lists records, leaving out deleted ones", async () => {
    const { sync } = setup({
      "endings/list": json(200, [{ id: "e1", name: "Resolvido", deleted: false }, { id: "e2", name: "Velho", deleted: true }]),
    });
    expect(await sync.listEndings("i")).toEqual([{ id: "e1", name: "Resolvido" }]);
  });

  it("returns null, not an empty list, when ChatPro cannot answer", async () => {
    const { sync } = setup({});
    expect(await sync.listDepartments("i")).toBeNull();
  });

  it("creates through the route that really exists and reads the new id", async () => {
    const { sync, fetchMock } = setup({ "departments/createDepartment": json(201, { id: "d1" }) });
    expect(await sync.createDepartment("i", "Barba")).toBe("d1");
    expect(bodyOf(fetchMock, "departments/createDepartment")).toEqual({ instanceId: "i", name: "Barba" });
  });

  it("finds a new record by name when the answer has no id", async () => {
    const { sync } = setup({
      "endings/create": json(201, {}),
      "endings/list": json(200, [{ id: "e9", name: "Agendado" }]),
    });
    expect(await sync.createEnding("i", "Agendado")).toBe("e9");
  });

  it("gives up on a label with no id, since tags cannot be listed", async () => {
    const { sync, fetchMock } = setup({ "tags/create": json(201, {}) });
    expect(await sync.createLabel("i", "VIP", "#6d28d9")).toBeNull();
    expect(bodyOf(fetchMock, "tags/create")).toEqual({ instanceId: "i", name: "VIP", color: "#6d28d9" });
  });

  it("finishes the person's session with the reason", async () => {
    const { sync, fetchMock } = setup({ ...session, "sessions/finish": json(201, {}) });
    expect(await sync.finishConversation({ accountExternalId: "i", to: "5511", endingExternalId: "e1" })).toBe(true);
    expect(bodyOf(fetchMock, "sessions/finish")).toEqual({ instanceId: "i", sessionId: "s1", endingId: "e1" });
  });

  it("assigns the department with the field name ChatPro validates", async () => {
    const { sync, fetchMock } = setup({ ...session, "sessions/assignDepartment": json(201, {}) });
    expect(await sync.assignDepartment({ accountExternalId: "i", to: "5511", departmentExternalId: "d1" })).toBe(true);
    expect(bodyOf(fetchMock, "sessions/assignDepartment")).toMatchObject({ sessionId: "s1", department_id: "d1" });
  });

  it("adds and removes a label on the person's lead", async () => {
    const lead = { "leads/findByPhoneNumber": json(201, { id: "l1" }) };
    const on = setup({ ...lead, "leads/assignLabel": json(201, {}) });
    expect(await on.sync.setContactLabel({ accountExternalId: "i", to: "5511", labelExternalId: "t1", on: true })).toBe(true);
    expect(bodyOf(on.fetchMock, "leads/findByPhoneNumber")).toEqual({ instanceId: "i", phoneNumber: "5511" });
    expect(bodyOf(on.fetchMock, "leads/assignLabel")).toEqual({ instanceId: "i", leadId: "l1", labelId: "t1" });

    const off = setup({ ...lead, "leads/unassignLabel": json(201, {}) });
    expect(await off.sync.setContactLabel({ accountExternalId: "i", to: "5511", labelExternalId: "t1", on: false })).toBe(true);
  });

  it("does not create a session to label someone unknown", async () => {
    const { sync, fetchMock } = setup({ "leads/findByPhoneNumber": json(404, {}) });
    expect(await sync.setContactLabel({ accountExternalId: "i", to: "5511", labelExternalId: "t1", on: true })).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("links a note to the author when their e-mail is on ChatPro, and sends it anyway otherwise", async () => {
    const routes = {
      ...session,
      "messages/addComments": () => json(201, {}),
      "users/getAllInstanceUsers": () => json(201, [{ user_id: "u1", user: { email: "ana@salao.com" } }]),
    };
    const known = setup(routes);
    await known.sync.addNote({ accountExternalId: "i", to: "5511", body: "Prefere sábado", authorEmail: "Ana@salao.com" });
    expect(bodyOf(known.fetchMock, "messages/addComments")).toEqual({ instanceId: "i", sessionId: "s1", message: "Prefere sábado", userId: "u1" });

    const unknown = setup(routes);
    expect(await unknown.sync.addNote({ accountExternalId: "i", to: "5511", body: "x", authorEmail: "b@b.com" })).toBe(true);
    expect(bodyOf(unknown.fetchMock, "messages/addComments")).not.toHaveProperty("userId");
  });

  it("never throws when the network fails", async () => {
    const sync = new ChatProTeamSync({
      chatToken: "CHAT",
      baseUrl: "https://sparks.test",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(await sync.finishConversation({ accountExternalId: "i", to: "5", endingExternalId: "e" })).toBe(false);
    expect(await sync.listEndings("i")).toBeNull();
  });
});
