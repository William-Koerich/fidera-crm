import { describe, expect, it } from "vitest";
import { nextLabelColor, planLabelChange, reorderStages, sortLabels, type LabelInfo } from "./stages";

const novo: LabelInfo = { id: "novo", name: "Novo lead", color: "#2563eb", stagePosition: 0 };
const agendou: LabelInfo = { id: "agendou", name: "Agendou", color: "#6d28d9", stagePosition: 1 };
const cliente: LabelInfo = { id: "cliente", name: "Virou cliente", color: "#059669", stagePosition: 2 };
const vip: LabelInfo = { id: "vip", name: "VIP", color: "#ca8a04", stagePosition: null };
const curso: LabelInfo = { id: "curso", name: "Curso unhas", color: "#db2777", stagePosition: null };
const all = [vip, cliente, curso, novo, agendou];

describe("sortLabels", () => {
  it("puts stages first in funnel order, then labels by name", () => {
    expect(sortLabels(all).map((l) => l.id)).toEqual(["novo", "agendou", "cliente", "curso", "vip"]);
  });
});

describe("planLabelChange", () => {
  it("moves the contact out of its other stage when a stage is picked", () => {
    expect(planLabelChange(all, ["novo", "vip"], "agendou", true)).toEqual({ add: ["agendou"], remove: ["novo"] });
  });

  it("leaves other labels alone for a plain label", () => {
    expect(planLabelChange(all, ["novo", "vip"], "curso", true)).toEqual({ add: ["curso"], remove: [] });
  });

  it("removes only the label turned off, and nothing when it was not there", () => {
    expect(planLabelChange(all, ["novo", "vip"], "vip", false)).toEqual({ add: [], remove: ["vip"] });
    expect(planLabelChange(all, ["novo"], "vip", false)).toEqual({ add: [], remove: [] });
  });

  it("ignores labels that do not exist", () => {
    expect(planLabelChange(all, ["novo"], "nope", true)).toEqual({ add: [], remove: [] });
  });
});

describe("nextLabelColor", () => {
  it("picks a color not used yet", () => {
    expect(nextLabelColor(["#6d28d9", "#2563EB"])).toBe("#0891b2");
  });
});

describe("reorderStages", () => {
  it("swaps with the neighbour and stops at the ends", () => {
    expect(reorderStages(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(reorderStages(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
