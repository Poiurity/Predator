// Gemini call surface (spec §3.6, §7.2, §7.3, §10).
//
// Browser ↔ same-origin server.js proxy ↔ Gemini Developer API. No key
// ever lives in this bundle. The SDK still demands an apiKey field at
// construction time, so we feed it a sentinel; the proxy overwrites the
// `?key=` query param upstream (see server.js).
//
// All calls go through withRetry (max 4 + jitter, abort-aware). Inside
// each call we measure first-chunk latency, push usage to the HUD on
// every chunk, defensively re-validate the parsed JSON against the
// AJV-compiled schema, and throw a typed error on validation failure so
// the orchestration layer can decide on a single-shot repair or fall
// back to rehearsed.json (spec §11 / §12).
//
// Hard rules echoed for the future-self reader (CLAUDE.md, spec §10):
//   - MODEL is "gemini-3.5-flash". NOT "gemini-3-flash-preview".
//   - thinkingLevel ∈ {"minimal" (orch/patch), "low" (fill)} only.
//   - No `tools` array. No `temperature`/`top_p`/`top_k`.

import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentResponse,
} from "@google/genai";
import { parse as parsePartial, Allow } from "partial-json";
import { withRetry } from "./retry";
import { PREFIX } from "../PREFIX";
import {
  ORCH_SCHEMA,
  SIM_SCHEMA,
  PATCH_SCHEMA,
  fillSchema,
  validateOrch,
  validateFill,
  validatePatch,
  type OrchLayout,
  type SlotMeta,
  type FilledWidget,
  type Patch,
} from "./schemas";
import { useLS } from "../store";

export const MODEL = "gemini-3.5-flash";

// Same-origin in the browser (prod = Cloud Run, dev = Vite proxy). In
// non-browser contexts (tests) fall back to an empty string so the SDK
// constructs without trying to dial out — tests should mock anyway.
function resolveBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

// "proxied" is a non-secret sentinel — the upstream key is appended by
// server.js. The SDK requires *some* apiKey value at construction.
const ai = new GoogleGenAI({
  apiKey: "proxied",
  httpOptions: { baseUrl: resolveBaseUrl() },
});

export class GeminiValidationError extends Error {
  constructor(
    message: string,
    public readonly raw: unknown,
    public readonly schemaTag: string
  ) {
    super(message);
    this.name = "GeminiValidationError";
  }
}

// ── Usage HUD push (spec §10 — 1-minute cache-miss check) ─────────────
function logUsage(chunk: GenerateContentResponse): void {
  const u = chunk.usageMetadata;
  if (!u) return;
  const slice = {
    cached: u.cachedContentTokenCount,
    prompt: u.promptTokenCount,
    cand: u.candidatesTokenCount,
  };
  // info-level so the spec §10 cache-miss check is visible without
  // toggling the verbose log filter in DevTools.
  // eslint-disable-next-line no-console
  console.info("[usage]", slice);
  useLS.getState().setHud(slice);
}

function pushLatency(startedAt: number): void {
  useLS.getState().setHud({ latencyMs: Math.round(performance.now() - startedAt) });
}

// ── Orchestrator (spec §7.2 + incremental scenes) ─────────────────────
// Streams the layout JSON. Fires `onHero` as soon as the rolling buffer
// contains a top-level "hero": N match so the shell can paint before
// the full JSON arrives. Defensively re-validates against ORCH_SCHEMA.
//
// `currentScene` (optional) lets the orchestrator grow the stage over
// successive utterances. When provided with ≥1 slot, the model sees a
// shape-only summary of what's already on stage and chooses intent ∈
// {add, replace, fresh}. We deliberately strip uid + widget bodies from
// the summary so the model treats the scene as structural context, not
// data to remix.
export function callOrchestrator(
  text: string,
  signal: AbortSignal,
  onHero: (h: number) => void,
  currentScene?: OrchLayout | null
): Promise<OrchLayout> {
  return withRetry(async (sig) => {
    const startedAt = performance.now();

    const sceneCtx =
      currentScene && currentScene.slots.length > 0
        ? `\n<currentScene>${JSON.stringify({
            slots: currentScene.slots.map((s) => ({
              t: s.t,
              pos: s.pos,
              sz: s.sz,
              emp: s.emp,
            })),
          })}</currentScene>`
        : "";

    const promptText = `${PREFIX}${sceneCtx}\n\n<utterance>${text}</utterance>`;

    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      config: {
        abortSignal: sig,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseJsonSchema: ORCH_SCHEMA,
        maxOutputTokens: 800,
        // NO `tools` (silent-miss avoidance). NO temperature/top_p/top_k.
      },
    });

    let buf = "";
    let heroSent = false;
    for await (const chunk of stream) {
      buf += chunk.text ?? "";
      if (!heroSent) {
        const m = buf.match(/"hero"\s*:\s*(\d)/);
        if (m) {
          heroSent = true;
          onHero(Number(m[1]));
        }
      }
      logUsage(chunk);
    }
    pushLatency(startedAt);

    const parsed: unknown = JSON.parse(buf);
    if (!validateOrch(parsed)) {
      throw new GeminiValidationError(
        `orchestrator output failed AJV: ${JSON.stringify(validateOrch.errors)}`,
        parsed,
        "orchestrator"
      );
    }
    return parsed;
  }, signal);
}

// ── Fill (spec §7.2) ──────────────────────────────────────────────────
// Streams a single widget body. Schema is picked by slot.t. SIM_SCHEMA
// is what enables interactive heros; everything else is read-only.
//
// `onPartial` (optional) fires after each chunk with a best-effort partial
// parse of the rolling buffer. Lets the caller render the widget as it
// grows — chart drawing itself, table filling row by row, etc. The partial
// object is NOT AJV-validated (the model may emit a trailing prefix like
// `{"t":"si` mid-stream and partial-json will collapse it to `{}`). Only
// the FINAL JSON.parse is validated, so a misbehaving model still cannot
// land an invalid widget in `ready` state. Cosmetic-only.
//
// Implementation notes:
//   - We dedupe by stringifying the partial — partial-json may return the
//     same shape across multiple chunks (especially while a long string
//     value is being filled in). No need to push duplicate setWidget calls.
//   - Allow.ALL lets us see partial strings as well as partial arrays/
//     objects/numbers so e.g. plot series with a half-finished point still
//     surface (the widget filters malformed pts before rendering).
//   - Retries replay the whole stream; if a retry succeeds onPartial will
//     fire afresh from the new attempt. Caller's last setWidget wins.
export function callFill(
  slot: SlotMeta,
  layout: OrchLayout,
  text: string,
  signal: AbortSignal,
  onPartial?: (partial: Partial<FilledWidget>) => void
): Promise<FilledWidget> {
  return withRetry(async (sig) => {
    const startedAt = performance.now();
    const schema = slot.t === "sim" ? SIM_SCHEMA : fillSchema(slot.t);
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${PREFIX}\n\n<fill kind="${slot.t}">${JSON.stringify({
                slot,
                layout,
              })}\n<utterance>${text}</utterance></fill>`,
            },
          ],
        },
      ],
      config: {
        abortSignal: sig,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        // 2400 covers Plot with 30+ data points and Flow with 8+ nodes.
        // 1200 was getting truncated on dense responses → empty JSON.parse.
        maxOutputTokens: 2400,
      },
    });

    let buf = "";
    let lastPartialJson = "";
    for await (const chunk of stream) {
      buf += chunk.text ?? "";

      // Best-effort partial parse. Skip if no callback — saves the
      // stringify cost when onPartial isn't wired (e.g. tests).
      if (onPartial && buf.length > 0) {
        try {
          const partial = parsePartial(buf, Allow.ALL);
          if (
            partial &&
            typeof partial === "object" &&
            !Array.isArray(partial)
          ) {
            // Cheap diff via stringify — only push when content changed.
            const sig = JSON.stringify(partial);
            if (sig !== lastPartialJson) {
              lastPartialJson = sig;
              onPartial(partial as Partial<FilledWidget>);
            }
          }
        } catch {
          // partial-json shouldn't throw on Allow.ALL but be defensive —
          // a malformed chunk must never blow up the stream.
        }
      }

      logUsage(chunk);
    }
    pushLatency(startedAt);

    // Final parse + validate. AJV is the gate that lets a widget transition
    // from "streaming" → "ready" — partials never satisfy it.
    // Last-resort recovery: if the stream truncated mid-JSON (maxTokens hit,
    // network blip, model stalled) the strict JSON.parse throws. Try the
    // partial parser — if it produces a shape AJV accepts, ship it.
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf);
    } catch (parseErr) {
      try {
        const recovered = parsePartial(buf, Allow.ALL);
        if (recovered && typeof recovered === "object") {
          console.warn(
            `[fill ${slot.t}] strict JSON.parse failed; using partial-recovered shape`
          );
          parsed = recovered;
        } else {
          throw parseErr;
        }
      } catch {
        throw parseErr;
      }
    }
    const result = validateFill(slot.t, parsed);
    if (!result.ok) {
      throw new GeminiValidationError(
        `fill(${slot.t}) output failed AJV: ${result.errors}`,
        parsed,
        `fill:${slot.t}`
      );
    }
    return parsed as FilledWidget;
  }, signal);
}

// ── callFillToStore — owns the store push so Stage.tsx stays thin ─────
// Wraps callFill with the streaming setWidget plumbing baked in. Stage's
// fan-out only needs to know the slot key. Returns the final widget so
// the caller can flip status → "ready" once AJV passes.
export function callFillToStore(
  slotKey: string,
  slot: SlotMeta,
  layout: OrchLayout,
  text: string,
  signal: AbortSignal
): Promise<FilledWidget> {
  const { setWidget } = useLS.getState();
  return callFill(slot, layout, text, signal, (partial) => {
    setWidget(slotKey, { status: "streaming", data: partial });
  });
}

// ── Polish (ASR cleanup — side pipeline, does not push to HUD) ────────
// Runs a cheap MINIMAL-thinking pass on the raw committed transcript so
// that earlier misheard words can be revised once later context arrives
// (e.g. "Moto mortgage rates" → "Model mortgage rates" once "rates" lands).
//
// This call is FIRE-AND-FORGET from the orchestration perspective: it runs
// in parallel with the main orch/fill pipeline and only updates the display
// transcript; it never influences widget generation.
//
// FUTURE: also feed polished phrase to handleUtterance for cleaner orch input.
export function callPolish(rawText: string, signal: AbortSignal): Promise<string> {
  return withRetry(async (sig) => {
    const prompt =
      `You are an ASR transcription cleaner. The following text is the raw output ` +
      `of a Web Speech ASR engine listening to an English-speaking presenter. ` +
      `There may be transcription errors — misheard words, run-together phrases, ` +
      `missing punctuation. Output ONLY the most likely intended sentence, cleaned ` +
      `and lightly punctuated. Do not add commentary. Do not change meaning. ` +
      `Do not invent content that wasn't said.\n\nRaw: "${rawText}"\nCleaned:`;

    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        abortSignal: sig,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "text/plain",
        maxOutputTokens: 200,
        // NO `tools`. NO temperature/top_p/top_k.
      },
    });

    let buf = "";
    for await (const chunk of stream) {
      buf += chunk.text ?? "";
      // Intentionally NOT calling logUsage here — polish is a display-side
      // helper; we don't want its usage numbers to overwrite the orch HUD metrics.
    }
    return buf.trim();
  }, signal);
}

// ── Patch (spec §4.4, §7.2) — voice edit, cuttable feature ────────────
// Stub provided so the orchestration layer has a typed entry point; the
// feature itself is gated on H5 timeline. thinking=minimal, 400 tokens.
export function callPatch(
  text: string,
  uid: string,
  signal: AbortSignal
): Promise<Patch> {
  return withRetry(async (sig) => {
    const startedAt = performance.now();
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${PREFIX}\n\n<patch uid="${uid}"><utterance>${text}</utterance></patch>`,
            },
          ],
        },
      ],
      config: {
        abortSignal: sig,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: "application/json",
        responseJsonSchema: PATCH_SCHEMA,
        maxOutputTokens: 400,
      },
    });

    let buf = "";
    for await (const chunk of stream) {
      buf += chunk.text ?? "";
      logUsage(chunk);
    }
    pushLatency(startedAt);

    const parsed: unknown = JSON.parse(buf);
    if (!validatePatch(parsed)) {
      throw new GeminiValidationError(
        `patch output failed AJV: ${JSON.stringify(validatePatch.errors)}`,
        parsed,
        "patch"
      );
    }
    return parsed;
  }, signal);
}
