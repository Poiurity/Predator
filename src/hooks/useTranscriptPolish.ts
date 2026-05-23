// useTranscriptPolish — debounced, context-aware polish of the accumulated
// committed transcript.
//
// Strategy: on each phrase boundary (transcript store change), abort any
// in-flight polish and fire a new one after a 600ms debounce. The result
// replaces polishedTranscript in the store and is displayed instead of the
// raw ASR output in the Stage footer.
//
// Polish input: the FULL committed transcript (not just the newest phrase).
// This is the whole point — later words give Gemini enough context to fix
// earlier misheards (e.g. "Moto mortgage rates" → "Model mortgage rates"
// once "rates" confirms the surrounding phrase).
//
// If polish fails (abort, network, parse) the display layer falls back to
// the raw transcript — zero regression.
//
// FUTURE: also feed the polished phrase to handleUtterance so the orch
// receives cleaner input rather than raw ASR text.

import { useEffect, useRef } from "react";
import { useLS } from "../store";
import { callPolish } from "../lib/gemini";

export function useTranscriptPolish(): void {
  const transcript = useLS((s) => s.transcript);
  const setPolishedTranscript = useLS((s) => s.setPolishedTranscript);

  const polishCtrlRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  // Track the last input we sent to polish so we don't re-fire on identical text.
  const lastPolishedInput = useRef<string>("");

  useEffect(() => {
    // Short utterances (<4 chars) aren't worth a Gemini round-trip.
    if (!transcript || transcript.length < 4) return;

    // De-dup: don't re-polish if the committed text hasn't changed.
    if (transcript === lastPolishedInput.current) return;

    // Debounce: wait 600ms after the last transcript change before firing.
    // This batches rapid phrase appends (the user is still in mid-sentence)
    // while staying responsive enough for the demo.
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;

      // Abort any in-flight polish before starting a new one.
      polishCtrlRef.current?.abort("transcript-changed");
      const ctrl = new AbortController();
      polishCtrlRef.current = ctrl;

      lastPolishedInput.current = transcript;

      callPolish(transcript, ctrl.signal)
        .then((polished) => {
          // Only commit if this controller is still the latest and we got text.
          if (!ctrl.signal.aborted && polished) {
            setPolishedTranscript(polished);
          }
        })
        .catch((e: unknown) => {
          // AbortError is expected when a newer phrase arrives — silent.
          if ((e as Error)?.name === "AbortError") return;
          // Any other failure: leave polishedTranscript as-is; raw fallback
          // in Stage handles the display.
          console.warn("[polish] failed:", e);
        });
    }, 600);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [transcript, setPolishedTranscript]);
}
