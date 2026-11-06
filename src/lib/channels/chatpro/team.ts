/**
 * Mirrors team organization on ChatPro Chat (https://sparks.chatpro.com.br). Read on 2026-11-06.
 *
 * - endings/list, endings/create { name }, sessions/finish { sessionId, endingId }.
 * - departments/list, departments/createDepartment { name } (the docs say departments/create,
 *   which answers 404), sessions/assignDepartment { sessionId, department_id }.
 * - tags/create { name, color }. There is no route to list tags.
 * - leads/findByPhoneNumber { phoneNumber }, leads/assignLabel and unassignLabel { leadId, labelId }.
 * - messages/addComments { sessionId, message, userId }.
 *
 * Success bodies are not documented, hence the tolerant id lookup. The CRM is the
 * record, so nothing here throws: a failure only means ChatPro did not follow.
 */
import type { ChannelTeamSync, ExternalRecord } from "../types";
import { findId, isObj, text, type Json } from "./json";

export class ChatProTeamSync implements ChannelTeamSync {
  constructor(
    private readonly options: { chatToken: string; baseUrl: string; fetch: typeof fetch },
  ) {}

  private async post(path: string, payload: Json): Promise<{ ok: boolean; data: unknown }> {
    if (!this.options.chatToken) return { ok: false, data: null };
    try {
      const response = await this.options.fetch(`${this.options.baseUrl}/${path}`, {
        method: "POST",
        headers: { "instance-token": this.options.chatToken, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      return { ok: response.ok, data: await response.json().catch(() => null) };
    } catch {
      return { ok: false, data: null };
    }
  }

  private async list(path: string, instanceId: string): Promise<ExternalRecord[] | null> {
    const { ok, data } = await this.post(path, { instanceId });
    if (!ok || !Array.isArray(data)) return null;
    return data.filter(isObj).flatMap((item) => {
      const id = text(item.id);
      const name = text(item.name);
      return id && name && item.deleted !== true ? [{ id, name }] : [];
    });
  }

  /** Creates a record. If the answer has no id, finds it by name when the type can be listed. */
  private async create(path: string, payload: Json, listPath: string | null, instanceId: string, name: string) {
    const { ok, data } = await this.post(path, { instanceId, ...payload });
    if (!ok) return null;
    const id = isObj(data) ? findId(data) : null;
    if (id || !listPath) return id;
    return (await this.list(listPath, instanceId))?.find((r) => r.name === name)?.id ?? null;
  }

  private async sessionId(instanceId: string, number: string): Promise<string | null> {
    const { ok, data } = await this.post("sessions/getOrCreateByNumber", { instanceId, number, provider: "whatsapp" });
    return ok && isObj(data) ? findId(data) : null;
  }

  listEndings(instanceId: string) {
    return this.list("endings/list", instanceId);
  }

  createEnding(instanceId: string, name: string) {
    return this.create("endings/create", { name }, "endings/list", instanceId, name);
  }

  async finishConversation(input: { accountExternalId: string; to: string; endingExternalId: string }) {
    const instanceId = input.accountExternalId;
    const sessionId = await this.sessionId(instanceId, input.to);
    if (!sessionId) return false;
    return (await this.post("sessions/finish", { instanceId, sessionId, endingId: input.endingExternalId })).ok;
  }

  listDepartments(instanceId: string) {
    return this.list("departments/list", instanceId);
  }

  createDepartment(instanceId: string, name: string) {
    return this.create("departments/createDepartment", { name }, "departments/list", instanceId, name);
  }

  async assignDepartment(input: { accountExternalId: string; to: string; departmentExternalId: string }) {
    const instanceId = input.accountExternalId;
    const sessionId = await this.sessionId(instanceId, input.to);
    if (!sessionId) return false;
    return (await this.post("sessions/assignDepartment", { instanceId, sessionId, department_id: input.departmentExternalId })).ok;
  }

  createLabel(instanceId: string, name: string, color: string) {
    return this.create("tags/create", { name, color }, null, instanceId, name);
  }

  async setContactLabel(input: { accountExternalId: string; to: string; labelExternalId: string; on: boolean }) {
    const instanceId = input.accountExternalId;
    const lead = await this.post("leads/findByPhoneNumber", { instanceId, phoneNumber: input.to });
    const leadId = lead.ok && isObj(lead.data) ? text(lead.data.id) : null;
    if (!leadId) return false;
    const path = input.on ? "leads/assignLabel" : "leads/unassignLabel";
    return (await this.post(path, { instanceId, leadId, labelId: input.labelExternalId })).ok;
  }

  async addNote(input: { accountExternalId: string; to: string; body: string; authorEmail: string | null }) {
    const instanceId = input.accountExternalId;
    const sessionId = await this.sessionId(instanceId, input.to);
    if (!sessionId) return false;

    let userId: string | null = null;
    if (input.authorEmail) {
      const email = input.authorEmail.trim().toLowerCase();
      const users = await this.post("users/getAllInstanceUsers", { instanceId });
      const match = Array.isArray(users.data)
        ? users.data.filter(isObj).find((u) => isObj(u.user) && text(u.user.email)?.trim().toLowerCase() === email)
        : undefined;
      userId = match ? text(match.user_id) : null;
    }
    return (await this.post("messages/addComments", { instanceId, sessionId, message: input.body, ...(userId ? { userId } : {}) })).ok;
  }
}
