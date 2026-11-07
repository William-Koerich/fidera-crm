import { describe, expect, it } from "vitest";
import { callbackText, daysBetween, dueLabel } from "./callbacks";

describe("callbacks", () => {
  it("counts calendar days across months", () => {
    expect(daysBetween("2026-10-08", "2026-11-07")).toBe(30);
    expect(daysBetween("2026-11-07", "2026-11-07")).toBe(0);
  });

  it("writes a personal first message, in days or months", () => {
    expect(callbackText({ contactName: "Ana Souza", serviceName: "Corte", lastVisitOn: "2026-10-08" }, "2026-11-07")).toBe(
      "Oi, Ana! Tudo bem? Seu último horário de corte foi há 30 dias. Quer que eu reserve um horário para você esta semana?",
    );
    expect(callbackText({ contactName: null, serviceName: "Coloração", lastVisitOn: "2026-08-01" }, "2026-11-07")).toBe(
      "Oi! Tudo bem? Seu último horário de coloração foi há uns 3 meses. Quer que eu reserve um horário para você esta semana?",
    );
  });

  it("says how late the return is", () => {
    expect(dueLabel("2026-11-07", "2026-11-07")).toBe("Venceu hoje");
    expect(dueLabel("2026-11-06", "2026-11-07")).toBe("Venceu ontem");
    expect(dueLabel("2026-11-01", "2026-11-07")).toBe("Venceu há 6 dias");
  });
});
