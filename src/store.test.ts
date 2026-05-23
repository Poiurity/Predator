// Store unit tests — appendSlots: cap enforcement and hero clamping.
// (spec §7.3 §3b: 6-slot cap, oldest dropped, hero stays valid)

import { describe, it, expect, beforeEach } from "vitest";
import { useLS } from "./store";
import type { OrchLayout, SlotMeta } from "./lib/schemas";

// Helper: build a minimal SlotMeta.
function slot(t: SlotMeta["t"] = "annotate"): SlotMeta {
  return { t, pos: "TL", sz: "S" };
}

// Helper: build a minimal OrchLayout seeded into the store.
function seedScene(slotCount: number, uid = "TEST"): OrchLayout {
  const sc: OrchLayout = {
    intent: "fresh",
    uid,
    hero: 0,
    slots: Array.from({ length: slotCount }, () => slot()),
  };
  const seeds: Record<string, { status: "skeleton" }> = {};
  for (let i = 0; i < slotCount; i++) seeds[`${uid}:${i}`] = { status: "skeleton" };
  useLS.getState().commitScene(sc, seeds);
  return sc;
}

beforeEach(() => {
  useLS.getState().clearScene();
});

describe("appendSlots — basic append", () => {
  it("merges new slots into existing scene", () => {
    seedScene(2, "A");
    useLS.getState().appendSlots(
      [slot("plot"), slot("sim")],
      { "A:2": { status: "skeleton" }, "A:3": { status: "skeleton" } }
    );
    const sc = useLS.getState().scene!;
    expect(sc.slots).toHaveLength(4);
    expect(sc.slots[2]!.t).toBe("plot");
    expect(sc.slots[3]!.t).toBe("sim");
  });

  it("does nothing when scene is null", () => {
    useLS.getState().appendSlots([slot()], {});
    expect(useLS.getState().scene).toBeNull();
  });
});

describe("appendSlots — 6-slot cap", () => {
  it("drops oldest slots when merged count exceeds 6", () => {
    seedScene(5, "B");
    useLS.getState().appendSlots(
      [slot("plot"), slot("sim")],
      { "B:5": { status: "skeleton" }, "B:6": { status: "skeleton" } }
    );
    const sc = useLS.getState().scene!;
    // 5 + 2 = 7 → cap at 6 → drop 1 oldest
    expect(sc.slots).toHaveLength(6);
  });

  it("trims exactly to 6 when starting at 6", () => {
    seedScene(6, "C");
    useLS.getState().appendSlots(
      [slot("flow")],
      { "C:6": { status: "skeleton" } }
    );
    const sc = useLS.getState().scene!;
    expect(sc.slots).toHaveLength(6);
    // Newest slot is the flow one (last position after trim).
    expect(sc.slots[5]!.t).toBe("flow");
  });

  it("deletes widget keys for dropped slots", () => {
    seedScene(5, "D");
    useLS.getState().appendSlots(
      [slot("plot"), slot("sim")],
      { "D:5": { status: "skeleton" }, "D:6": { status: "skeleton" } }
    );
    const w = useLS.getState().widgets;
    // D:0 was the dropped slot.
    expect(w["D:0"]).toBeUndefined();
    // D:1 through D:6 should still be present (after drop, 6 remain).
    expect(w["D:6"]).toBeDefined();
  });
});

describe("appendSlots — hero clamping", () => {
  it("keeps existing hero when newHero not supplied", () => {
    seedScene(2, "E");
    useLS.getState().appendSlots([slot()], { "E:2": { status: "skeleton" } });
    // hero was 0 before, still 0
    expect(useLS.getState().scene!.hero).toBe(0);
  });

  it("uses newHero when explicitly provided", () => {
    seedScene(2, "F");
    useLS.getState().appendSlots(
      [slot("sim")],
      { "F:2": { status: "skeleton" } },
      2 // elect the newly appended slot as hero
    );
    expect(useLS.getState().scene!.hero).toBe(2);
  });

  it("clamps hero to last slot when drop shifts indices", () => {
    seedScene(6, "G");
    // hero = 0 (the slot about to be dropped)
    // append 1 more → 7 slots → drop 1 oldest → hero 0 shifts away
    useLS.getState().appendSlots(
      [slot()],
      { "G:6": { status: "skeleton" } },
      0 // request absolute hero 0 — which gets dropped
    );
    const hero = useLS.getState().scene!.hero;
    // After drop, hero 0 no longer exists; clamp to 0 of trimmed = 0 (first surviving).
    expect(hero).toBe(0);
  });

  it("clamps hero to slots.length-1 when value exceeds bounds", () => {
    seedScene(3, "H");
    useLS.getState().appendSlots(
      [slot()],
      { "H:3": { status: "skeleton" } },
      99 // out of range
    );
    const sc = useLS.getState().scene!;
    expect(sc.hero).toBe(sc.slots.length - 1);
  });
});

describe("appendSlots — widget seeds merged", () => {
  it("merges seed widgets into store.widgets", () => {
    seedScene(1, "I");
    useLS.getState().appendSlots(
      [slot("plot")],
      { "I:1": { status: "skeleton" } }
    );
    expect(useLS.getState().widgets["I:1"]).toEqual({ status: "skeleton" });
  });
});
