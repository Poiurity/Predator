// Web Speech ASR hook (spec §8).
//
// Owns the SpeechRecognition lifecycle: continuous capture, interim
// accumulation in the Zustand store (survives onend/restart), 700ms
// silence flush, sentence-end punctuation flush, per-kind keyword
// pre-spawn throttling, and the mandatory onend restart loop.
//
// Hard rules from spec §8 echoed here for the next reader:
//   - rec.onend must restart if !stopped — 30s silence kills the mic otherwise.
//   - interim goes into store.setInterim, NOT a local variable, so a restart
//     does not lose accumulated text.
//   - onerror ignores no-speech / aborted / network (all benign).
//   - Cleanup: stopped=true + rec.onend=null + rec.stop() to avoid ghost loop.

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

    // flush: trim, guard empty, clear silence timer, push to store + fire onFinal.
    const flush = (t: string): void => {
      const x = t.trim();
      if (!x) return;
      if (silenceTimer.current !== null) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
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
      }

      if (final) {
        flush(final);
      } else if (interim) {
        // Arm/reset 700ms silence flush on every interim chunk.
        if (silenceTimer.current !== null) clearTimeout(silenceTimer.current);
        silenceTimer.current = window.setTimeout(() => {
          silenceTimer.current = null;
          flush(interim);
        }, 700);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      // Benign errors: no-speech (silence), aborted (we called stop),
      // network (transient). The restart loop covers these automatically.
      if (["no-speech", "aborted", "network"].includes(e.error)) return;
      console.warn("[asr] error:", e.error);
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
