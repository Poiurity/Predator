// Zustand store — single source of state for the living stage.
// Slices: transcript / scene+widgets / fallback / hud.
// Spec §6 store, §8 transcript+interim, §10 hud, §11 fallback.
//
// React Context is forbidden (spec §9): subscribers use selectors so
// unrelated widgets do not re-render when an unrelated slice changes.

import { create } from "zustand";
import type { FilledWidget, OrchLayout, OrchIntent, SlotMeta } from "./lib/schemas";

// "streaming" is the in-flight state pushed by callFill on each chunk as the
// model's JSON arrives. `data` is a Partial<FilledWidget> during this window —
// widgets must render whatever shape they get (spec §9 / progressive growth).
// AJV validation still happens on the FINAL parse in callFill, so a streamed
// partial cannot violate the schema gate. ErrorBoundary catches the rare case
// where a half-formed shape trips a render bug.
export type WidgetStatus = "skeleton" | "streaming" | "ready" | "error";

export interface WidgetState {
  status: WidgetStatus;
  // Full FilledWidget once status === "ready". May be a Partial<FilledWidget>
  // during status === "streaming" (any subset of keys can be present, including
  // a missing `t` discriminator before the model emits it).
  data?: FilledWidget | Partial<FilledWidget>;
  error?: string;
}

export interface HudState {
  cached?: number;
  prompt?: number;
  cand?: number;
  latencyMs?: number;
  retries?: number;
}

// Maximum simultaneous slots on stage (spec §7.3 "6-slot cap").
const MAX_SLOTS = 6;

interface LivingStage {
  // ── Transcript / ASR ─────────────────────────────────────────────
  transcript: string;
  interim: string;
  setInterim: (s: string) => void;
  appendFinal: (s: string) => void;
  clearTranscript: () => void;

  // polishedTranscript: Gemini-cleaned version of the committed transcript.
  // Updated asynchronously by useTranscriptPolish. Falls back to the raw
  // transcript in the display layer when empty (first words or in-flight).
  polishedTranscript: string;
  setPolishedTranscript: (s: string) => void;

  // ── Scene + Widgets ──────────────────────────────────────────────
  scene: OrchLayout | null;
  widgets: Record<string, WidgetState>;
  commitScene: (scene: OrchLayout, seeds: Record<string, WidgetState>) => void;
  setWidget: (id: string, w: WidgetState) => void;
  clearScene: () => void;

  // Append new slots to the current scene without replacing it.
  // Hero index (newHero) is an absolute index in the merged slot array.
  // Drops the OLDEST slots when the 6-slot cap is exceeded.
  appendSlots: (
    newSlots: SlotMeta[],
    seeds: Record<string, WidgetState>,
    newHero?: number
  ) => void;

  // ── Incremental mode indicator (for header badge) ─────────────────
  lastIntent: OrchIntent | null;
  setLastIntent: (i: OrchIntent) => void;

  // ── Fallback (spec §11 — ordered index, not hash) ────────────────
  fallbackMode: boolean;
  scriptIndex: number;
  setFallbackMode: (v: boolean) => void;
  nextScriptIndex: () => number;
  resetScriptIndex: () => void;

  // ── HUD (spec §10 — cache miss detection) ────────────────────────
  hud: HudState;
  setHud: (partial: Partial<HudState>) => void;
  resetHud: () => void;
}

export const useLS = create<LivingStage>((set, get) => ({
  transcript: "",
  interim: "",
  setInterim: (s) => set({ interim: s }),
  appendFinal: (s) =>
    set((st) => ({
      transcript: st.transcript ? `${st.transcript} ${s}` : s,
      interim: "",
    })),
  clearTranscript: () => set({ transcript: "", interim: "", polishedTranscript: "" }),

  polishedTranscript: "",
  setPolishedTranscript: (s) => set({ polishedTranscript: s }),

  scene: null,
  widgets: {},
  commitScene: (scene, seeds) => set({ scene, widgets: seeds }),
  setWidget: (id, w) =>
    set((st) => ({ widgets: { ...st.widgets, [id]: w } })),
  clearScene: () => set({ scene: null, widgets: {} }),

  appendSlots: (newSlots, seeds, newHero) => {
    const { scene, widgets } = get();
    if (!scene) return; // no scene to append to — caller should commitScene first

    const merged = [...scene.slots, ...newSlots];

    // 6-slot cap: drop oldest slots from the front.
    let trimmedWidgets = { ...widgets, ...seeds };
    let trimmedSlots = merged;
    let droppedCount = 0;
    if (merged.length > MAX_SLOTS) {
      droppedCount = merged.length - MAX_SLOTS;
      // Delete widget keys for dropped slots before slicing.
      for (let d = 0; d < droppedCount; d++) {
        delete trimmedWidgets[`${scene.uid}:${d}`];
      }
      trimmedSlots = merged.slice(droppedCount);
    }

    const resolvedHero = newHero ?? scene.hero;
    // Clamp hero into the trimmed slot array. If the old hero was in a
    // dropped slot, it gets clamped to 0 (oldest remaining slot).
    const clampedHero = Math.max(
      0,
      Math.min(resolvedHero - droppedCount, trimmedSlots.length - 1)
    );

    set({
      scene: { ...scene, slots: trimmedSlots, hero: clampedHero },
      widgets: trimmedWidgets,
    });
  },

  lastIntent: null,
  setLastIntent: (i) => set({ lastIntent: i }),

  fallbackMode: false,
  scriptIndex: 0,
  setFallbackMode: (v) => set({ fallbackMode: v }),
  nextScriptIndex: () => {
    const i = get().scriptIndex;
    set({ scriptIndex: i + 1 });
    return i;
  },
  resetScriptIndex: () => set({ scriptIndex: 0 }),

  hud: {},
  setHud: (partial) => set((st) => ({ hud: { ...st.hud, ...partial } })),
  resetHud: () => set({ hud: {} }),
}));
