// Zustand store — single source of state for the living stage.
// Slices: transcript / scene+widgets / fallback / hud.
// Spec §6 store, §8 transcript+interim, §10 hud, §11 fallback.
//
// React Context is forbidden (spec §9): subscribers use selectors so
// unrelated widgets do not re-render when an unrelated slice changes.

import { create } from "zustand";
import type { FilledWidget, OrchLayout } from "./lib/schemas";

export type WidgetStatus = "skeleton" | "ready" | "error";

export interface WidgetState {
  status: WidgetStatus;
  data?: FilledWidget;
  error?: string;
}

export interface HudState {
  cached?: number;
  prompt?: number;
  cand?: number;
  latencyMs?: number;
  retries?: number;
}

interface LivingStage {
  // ── Transcript / ASR ─────────────────────────────────────────────
  transcript: string;
  interim: string;
  setInterim: (s: string) => void;
  appendFinal: (s: string) => void;
  clearTranscript: () => void;

  // ── Scene + Widgets ──────────────────────────────────────────────
  scene: OrchLayout | null;
  widgets: Record<string, WidgetState>;
  commitScene: (scene: OrchLayout, seeds: Record<string, WidgetState>) => void;
  setWidget: (id: string, w: WidgetState) => void;
  clearScene: () => void;

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
  clearTranscript: () => set({ transcript: "", interim: "" }),

  scene: null,
  widgets: {},
  commitScene: (scene, seeds) => set({ scene, widgets: seeds }),
  setWidget: (id, w) =>
    set((st) => ({ widgets: { ...st.widgets, [id]: w } })),
  clearScene: () => set({ scene: null, widgets: {} }),

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
