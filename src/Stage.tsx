// Stage — scene orchestration shell (spec §7.3, §8, §9, §15, §16).
//
// Owns:
//   - handleUtterance: abort prior fan-out → orch → commitScene + skeletons
//     → Promise.all(fill per slot, isolated try/catch)
//   - useASR wiring (mic → handleUtterance / pre-spawn stub)
//   - Text-mode input (always visible; judges may not grant mic permission)
//   - Scene render: dispatch by widget type, ErrorBoundary per slot
//   - Transcript footer: committed + interim + cursor, aria-live="polite"
//   - Motion FLIP grow animation: scaleY 0→1, originY top ("slide dissolution")
//   - Hero pulse: slow box-shadow loop on emp:3 slot
//
// Hard rules (CLAUDE.md / spec):
//   - No React Context. All state via useLS selectors.
//   - AbortController created fresh per utterance; prior aborted first.
//   - Per-slot fill errors are isolated — one bad slot does not kill the scene.
//   - hero index clamped to slots.length-1 before any styling decision.
//   - interim must accumulate in the store (useASR handles this).
//   - will-change toggled via data-anim only during animation (data-anim rule
//     is in index.css — we set/remove the attribute around Motion lifecycle).

import {
  useRef,
  useCallback,
  useDeferredValue,
  useTransition,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { ulid } from "ulid";
import { useLS } from "./store";
import type { WidgetState } from "./store";
import type { OrchLayout, WidgetType } from "./lib/schemas";
import { callOrchestrator, callFill } from "./lib/gemini";
import { useASR } from "./hooks/useASR";
import { Sim } from "./widgets/Sim";
import { Plot } from "./widgets/Plot";
import { Compare } from "./widgets/Compare";
import { Flow } from "./widgets/Flow";
import { Annotate } from "./widgets/Annotate";
import { Skeleton } from "./widgets/Skeleton";
import { ErrorBoundary } from "./widgets/ErrorBoundary";
import { PREFIX_SHA } from "./PREFIX";
import type { SlotMeta } from "./lib/schemas";

// ── Widget dispatch ────────────────────────────────────────────────────────
// Each case renders the filled widget content only — the outer WidgetCard
// wraps every slot with ErrorBoundary + Motion so the pattern is uniform.
function WidgetContent({ ws }: { ws: WidgetState }) {
  if (ws.status === "skeleton" || !ws.data) {
    return <Skeleton kind="loading" />;
  }
  if (ws.status === "error") {
    return <Skeleton kind={ws.data?.t} message="(error)" />;
  }

  const d = ws.data;
  switch (d.t) {
    case "sim":
      return <Sim title={d.title} data={d.data} />;
    case "plot":
      return <Plot title={d.title} data={d.data} />;
    case "compare":
      return <Compare title={d.title} data={d.data} />;
    case "flow":
      return <Flow title={d.title} data={d.data} />;
    case "annotate":
      return <Annotate title={d.title} data={d.data} />;
    default: {
      // Exhaustive check — TypeScript will warn if WidgetType grows.
      const _never: never = d;
      void _never;
      return <Skeleton kind="unknown" message="(unknown widget type)" />;
    }
  }
}

// ── WidgetCard — Motion FLIP wrapper (spec §9, §16) ────────────────────────
// "Slide dissolution" aesthetic: each slot grows downward from the top
// (scaleY 0→1 with originY="top") rather than fading in. This makes it
// look like a line extending on the stage floor.
// Hero pulse: a gentle box-shadow breath on emp:3 slots.
// data-anim is set on animation start and removed on complete so
// will-change: transform (index.css: .card[data-anim]) is only active
// during the animation frame window.
interface WidgetCardProps {
  slotKey: string;
  slot: SlotMeta;
  isHero: boolean;
  ws: WidgetState;
}

function WidgetCard({ slotKey, slot, isHero, ws }: WidgetCardProps) {
  // Stable motion key: uid:index — ensures Motion FLIP treats each slot as
  // a new node when the scene changes. Never use array index alone.
  return (
    <motion.div
      key={slotKey}
      layout
      className="widget-wrapper"
      data-pos={slot.pos}
      data-sz={slot.sz}
      data-emp={slot.emp ?? 0}
      data-hero={isHero ? "true" : undefined}
      // Grow downward from top — "slide dissolution."
      initial={{ opacity: 0, scaleY: 0, originY: "top" }}
      animate={
        isHero
          ? {
              opacity: 1,
              scaleY: 1,
              originY: "top",
            }
          : { opacity: 1, scaleY: 1, originY: "top" }
      }
      exit={{ opacity: 0, scaleY: 0, originY: "top" }}
      transition={{
        duration: 0.35,
        ease: "easeOut",
        layout: { duration: 0.3, ease: "easeInOut" },
      }}
      // Toggle will-change only during animation (spec §9 perf trap).
      onAnimationStart={(e) => {
        if (e instanceof Element) e.setAttribute("data-anim", "");
      }}
      onAnimationComplete={(e) => {
        if (e instanceof Element) e.removeAttribute("data-anim");
      }}
    >
      {/* Hero pulse — wraps only hero slot. Low-intensity box-shadow loop
          on the card border so GPU compositing handles it (no layout). */}
      {isHero ? (
        <motion.div
          animate={{
            boxShadow: [
              "0 0 0 0px rgba(122, 223, 255, 0.0)",
              "0 0 0 3px rgba(122, 223, 255, 0.12)",
              "0 0 0 0px rgba(122, 223, 255, 0.0)",
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ borderRadius: 6 }}
        >
          <ErrorBoundary
            fallback={(err) => (
              <Skeleton
                kind={slot.t}
                message={`render error: ${err.message}`}
              />
            )}
          >
            <WidgetContent ws={ws} />
          </ErrorBoundary>
        </motion.div>
      ) : (
        <ErrorBoundary
          fallback={(err) => (
            <Skeleton
              kind={slot.t}
              message={`render error: ${err.message}`}
            />
          )}
        >
          <WidgetContent ws={ws} />
        </ErrorBoundary>
      )}
    </motion.div>
  );
}

// ── Stage component ──────────────────────────────────────────────────────────
export function Stage() {
  // Selectors — each component/hook only re-renders when its slice changes.
  const scene = useLS((s) => s.scene);
  const widgets = useLS((s) => s.widgets);
  const transcript = useLS((s) => s.transcript);
  const interimRaw = useLS((s) => s.interim);
  const fallbackMode = useLS((s) => s.fallbackMode);
  const commitScene = useLS((s) => s.commitScene);
  const setWidget = useLS((s) => s.setWidget);

  // Defer interim rendering so rapid ASR updates don't block the scene.
  const interim = useDeferredValue(interimRaw);

  // Single AbortController ref: new utterance aborts the prior fan-out.
  const controllerRef = useRef<AbortController | null>(null);

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

  // ── "/" hotkey → focus text input ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        textInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── handleUtterance (spec §7.3) ──────────────────────────────────────────
  const handleUtterance = useCallback(
    async (text: string) => {
      const uid = ulid();

      // Abort the previous fan-out immediately — late fill callbacks that
      // arrive after this point must not update the scene (uid mismatch
      // guard is inside the Promise.all below).
      controllerRef.current?.abort("topic-changed");
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;

      // Early tentative shell: commit an empty scene so the stage doesn't
      // stay blank while orch streams. Overwritten with real slots below.
      let heroPainted = false;
      const paintHeroShell = (heroIndex: number) => {
        if (heroPainted) return;
        heroPainted = true;
        const tentative: OrchLayout = {
          uid,
          hero: 0,
          slots: [{ t: "sim", pos: "CENTER", sz: "XL", emp: 3 }],
        };
        void heroIndex;
        startTransition(() => {
          commitScene(tentative, { [`${uid}:0`]: { status: "skeleton" } });
        });
      };

      let layout: OrchLayout;
      try {
        layout = await callOrchestrator(text, signal, paintHeroShell);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // superseded
        console.error("[stage] orchestrator failed:", err);
        // TODO §11 — wire useFallback.announce() + replay(nextScriptIndex()) here.
        return;
      }

      // Hero index safety: clamp in case the model returned out-of-range.
      const safeHero = Math.min(
        layout.hero,
        Math.max(0, layout.slots.length - 1)
      );
      const safeLayout: OrchLayout = { ...layout, uid, hero: safeHero };

      // Build skeleton seeds for every slot.
      const seeds: Record<string, WidgetState> = {};
      for (let i = 0; i < safeLayout.slots.length; i++) {
        seeds[`${uid}:${i}`] = { status: "skeleton" };
      }

      startTransition(() => {
        commitScene(safeLayout, seeds);
      });

      // Fan-out fill: each slot lives or dies independently.
      await Promise.all(
        safeLayout.slots.map((slot, i) => {
          const key = `${uid}:${i}`;
          return callFill(slot, safeLayout, text, signal)
            .then((data) => {
              setWidget(key, { status: "ready", data });
            })
            .catch((err: unknown) => {
              if ((err as Error)?.name === "AbortError") return; // superseded
              console.error(`[stage] fill(${slot.t}) slot ${i} failed:`, err);
              setWidget(key, {
                status: "error",
                error: String((err as Error)?.message ?? err),
              });
            });
        })
      );
    },
    [commitScene, setWidget, startTransition]
  );

  // ── Pre-spawn stub (spec §8 — real pre-spawn uid scheme deferred to §11) ──
  const handlePreSpawn = useCallback((kind: WidgetType) => {
    console.debug("[prespawn]", kind);
  }, []);

  // ── Wire ASR ──────────────────────────────────────────────────────────────
  useASR(handleUtterance, handlePreSpawn);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="stage">
      <header className="stage-header">
        <h1>Living Stage</h1>
        <span className="stage-tag">
          {fallbackMode ? "rehearsed" : "live"}
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

      {/* Transcript footer — always visible, spec §8 */}
      <footer className="transcript" aria-live="polite">
        {transcript && <span className="transcript-final">{transcript}</span>}
        {interim && (
          <>
            {transcript && <span className="transcript-sep"> · </span>}
            <span className="transcript-interim">{interim}</span>
          </>
        )}
        <span className="transcript-cursor">▍</span>
      </footer>
    </div>
  );
}
