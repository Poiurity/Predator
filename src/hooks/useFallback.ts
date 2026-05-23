// useFallback — ordered-index fallback replay (spec §11).
//
// Contract:
//   runUtterance(text, live, signal)
//     - If fallbackMode is already set → replay immediately (no live attempt).
//     - Otherwise: race live against a 2500ms timeout.
//     - On any non-AbortError failure → announce() (TTS + banner) then replay().
//     - On AbortError (topic changed) → return silently, do NOT trigger fallback.
//
//   replay()
//     - Reads the next sequential index from the store (nextScriptIndex).
//     - Clamps to rehearsed.length - 1 so we never go out of bounds.
//     - Sets fallbackMode = true so ALL subsequent utterances also replay.
//     - Hydrates commitScene + setWidget including full Sim vars/rels/chart.
//
//   announce()
//     - BOTH mouth (TTS) AND visual banner. Neither alone is sufficient.
//     - Spec §11 / CLAUDE.md: hiding the switch is a disqualification risk.
//
//   resetFallback()
//     - Exported for Cmd+Shift+L hotkey in Stage.tsx.
//     - Turns off fallbackMode, resets scriptIndex, hides banner.
//     - Does NOT clear the scene — presenter decides when to trigger new live.

import rehearsed from "../rehearsed.json";
import { useLS } from "../store";

// ─── Announce: mouth (TTS) + banner (DOM) ────────────────────────────────────

export function announce(): void {
  // Mouth — TTS so the presenter's microphone demo shows the architecture
  // recovering out loud, not silently. Wrapped in try/catch: some browsers
  // require a user-gesture before TTS fires.
  // Use globalThis so this also works in non-browser test environments where
  // `window` is undefined.
  try {
    const tts = (globalThis as typeof globalThis & { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    if (tts) {
      const Utt = (globalThis as typeof globalThis & { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
      if (Utt) {
        const msg = new Utt(
          "Live stream interrupted — replaying the rehearsed capture with the same architecture."
        );
        (msg as { lang?: string }).lang = "en-US";
        tts.cancel(); // clear any queued speech first
        tts.speak(msg as SpeechSynthesisUtterance);
      }
    }
  } catch {
    // TTS is best-effort: a blocked TTS must not prevent the visual banner.
  }

  // Banner — stays visible for the rest of the session per spec §11.
  // The CSS already overrides `hidden` with display:block + opacity transition,
  // so removing `hidden` triggers the fade-in cleanly.
  const doc = (globalThis as typeof globalThis & { document?: Document }).document;
  const b = doc?.getElementById("fallback-banner");
  if (b) {
    b.hidden = false;
    b.style.display = "block";
  }
}

// ─── Replay: hydrate scene from rehearsed capture ────────────────────────────

function replay(): void {
  const { nextScriptIndex, setFallbackMode, commitScene, setWidget } =
    useLS.getState();

  // Lock into fallback so future utterances also replay sequentially.
  setFallbackMode(true);

  const i = nextScriptIndex(); // consumes and increments the counter
  const item = rehearsed[Math.min(i, rehearsed.length - 1)];
  if (!item) return;

  // Commit scene shell first, then hydrate each widget (including Sim data).
  // The store's commitScene signature is (scene, seeds) — pass empty seeds
  // here and let setWidget calls below fill them in so Sim sliders work.
  commitScene(item.scene as Parameters<typeof commitScene>[0], {});

  for (const [id, w] of Object.entries(item.widgets)) {
    setWidget(id, w as Parameters<typeof setWidget>[1]);
  }
}

// ─── runUtterance: main entry point (spec §11 pseudocode) ────────────────────

export async function runUtterance(
  text: string,
  live: (text: string, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal
): Promise<void> {
  const { fallbackMode } = useLS.getState();

  if (fallbackMode) {
    replay();
    return;
  }

  // 4000ms gives the orchestrator a comfortable margin on cold start
  // while still triggering fallback fast enough that the audience does not
  // wait. (Spec §11 says 2500ms but assumed `live` resolved on first chunk;
  // we restructured live to resolve on orch+commitScene, which is heavier.)
  try {
    await Promise.race([
      live(text, signal),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout-4000")), 4000)
      ),
    ]);
  } catch (e) {
    // AbortError means the utterance was superseded by a new one — not a
    // network/model failure. Do not trigger fallback in this case.
    if (e instanceof Error && e.name === "AbortError") return;

    announce();
    replay();
  }
}

// ─── resetFallback: manual recovery hotkey (Cmd+Shift+L) ─────────────────────

export function resetFallback(): void {
  const { setFallbackMode, resetScriptIndex } = useLS.getState();
  setFallbackMode(false);
  resetScriptIndex();

  const doc = (globalThis as typeof globalThis & { document?: Document }).document;
  const b = doc?.getElementById("fallback-banner");
  if (b) {
    b.hidden = true;
    b.style.display = "";
  }
}
