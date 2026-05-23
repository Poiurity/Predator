import { describe, it, expect } from "vitest";
import {
  validateOrch,
  validateSim,
  validateFill,
  validatePatch,
  fillSchema,
  SIM_SCHEMA,
  PLOT_SCHEMA,
  COMPARE_SCHEMA,
  FLOW_SCHEMA,
  ANNOTATE_SCHEMA,
} from "./schemas";

describe("validateOrch", () => {
  it("accepts a valid layout", () => {
    expect(
      validateOrch({
        intent: "fresh",
        hero: 0,
        slots: [
          { t: "sim", pos: "CENTER", sz: "L", emp: 3 },
          { t: "plot", pos: "TR", sz: "M" },
        ],
        uid: "01JABCDEF",
      })
    ).toBe(true);
  });

  it("accepts intent='add' with a single slot (continuation)", () => {
    expect(
      validateOrch({
        intent: "add",
        hero: 0,
        slots: [{ t: "plot", pos: "TR", sz: "M", emp: 1 }],
        uid: "01JABCDEG",
      })
    ).toBe(true);
  });

  it("accepts intent='replace' with 3 slots", () => {
    expect(
      validateOrch({
        intent: "replace",
        hero: 0,
        slots: [
          { t: "flow", pos: "CENTER", sz: "L", emp: 3 },
          { t: "annotate", pos: "BR", sz: "S", emp: 0 },
          { t: "plot", pos: "TR", sz: "M", emp: 1 },
        ],
        uid: "01JABCDEH",
      })
    ).toBe(true);
  });

  it("rejects missing intent field", () => {
    expect(
      validateOrch({
        hero: 0,
        slots: [{ t: "sim", pos: "CENTER", sz: "L", emp: 3 }],
        uid: "01JABCDEF",
      })
    ).toBe(false);
  });

  it("rejects unknown intent value", () => {
    expect(
      validateOrch({
        intent: "merge",
        hero: 0,
        slots: [{ t: "sim", pos: "CENTER", sz: "L", emp: 3 }],
        uid: "x",
      })
    ).toBe(false);
  });

  it("rejects hero out of range", () => {
    expect(
      validateOrch({
        intent: "fresh",
        hero: 5,
        slots: [{ t: "sim", pos: "CENTER", sz: "L" }],
        uid: "x",
      })
    ).toBe(false);
  });

  it("rejects > 3 slots", () => {
    const slot = { t: "sim", pos: "TL", sz: "M" };
    expect(
      validateOrch({
        intent: "fresh",
        hero: 0,
        slots: [slot, slot, slot, slot],
        uid: "x",
      })
    ).toBe(false);
  });

  it("rejects unknown widget type", () => {
    expect(
      validateOrch({
        intent: "fresh",
        hero: 0,
        slots: [{ t: "ml-magic", pos: "TL", sz: "M" }],
        uid: "x",
      })
    ).toBe(false);
  });

  it("rejects unknown position", () => {
    expect(
      validateOrch({
        intent: "fresh",
        hero: 0,
        slots: [{ t: "sim", pos: "MIDDLE", sz: "L" }],
        uid: "x",
      })
    ).toBe(false);
  });

  it("rejects emp > 3", () => {
    expect(
      validateOrch({
        intent: "fresh",
        hero: 0,
        slots: [{ t: "sim", pos: "TL", sz: "M", emp: 5 }],
        uid: "x",
      })
    ).toBe(false);
  });

  it("rejects missing uid", () => {
    expect(
      validateOrch({
        intent: "fresh",
        hero: 0,
        slots: [{ t: "sim", pos: "TL", sz: "M" }],
      })
    ).toBe(false);
  });

  it("rejects empty slots", () => {
    expect(
      validateOrch({ intent: "fresh", hero: 0, slots: [], uid: "x" })
    ).toBe(false);
  });
});

describe("validateSim", () => {
  it("accepts a complete sim widget with chart", () => {
    expect(
      validateSim({
        t: "sim",
        title: "Mortgage payment",
        data: {
          vars: [
            { n: "p", v0: 200000, min: 50000, max: 1000000, step: 1000, unit: "$" },
            { n: "rate", v0: 5, min: 1, max: 12, step: 0.1, unit: "%", slider: true },
          ],
          rels: [
            { lhs: "monthly", expr: "p * rate / 1200 / (1 - (1 + rate/1200)^(-12*30))" },
          ],
          chart: { x: "rate", y: "monthly", scale: "lin" },
        },
      })
    ).toBe(true);
  });

  it("rejects sim with var missing v0", () => {
    expect(
      validateSim({
        t: "sim",
        data: { vars: [{ n: "p" }], rels: [] },
      })
    ).toBe(false);
  });

  it("rejects sim with wrong t value", () => {
    expect(
      validateSim({
        t: "plot",
        data: { vars: [{ n: "p", v0: 1 }], rels: [] },
      })
    ).toBe(false);
  });

  it("rejects sim with > 4 vars", () => {
    expect(
      validateSim({
        t: "sim",
        data: {
          vars: Array.from({ length: 5 }, (_, i) => ({ n: `v${i}`, v0: 0 })),
          rels: [],
        },
      })
    ).toBe(false);
  });

  it("rejects title > 48 chars", () => {
    expect(
      validateSim({
        t: "sim",
        title: "x".repeat(49),
        data: { vars: [{ n: "p", v0: 1 }], rels: [] },
      })
    ).toBe(false);
  });

  it("rejects chart with unknown scale", () => {
    expect(
      validateSim({
        t: "sim",
        data: {
          vars: [{ n: "p", v0: 1 }],
          rels: [],
          chart: { x: "p", y: "p", scale: "exponential" },
        },
      })
    ).toBe(false);
  });
});

describe("validateFill — dispatch per widget type", () => {
  it("validates a sim payload through validateFill", () => {
    expect(
      validateFill("sim", {
        t: "sim",
        data: { vars: [{ n: "x", v0: 1 }], rels: [] },
      }).ok
    ).toBe(true);
  });

  it("validates a plot payload", () => {
    expect(
      validateFill("plot", {
        t: "plot",
        data: { k: "line", series: [{ n: "a", pts: [[0, 0], [1, 1]] }] },
      }).ok
    ).toBe(true);
  });

  it("validates a compare payload", () => {
    expect(
      validateFill("compare", {
        t: "compare",
        data: {
          a: "model A",
          b: "model B",
          rows: [{ k: "speed", av: 10, bv: 20, lean: "b" }],
        },
      }).ok
    ).toBe(true);
  });

  it("validates a flow payload", () => {
    expect(
      validateFill("flow", {
        t: "flow",
        data: {
          nodes: [{ id: "n1", l: "Start" }, { id: "n2", l: "End" }],
          edges: [{ s: "n1", t: "n2", l: "next" }],
        },
      }).ok
    ).toBe(true);
  });

  it("validates an annotate payload", () => {
    expect(
      validateFill("annotate", {
        t: "annotate",
        data: { txt: "Hello world", math: "x^2", hl: ["world"] },
      }).ok
    ).toBe(true);
  });

  it("returns error text on invalid payload", () => {
    const result = validateFill("sim", {
      t: "sim",
      data: { vars: [], rels: [] },
    });
    expect(result.ok).toBe(false);
    expect(typeof result.errors).toBe("string");
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("rejects annotate txt > 280 chars", () => {
    expect(
      validateFill("annotate", {
        t: "annotate",
        data: { txt: "x".repeat(281) },
      }).ok
    ).toBe(false);
  });

  it("rejects plot series points with wrong arity", () => {
    expect(
      validateFill("plot", {
        t: "plot",
        data: { k: "line", series: [{ n: "a", pts: [[0, 0, 0]] }] },
      }).ok
    ).toBe(false);
  });
});

describe("fillSchema", () => {
  it("returns the matching schema by widget type", () => {
    expect(fillSchema("sim")).toBe(SIM_SCHEMA);
    expect(fillSchema("plot")).toBe(PLOT_SCHEMA);
    expect(fillSchema("compare")).toBe(COMPARE_SCHEMA);
    expect(fillSchema("flow")).toBe(FLOW_SCHEMA);
    expect(fillSchema("annotate")).toBe(ANNOTATE_SCHEMA);
  });
});

describe("validatePatch", () => {
  it("accepts a replace patch (spec §4.4 example)", () => {
    expect(
      validatePatch({
        uid: "u23",
        patch: [{ op: "replace", path: "/slots/0/data/chart/scale", value: "log" }],
      })
    ).toBe(true);
  });

  it("accepts add and remove ops", () => {
    expect(
      validatePatch({
        uid: "u1",
        patch: [
          { op: "add", path: "/a", value: 1 },
          { op: "remove", path: "/b" },
        ],
      })
    ).toBe(true);
  });

  it("rejects RFC6902 ops we do not support (copy/move/test)", () => {
    expect(
      validatePatch({ uid: "u1", patch: [{ op: "copy", path: "/a" }] })
    ).toBe(false);
    expect(
      validatePatch({ uid: "u1", patch: [{ op: "move", path: "/a" }] })
    ).toBe(false);
  });

  it("rejects empty patch array", () => {
    expect(validatePatch({ uid: "u1", patch: [] })).toBe(false);
  });

  it("rejects missing uid", () => {
    expect(
      validatePatch({ patch: [{ op: "replace", path: "/a", value: 1 }] })
    ).toBe(false);
  });
});
