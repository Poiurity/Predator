// WidgetContent + WidgetCard — extracted from Stage.tsx so progressive-
// streaming and ASR-polish edits don't collide.
//
// WidgetContent dispatches by widget type and tolerates partial data
// during status === "streaming": every nested data path is guarded so a
// half-formed object renders whatever it can, with the ErrorBoundary in
// WidgetCard as a final backstop. AJV still gates "ready" upstream — these
// guards are purely cosmetic-frame protection.
//
// WidgetCard wraps each slot with Motion FLIP, hero pulse, and the
// per-slot ErrorBoundary. data-streaming on the wrapper drives the CSS
// pulse indicator (index.css) so the audience sees the widget is in
// flight without a heavy spinner overlay.
//
// Spec §9 (slide dissolution), §16 (60fps + slot anim choreography).

import { motion } from "motion/react";
import type { WidgetState, WidgetStatus } from "../store";
import type {
  SlotMeta,
  SimWidget,
  PlotWidget,
  CompareWidget,
  FlowWidget,
  AnnotateWidget,
} from "../lib/schemas";
import { Sim } from "./Sim";
import { Plot } from "./Plot";
import { Compare } from "./Compare";
import { Flow } from "./Flow";
import { Annotate } from "./Annotate";
import { Skeleton } from "./Skeleton";
import { ErrorBoundary } from "./ErrorBoundary";

// Empty data shells per widget type. Used when status === "streaming" but
// the model hasn't emitted `data.<vars|series|rows|nodes|txt>` yet so the
// child widget never receives `undefined` on a required path.
const EMPTY_SIM: SimWidget["data"] = { vars: [], rels: [] };
const EMPTY_PLOT: PlotWidget["data"] = { k: "line", series: [] };
const EMPTY_COMPARE: CompareWidget["data"] = { a: "", b: "", rows: [] };
const EMPTY_FLOW: FlowWidget["data"] = { nodes: [], edges: [] };
const EMPTY_ANNOTATE: AnnotateWidget["data"] = { txt: "" };

export function WidgetContent({ ws }: { ws: WidgetState }) {
  // No data at all yet → loading skeleton. Covers both "skeleton" status and
  // the initial chunk window before partial-json produces anything useful.
  if (ws.status === "skeleton" || !ws.data) {
    return <Skeleton kind="loading" />;
  }
  if (ws.status === "error") {
    return <Skeleton kind={ws.data?.t} message="(error)" />;
  }

  // status ∈ {"streaming", "ready"} from here on. `d` may be a partial.
  const d = ws.data;

  // Until the discriminator key has streamed in, we have no way to dispatch.
  // Show a generic skeleton — usually only a few hundred ms in practice.
  if (!d.t) return <Skeleton kind="loading" />;

  switch (d.t) {
    case "sim": {
      const partial = d as Partial<SimWidget>;
      // Merge partial data over an empty shell so vars/rels are always arrays.
      const data: SimWidget["data"] = {
        ...EMPTY_SIM,
        ...(partial.data ?? {}),
      };
      return <Sim title={partial.title} data={data} />;
    }
    case "plot": {
      const partial = d as Partial<PlotWidget>;
      const data: PlotWidget["data"] = {
        ...EMPTY_PLOT,
        ...(partial.data ?? {}),
      };
      return <Plot title={partial.title} data={data} />;
    }
    case "compare": {
      const partial = d as Partial<CompareWidget>;
      const data: CompareWidget["data"] = {
        ...EMPTY_COMPARE,
        ...(partial.data ?? {}),
      };
      return <Compare title={partial.title} data={data} />;
    }
    case "flow": {
      const partial = d as Partial<FlowWidget>;
      const data: FlowWidget["data"] = {
        ...EMPTY_FLOW,
        ...(partial.data ?? {}),
      };
      return <Flow title={partial.title} data={data} />;
    }
    case "annotate": {
      const partial = d as Partial<AnnotateWidget>;
      const data: AnnotateWidget["data"] = {
        ...EMPTY_ANNOTATE,
        ...(partial.data ?? {}),
      };
      return <Annotate title={partial.title} data={data} />;
    }
    default: {
      // d.t escaped the WidgetType enum — surface but don't crash. (TypeScript
      // can't narrow `unknown` shapes here; the upstream AJV gate prevents
      // this in practice.)
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
// data-streaming = "true" exposes the pulse-dot indicator (index.css).
interface WidgetCardProps {
  slotKey: string;
  slot: SlotMeta;
  isHero: boolean;
  ws: WidgetState;
}

export function WidgetCard({ slotKey, slot, isHero, ws }: WidgetCardProps) {
  const isStreaming: boolean =
    (ws.status as WidgetStatus) === "streaming";

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
      data-streaming={isStreaming ? "true" : undefined}
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
