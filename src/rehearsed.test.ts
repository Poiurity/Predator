// AJV smoke-check: every rehearsed.json entry must satisfy the fill schema
// for its widget type. This catches typos before they crash the widget at
// replay time (spec §11 / §12 validation gate).

import { describe, it, expect } from "vitest";
import rehearsed from "./rehearsed.json";
import { validateFill, validateOrch } from "./lib/schemas";

describe("rehearsed.json — schema validation", () => {
  it("has at least one entry", () => {
    expect(rehearsed.length).toBeGreaterThan(0);
  });

  rehearsed.forEach((entry, idx) => {
    describe(`entry ${idx} (i=${entry.i}, "${entry.utterance}")`, () => {
      it("has a valid scene (orch schema)", () => {
        const ok = validateOrch(entry.scene);
        expect(
          ok,
          `entry ${idx} scene: ${JSON.stringify((validateOrch as { errors?: unknown }).errors)}`
        ).toBe(true);
      });

      it("has at least one widget", () => {
        expect(Object.keys(entry.widgets).length).toBeGreaterThan(0);
      });

      Object.entries(entry.widgets).forEach(([id, w]) => {
        it(`widget "${id}" passes fill schema`, () => {
          const wd = w as { status: string; data?: { t: string } };
          expect(wd.data).toBeDefined();
          const t = wd.data!.t as Parameters<typeof validateFill>[0];
          const result = validateFill(t, wd.data);
          expect(
            result.ok,
            `entry ${idx} widget "${id}": ${result.errors ?? "unknown error"}`
          ).toBe(true);
        });
      });

      it("Sim entries include vars, rels, and chart", () => {
        for (const [id, w] of Object.entries(entry.widgets)) {
          const wd = w as { status: string; data?: { t: string; data?: { vars?: unknown; rels?: unknown; chart?: unknown } } };
          if (wd.data?.t === "sim") {
            expect(wd.data.data?.vars, `${id} missing vars`).toBeDefined();
            expect(wd.data.data?.rels, `${id} missing rels`).toBeDefined();
            expect(wd.data.data?.chart, `${id} missing chart`).toBeDefined();
          }
        }
      });

      it("ordinal i matches array index", () => {
        expect(entry.i).toBe(idx);
      });
    });
  });
});
