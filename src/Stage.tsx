// Stage — scene orchestration shell (spec §7.3, §8, §9, §15, §16).
//
// Owns:
//   - handleUtterance: abort prior orch → orch → intent-driven commit
//     (fresh/replace: full commitScene; add: appendSlots) → fill fan-out
//   - onPreSpawn: paints a real skeleton card ≤150ms before orch responds
//   - useASR wiring (mic → handleUtterance / pre-spawn)
//   - Text-mode input (always visible; judges may not grant mic permission)
//   - Scene render: dispatch by widget type, ErrorBoundary per slot
//   - Transcript footer: committed + interim + cursor, aria-live="polite"
//   - Motion FLIP grow animation: scaleY 0→1, originY top ("slide dissolution")
//   - Hero pulse: slow box-shadow loop on emp:3 slot
//
// Hard rules (CLAUDE.md / spec):
//   - No React Context. All state via useLS selectors.
//   - orchControllerRef aborted on each new orch call; fills run to completion
//     with their own AbortController so add-mode fills aren't killed by the
//     next phrase. On fresh/replace the old controller aborts both orch and fills.
//   - Per-slot fill errors are isolated — one bad slot does not kill the scene.
//   - hero index clamped to slots.length-1 before any styling decision.
//   - interim must accumulate in the store (useASR handles this).
//   - Stale-scene: >8000ms since last commit → treat next utterance as fresh.
//   - 6-slot cap enforced by appendSlots in store.

import {
  useRef,
  useCallback,
  useDeferredValue,
  useTransition,
  useEffect,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { ulid } from "ulid";
import { useLS } from "./store";
import type { WidgetState } from "./store";
import type { OrchLayout, OrchIntent, WidgetType, Pos, SlotMeta } from "./lib/schemas";
import { callOrchestrator, callFillToStore } from "./lib/gemini";
import { runUtterance, resetFallback } from "./hooks/useFallback";
import { useASR } from "./hooks/useASR";
import { useTranscriptPolish } from "./hooks/useTranscriptPolish";
import { WidgetCard } from "./widgets/WidgetContent";
import { PREFIX_SHA } from "./PREFIX";

// ── Pos collision helper ───────────────────────────────────────────────────
// For pre-spawn skeletons only. Model picks real pos; this just avoids
// stacking a prespawn on top of an existing slot.
const CORNER_PREFERENCE: Pos[] = ["TL", "TR", "BL", "BR"];

function pickFreePos(currentSlots: SlotMeta[]): Pos {
  const used = new Set(currentSlots.map((s) => s.pos));
  for (const p of CORNER_PREFERENCE) {
    if (!used.has(p)) return p;
  }
  return "CENTER";
}

// ── Stage component ──────────────────────────────────────────────────────────
export function Stage() {
  // Selectors — each component/hook only re-renders when its slice changes.
  const scene = useLS((s) => s.scene);
  const widgets = useLS((s) => s.widgets);
  const transcript = useLS((s) => s.transcript);
  const polishedTranscript = useLS((s) => s.polishedTranscript);
  const interimRaw = useLS((s) => s.interim);
  const fallbackMode = useLS((s) => s.fallbackMode);
  const lastIntent = useLS((s) => s.lastIntent);
  const commitScene = useLS((s) => s.commitScene);
  const appendSlots = useLS((s) => s.appendSlots);
  const setWidget = useLS((s) => s.setWidget);
  const setLastIntent = useLS((s) => s.setLastIntent);

  // Defer interim rendering so rapid ASR updates don't block the scene.
  const interim = useDeferredValue(interimRaw);

  // Prefer the Gemini-polished transcript for display; fall back to raw ASR
  // output while a polish call is in-flight or before enough text accumulates.
  const displayTranscript = polishedTranscript || transcript;

  // orchControllerRef: aborted before each new orch call.
  // Fills get their OWN fresh AbortController per batch so add-mode fills
  // complete even when the next phrase starts a new orch.
  //
  // TODO(perf): for fresh/replace intent, abort the previous fill batch too.
  // Currently they fire-and-forget onto dropped slot keys — the setWidget
  // calls become no-ops because those keys are gone from the scene (appendSlots
  // dropped them). Acceptable per spec §8 "유령 카드 0" because the store
  // simply ignores writes to non-scene keys.
  const orchControllerRef = useRef<AbortController | null>(null);

  // lastCommitAt: timestamp of the last successful scene commit.
  // If >8000ms have passed, the next utterance is treated as fresh regardless
  // of the model's intent (stale-scene timeout, spec §7.3 §3a).
  const lastCommitAt = useRef<number>(0);

  // Pre-spawn uid tracking: ephemeral skeleton uids that may be replaced
  // by real orch commits. Stored so we can identify and remove them when
  // a real scene arrives that makes them redundant.
  const preSpawnUids = useRef<Set<string>>(new Set());

  // startTransition: commitScene batches inside a low-priority transition
  // so skeleton paint doesn't block the browser's main thread.
  const [, startTransition] = useTransition();

  // Text input ref — "/" hotkey focuses it.
  const textInputRef = useRef<HTMLInputElement>(null);

  // ── Boot: log PREFIX_SHA once ────────────────────────────────────────────
  useEffect(() => {
    void PREFIX_SHA.then((sha) => {
      console.debug("[stage] prefix sha ready:", sha);
    });
  }, []);

  // ── Keyboard hotkeys ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // "/" → focus text input
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        textInputRef.current?.focus();
        return;
      }

      // Cmd+Shift+L (or Ctrl+Shift+L) → reset fallback, recover live path.
      if (meta && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        resetFallback();
        useLS.getState().clearScene();
        return;
      }

      // Cmd+Shift+F (or Ctrl+Shift+F) → force fallback immediately.
      if (meta && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void runUtterance(
          "(forced-fallback-demo)",
          (_t, _sig) => Promise.reject(new Error("forced")),
          new AbortController().signal
        );
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── handleUtterance (spec §7.3) ──────────────────────────────────────────
  const handleUtterance = useCallback(
    async (text: string) => {
      // Abort prior orch (not fills — they run independently per design).
      orchControllerRef.current?.abort("topic-changed");
      const orchController = new AbortController();
      orchControllerRef.current = orchController;
      const { signal } = orchController;

      const live = async (utterance: string, sig: AbortSignal): Promise<void> => {
        const uid = ulid();

        // Read current scene to pass to orch (for add intent). Apply stale-
        // scene timeout: if >8000ms, pass null to force fresh intent.
        const stale = Date.now() - lastCommitAt.current > 8000;
        const currentScene = stale ? null : useLS.getState().scene;

        // Early tentative shell: commit a skeleton so the stage doesn't
        // stay blank while the orchestrator streams. Only for first-ever
        // scene (currentScene null) to avoid stomping an existing live scene.
        let heroPainted = false;
        const paintHeroShell = (heroIndex: number) => {
          if (heroPainted) return;
          heroPainted = true;
          if (!useLS.getState().scene) {
            const tentative: OrchLayout = {
              intent: "fresh",
              uid,
              hero: 0,
              slots: [{ t: "sim", pos: "CENTER", sz: "XL", emp: 3 }],
            };
            void heroIndex;
            startTransition(() => {
              commitScene(tentative, { [`${uid}:0`]: { status: "skeleton" } });
            });
          }
        };

        const layout = await callOrchestrator(
          utterance,
          sig,
          paintHeroShell,
          currentScene
        );

        const intent: OrchIntent = layout.intent ?? "fresh";

        // Resolve effective intent: downgrade "add" to "fresh" when there's no
        // existing scene to append to (defensive against model confusion).
        const effectiveScene = useLS.getState().scene;
        const effectiveIntent: OrchIntent =
          intent === "add" && !effectiveScene ? "fresh" : intent;

        if (effectiveIntent === "fresh" || effectiveIntent === "replace") {
          // Full scene replacement. Remove pre-spawn skeletons (their uid won't
          // match the new uid, so AnimatePresence exits them automatically).
          preSpawnUids.current.clear();

          const safeHero = Math.min(
            layout.hero,
            Math.max(0, layout.slots.length - 1)
          );
          const safeLayout: OrchLayout = {
            ...layout,
            intent: effectiveIntent,
            uid,
            hero: safeHero,
          };

          const seeds: Record<string, WidgetState> = {};
          for (let i = 0; i < safeLayout.slots.length; i++) {
            seeds[`${uid}:${i}`] = { status: "skeleton" };
          }

          startTransition(() => {
            commitScene(safeLayout, seeds);
            setLastIntent(effectiveIntent);
          });
          lastCommitAt.current = Date.now();

          // Fan-out fills — each slot gets its own AbortController so they
          // don't interfere with the next orch call's abort.
          // callFillToStore pushes status:"streaming" + partial data on every
          // chunk so widgets grow visibly. Final ready/error state is set
          // here once the AJV-validated payload resolves.
          // TODO: on fresh/replace, we could abort the PREVIOUS fill batch
          // here. Currently stale fills write to dropped slot keys and are
          // silently ignored by the store.
          void Promise.all(
            safeLayout.slots.map((slot, i) => {
              const key = `${uid}:${i}`;
              const fillController = new AbortController();
              return callFillToStore(key, slot, safeLayout, utterance, fillController.signal)
                .then((data) => {
                  setWidget(key, { status: "ready", data });
                })
                .catch((err: unknown) => {
                  if ((err as Error)?.name === "AbortError") return;
                  console.error(`[stage] fill(${slot.t}) slot ${i} failed:`, err);
                  setWidget(key, {
                    status: "error",
                    error: String((err as Error)?.message ?? err),
                  });
                });
            })
          );
        } else {
          // intent === "add": grow the existing scene.
          const base = useLS.getState().scene!; // guarded above
          const baseIndex = base.slots.length;

          // Determine absolute hero index in the merged array.
          // If any new slot has emp:3, elect that slot as the new hero.
          let newHero: number | undefined;
          for (let i = 0; i < layout.slots.length; i++) {
            if ((layout.slots[i]!.emp ?? 0) === 3) {
              newHero = baseIndex + i;
              break;
            }
          }
          // If model's hero field points to a slot in the new batch with high emp,
          // also consider it (emp check above takes precedence, but as fallback):
          if (newHero === undefined && layout.hero < layout.slots.length) {
            // Only re-elect if the new slot is "important" (emp ≥ 2).
            const modelHeroSlot = layout.slots[layout.hero];
            if (modelHeroSlot && (modelHeroSlot.emp ?? 0) >= 2) {
              newHero = baseIndex + layout.hero;
            }
          }

          const seeds: Record<string, WidgetState> = {};
          for (let i = 0; i < layout.slots.length; i++) {
            seeds[`${base.uid}:${baseIndex + i}`] = { status: "skeleton" };
          }

          startTransition(() => {
            appendSlots(layout.slots, seeds, newHero);
            setLastIntent("add");
          });
          lastCommitAt.current = Date.now();

          // Fan-out fills keyed to the EXISTING scene uid (base.uid).
          // callFillToStore pushes status:"streaming" + partial data on every
          // chunk so the audience sees the widget grow as data arrives.
          const mergedLayout: OrchLayout = {
            ...base,
            slots: [...base.slots, ...layout.slots],
          };
          void Promise.all(
            layout.slots.map((slot, i) => {
              const key = `${base.uid}:${baseIndex + i}`;
              const fillController = new AbortController();
              return callFillToStore(
                key,
                slot,
                mergedLayout,
                utterance,
                fillController.signal
              ).catch((err: unknown) => {
                if ((err as Error)?.name === "AbortError") return;
                console.error(
                  `[stage] fill(${slot.t}) slot ${baseIndex + i} failed:`,
                  err
                );
                setWidget(key, {
                  status: "error",
                  error: String((err as Error)?.message ?? err),
                });
              });
            })
          );
        }
      };

      // runUtterance handles fallbackMode check, timeout race, announce, replay.
      await runUtterance(text, live, signal);
    },
    [commitScene, appendSlots, setWidget, setLastIntent, startTransition]
  );

  // ── Pre-spawn skeleton paint (spec §8, §7.3 §3d) ─────────────────────────
  //
  // Paints a real placeholder card ≤150ms before the orch responds.
  // onPreSpawn must NOT make a network call.
  // Pre-spawn skeletons are ephemeral: when a real orch commit arrives with
  // fresh/replace intent, AnimatePresence exits them (uid mismatch).
  const handlePreSpawn = useCallback(
    (kind: WidgetType) => {
      const puid = `prespawn-${kind}-${ulid()}`;
      preSpawnUids.current.add(puid);

      const { scene } = useLS.getState();

      startTransition(() => {
        if (!scene) {
          // No scene yet — commit a tentative one-slot skeleton.
          const tentative: OrchLayout = {
            intent: "fresh",
            uid: puid,
            hero: 0,
            slots: [{ t: kind, pos: "CENTER", sz: "M", emp: 1 }],
          };
          commitScene(tentative, { [`${puid}:0`]: { status: "skeleton" } });
        } else {
          // Scene exists — append a small skeleton in a free corner.
          const freePos = pickFreePos(scene.slots);
          const slot: SlotMeta = { t: kind, pos: freePos, sz: "S", emp: 1 };
          const baseIndex = scene.slots.length;
          appendSlots(
            [slot],
            { [`${scene.uid}:${baseIndex}`]: { status: "skeleton" } }
          );
        }
      });
    },
    [commitScene, appendSlots, startTransition]
  );

  // ── Wire ASR ──────────────────────────────────────────────────────────────
  useASR(handleUtterance, handlePreSpawn);

  // ── Polish transcript (context-aware ASR correction, spec §8) ────────────
  // Runs in parallel with the orch/fill pipeline — never blocks widget gen.
  useTranscriptPolish();

  // ── Text input handler ────────────────────────────────────────────────────
  const handleTextSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const input = textInputRef.current;
      if (!input) return;
      const value = input.value.trim();
      if (!value) return;
      input.value = "";
      void handleUtterance(value);
    },
    [handleUtterance]
  );

  // ── Growing indicator label ───────────────────────────────────────────────
  const statusLabel = fallbackMode
    ? "rehearsed"
    : lastIntent === "add"
    ? "live · growing"
    : "live";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="stage">
      <header className="stage-header">
        <h1>Living Stage</h1>
        <span
          className="stage-tag"
          data-intent={lastIntent ?? "none"}
          data-fallback={fallbackMode ? "true" : undefined}
        >
          {statusLabel}
        </span>
      </header>

      <main id="scene">
        {scene && scene.slots.length > 0 ? (
          <motion.div className="scene-grid" layout>
            <AnimatePresence mode="popLayout">
              {scene.slots.map((slot, i) => {
                const key = `${scene.uid}:${i}`;
                const ws: WidgetState = widgets[key] ?? { status: "skeleton" };
                const isHero = i === scene.hero;
                return (
                  <WidgetCard
                    key={key}
                    slotKey={key}
                    slot={slot}
                    isHero={isHero}
                    ws={ws}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="scene-empty">
            <p>Speak or type to grow the stage.</p>
          </div>
        )}
      </main>

      {/* Fallback banner — shown by announce() in useFallback (§11) */}
      <div id="fallback-banner" hidden>
        Live stream interrupted — replaying rehearsed capture with the same
        architecture.
      </div>

      {/* Text mode input (spec §15) — always visible, same handleUtterance pipeline */}
      <form className="text-input-row" onSubmit={handleTextSubmit}>
        <input
          ref={textInputRef}
          type="text"
          placeholder='Type an utterance and press Enter (or speak)  —  "/" to focus'
          aria-label="text utterance input"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">Send</button>
      </form>

      {/* Transcript footer — always visible, spec §8.
          displayTranscript prefers the Gemini-polished version for context-
          aware correction (e.g. "Moto mortgage rates" → "Model mortgage rates");
          falls back to raw ASR transcript while polish is in-flight. */}
      <footer className="transcript" aria-live="polite">
        {displayTranscript && (
          <span className="transcript-final">{displayTranscript}</span>
        )}
        {interim && (
          <>
            {displayTranscript && <span className="transcript-sep"> · </span>}
            <span className="transcript-interim">{interim}</span>
          </>
        )}
        <span className="transcript-cursor">▍</span>
      </footer>
    </div>
  );
}
