// Web Speech ASR hook (spec §8).
//
// Owns the SpeechRecognition lifecycle: continuous capture, interim
// accumulation in the Zustand store (survives onend/restart), phrase-level
// flush on conjunctions/punctuation + 300ms silence, sentence-end punctuation
// flush, per-kind keyword pre-spawn throttling, and the mandatory onend
// restart loop.
//
// Hard rules from spec §8 echoed here for the next reader:
//   - rec.onend must restart if !stopped — 30s silence kills the mic otherwise.
//   - interim goes into store.setInterim, NOT a local variable, so a restart
//     does not lose accumulated text.
//   - onerror ignores no-speech / aborted / network (all benign).
//   - Cleanup: stopped=true + rec.onend=null + rec.stop() to avoid ghost loop.
//
// Phrase-boundary triggering (incremental growth, not one-shot per sentence):
//   - Silence threshold: 300ms (down from 700ms).
//   - Additional fire points: commas, semicolons, colons, and conjunctions
//     (and|then|also|plus|now|but|so) after ≥3 new words accumulated.
//   - De-dup: lastFiredText ref prevents the same text firing twice within 100ms
//     (covers the overlap between silence timer and conjunction match).

import { useEffect, useRef } from "react";
import { useLS } from "../store";
import type { WidgetType } from "../lib/schemas";

// Keyword → widget-type table (spec §8, verbatim).
const KW: [RegExp, WidgetType][] = [
  [/\b(simulate|slider|tweak|model|모델|시뮬)\b/i, "sim"],
  [/\b(chart|plot|graph|차트|그래프)\b/i, "plot"],
  [/\b(versus|vs|compare|비교)\b/i, "compare"],
  [/\b(flow|diagram|step|process|흐름|단계)\b/i, "flow"],
  [/\b(note|highlight|주석|강조)\b/i, "annotate"],
];

// Phrase boundary: inline punctuation that signals end-of-clause mid-sentence.
const PHRASE_PUNCT = /[,;:]/;

// Conjunction regex for mid-stream phrase splitting. Fires only after ≥3 new
// words have accumulated since the last fire (prevents trigger on "and" alone
// in "and then we simulate").
const CONJUNCTION_RE = /\b(and|then|also|plus|now|but|so)\b/i;

// Count whitespace-delimited words in a string.
function wordCount(s: string): number {
  return s.trim() === "" ? 0 : s.trim().split(/\s+/).length;
}

// Throttle pre-spawn per kind: same kind cannot fire twice within 500ms.
type KindTimestamps = Partial<Record<WidgetType, number>>;

export function useASR(
  onFinal: (text: string) => void,
  onPreSpawn: (kind: WidgetType) => void
): void {
  // Stable refs so the effect closure always sees the latest callbacks
  // without needing to re-run the effect (which would restart the rec).
  const onFinalRef = useRef(onFinal);
  const onPreSpawnRef = useRef(onPreSpawn);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onPreSpawnRef.current = onPreSpawn; }, [onPreSpawn]);

  const silenceTimer = useRef<number | null>(null);
  const kindTimestamps = useRef<KindTimestamps>({});

  // Phrase-level de-dup state:
  //   lastFiredText — the trimmed text of the most recently fired phrase.
  //   lastFiredAt   — timestamp of that fire (ms).
  //   wordsSinceLastFire — accumulated word count since the last phrase fire;
  //     used to gate conjunction triggers (must have ≥3 new words).
  const lastFiredText = useRef<string>("");
  const lastFiredAt = useRef<number>(0);
  const wordsSinceLastFire = useRef<number>(0);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: (new () => any) | undefined =
      win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SR) {
      // Browser does not support Web Speech — text-mode fallback in Stage
      // covers this path. Log once; do not spam.
      console.info("[asr] SpeechRecognition not available — text mode only");
      return;
    }

    const { setInterim, appendFinal } = useLS.getState();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    let stopped = false;

    // flush: trim, guard empty, guard de-dup (same text within 100ms),
    // clear silence timer, push to store + fire onFinal.
    // Does NOT clear interim from the store — continued speech accumulates.
    const flush = (t: string): void => {
      const x = t.trim();
      if (!x) return;

      // De-dup guard: don't fire the same phrase twice within 100ms.
      const now = Date.now();
      if (x === lastFiredText.current && now - lastFiredAt.current < 100) return;

      if (silenceTimer.current !== null) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }

      lastFiredText.current = x;
      lastFiredAt.current = now;
      wordsSinceLastFire.current = 0;

      appendFinal(x);
      onFinalRef.current(x);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) {
          final += r[0]!.transcript;
        } else {
          interim += r[0]!.transcript;
        }
      }

      if (interim) {
        // Accumulate in store (not a local var) so a rec restart doesn't
        // lose what was typed mid-sentence (spec §8 hard rule).
        setInterim(interim);

        // Keyword pre-spawn scan — throttled 500ms per kind.
        const now = Date.now();
        for (const [re, kind] of KW) {
          if (re.test(interim)) {
            const last = kindTimestamps.current[kind] ?? 0;
            if (now - last > 500) {
              kindTimestamps.current[kind] = now;
              onPreSpawnRef.current(kind);
            }
            break; // only one kind per interim burst
          }
        }

        // ── Phrase-boundary detection ────────────────────────────────
        // Track how many new words accumulated in this interim chunk.
        // We compare against the last fired text to find the "new" part.
        const newPart = interim.startsWith(lastFiredText.current)
          ? interim.slice(lastFiredText.current.length)
          : interim;
        wordsSinceLastFire.current = wordCount(newPart);

        // 1. Inline punctuation: fire immediately on comma/semicolon/colon.
        if (PHRASE_PUNCT.test(interim)) {
          flush(interim);
          // Arm 300ms timer for anything that comes after.
          if (silenceTimer.current !== null) clearTimeout(silenceTimer.current);
          silenceTimer.current = window.setTimeout(() => {
            silenceTimer.current = null;
            flush(useLS.getState().interim);
          }, 300);
          return;
        }

        // 2. Conjunction trigger: only when ≥3 new words have accumulated
        //    since the last fire, to avoid false-positives on partial phrases.
        if (
          wordsSinceLastFire.current >= 3 &&
          CONJUNCTION_RE.test(interim)
        ) {
          // Flush up to (but not including) the conjunction itself so the
          // presenter hears "Simulation..." and then "...and now the chart"
          // as separate utterances. In practice we just flush the full interim —
          // the conjunction is part of the next phrase's context for Gemini.
          flush(interim);
          if (silenceTimer.current !== null) clearTimeout(silenceTimer.current);
          silenceTimer.current = window.setTimeout(() => {
            silenceTimer.current = null;
            flush(useLS.getState().interim);
          }, 300);
          return;
        }

        // 3. Arm/reset 300ms silence flush on every interim chunk that didn't
        //    already trigger a phrase boundary above.
        if (silenceTimer.current !== null) clearTimeout(silenceTimer.current);
        silenceTimer.current = window.setTimeout(() => {
          silenceTimer.current = null;
          flush(useLS.getState().interim);
        }, 300);
      }

      if (final) {
        // True sentence-final result from the browser engine — flush immediately.
        flush(final);
      }
    };

    // The critical restart loop. Web Speech auto-stops after ~30s of
    // silence or on any network interruption. Without this the mic dies
    // silently and the demo fails after the first pause. (spec hard rule §8)
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start();
        } catch {
          // start() throws if already started — ignore.
        }
      }
    };

    // Terminal errors: there is no recovery, restarting the recognizer just
    // re-triggers the same error in a tight loop (~30k/sec observed with
    // not-allowed). When we see one of these, freeze the loop and warn ONCE.
    const TERMINAL = new Set([
      "not-allowed",
      "service-not-allowed",
      "audio-capture",
      "bad-grammar",
      "language-not-supported",
    ]);
    let warned = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      // Benign errors: no-speech (silence), aborted (we called stop),
      // network (transient). The restart loop covers these automatically.
      if (["no-speech", "aborted", "network"].includes(e.error)) return;

      if (TERMINAL.has(e.error)) {
        // Kill the restart loop so we do not spam errors. Text mode in
        // Stage covers the no-mic path; the user can still drive the demo.
        stopped = true;
        rec.onend = null;
        try {
          rec.stop();
        } catch {
          // already stopped
        }
        if (!warned) {
          warned = true;
          console.warn(
            `[asr] terminal error '${e.error}' — mic disabled, text mode still works`
          );
        }
        return;
      }
      if (!warned) {
        warned = true;
        console.warn("[asr] error:", e.error);
      }
    };

    rec.start();

    return () => {
      stopped = true;
      // Null out onend BEFORE stop() so the restart loop cannot fire during
      // unmount and create a ghost recognizer instance.
      rec.onend = null;
      rec.stop();
      if (silenceTimer.current !== null) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — stable via refs
}
