import { describe, expect, it } from "vitest";
import { buildChecklist, type ChecklistFacts } from "./checklist";

const none: ChecklistFacts = {
  whatsappConnected: false,
  servicesCount: 0,
  hasBusinessHours: false,
  aiEnabled: false,
  hasCustomerMessage: false,
};

describe("buildChecklist", () => {
  it("starts with nothing done, in the order a business sets up", () => {
    const steps = buildChecklist(none);
    expect(steps.map((s) => s.key)).toEqual(["whatsapp", "services", "hours", "ai", "test"]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("marks each step from its own fact", () => {
    const steps = buildChecklist({ ...none, whatsappConnected: true, servicesCount: 2, aiEnabled: true });
    expect(Object.fromEntries(steps.map((s) => [s.key, s.done]))).toEqual({
      whatsapp: true,
      services: true,
      hours: false,
      ai: true,
      test: false,
    });
  });

  it("is complete when every fact is in place", () => {
    const steps = buildChecklist({ whatsappConnected: true, servicesCount: 1, hasBusinessHours: true, aiEnabled: true, hasCustomerMessage: true });
    expect(steps.every((s) => s.done)).toBe(true);
  });
});
