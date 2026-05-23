# Living Stage — 1-Minute Demo Video Shot List

Single-take OBS capture. Target: exactly 60 seconds. No cuts, no edits.
Voice drives the demo — what you say is what appears on screen.

---

## Before you record: pre-flight checklist

- [ ] Open https://predator-635265297806.us-central1.run.app/ in Chrome (fullscreen, F11)
- [ ] Grant microphone permission — confirm the mic icon in the browser address bar shows active
- [ ] Set mic input level: speak a test sentence and confirm the transcript appears in the footer
- [ ] Warm the cache: speak the projectile utterance once, let the Sim grow, then press `Cmd+Shift+L` to reset. The second take will have cached tokens (3300–3800 `cachedContentTokenCount` in the HUD top-right).
- [ ] Confirm the HUD (top-right) is visible and showing numbers after the warm run
- [ ] Set OBS to 1920x1080, 60fps, MP4 output, no webcam overlay
- [ ] Hide the browser address bar (F6 in Chrome to focus, then fullscreen again)
- [ ] Close all notifications (Do Not Disturb on macOS)
- [ ] Verify network: ping the Cloud Run URL, confirm < 200 ms
- [ ] Have a fallback mic (phone headset) ready if built-in mic garbles
- [ ] Rehearse the utterances out loud twice before recording

---

## Exact utterances to say

Primary script (memorize these, do NOT improvise wording):

1. **(0:10)** "Model the trajectory of a projectile — sliders for initial velocity and launch angle."
2. **(0:22)** "Also plot air resistance over time, then compare baseball versus smooth sphere drag."
3. **(0:34)** "Annotate the kinematic equations for range and maximum height."
4. **(0:45)** *(no speech — press Cmd+Shift+F, then say:)* "If the live model drops, we announce it honestly and replay."

Backup utterances (use if primary garbles):

- Instead of "projectile": "Model projectile motion with velocity and angle sliders."
- Instead of "air resistance": "Also chart drag force over time, then compare two sphere types."
- Instead of "annotate the kinematic": "Annotate the physics equations for range and height."

---

## Frame-by-frame timing

### 0:00 – 0:05 | Hook card

Screen: dark stage background, title appears center.
Action: type the title card text into a keynote/text overlay or simply show the app loading.
Say nothing. Let the visual breathe.

Goal: establish aesthetic — dark, minimal, premium.

### 0:05 – 0:18 | Sim hero grows (THE PEAK)

Action: speak utterance 1. Do not rush.

"Model the trajectory of a projectile — sliders for initial velocity and launch angle."

Watch for:
- Skeleton card appears within ~1 s of the last word
- `growing` indicator in the header (cyan dot)
- Sim widget fills: title, sliders (velocity, angle), and the canvas MiniChart with a parabola curve

Once the Sim is fully rendered (~2–3 s after speech ends):
- Drag the "initial velocity" slider left and right. The canvas chart updates live.
- Drag the "launch angle" slider. The chart reshapes.
- Hold on this for 5–6 full seconds. This is the moment that wins the demo.

This segment is the highest-value 13 seconds in the video. Do not rush past it.

### 0:18 – 0:30 | Incremental scene growth

Action: speak utterance 2.

"Also plot air resistance over time, then compare baseball versus smooth sphere drag."

Watch for:
- Stage header shows `growing` (additive mode, not replace)
- Plot widget card grows in to the right or below the Sim
- Compare widget grows in next — two rows (baseball vs smooth sphere) with the leaning indicator

Key visual: the Sim widget stays on screen. The stage grows. This is `intent: add`.

### 0:30 – 0:40 | KaTeX Annotate widget

Action: speak utterance 3.

"Annotate the kinematic equations for range and maximum height."

Watch for:
- Annotate card grows in
- LaTeX equations rendered: range formula, max height formula (rendered by KaTeX, not plain text)

If KaTeX renders a raw string instead of math, it means the model did not emit `$$...$$` fencing — this is rare but possible. If it happens, the plain-text fallback is still readable. Do not stop the take.

### 0:40 – 0:50 | Honest fallback demonstration

Action: press `Cmd+Shift+F` (forces fallback mode).

Watch for:
- Amber banner appears at top: "Live model unavailable — replaying rehearsed demo"
- TTS voice announces the same message aloud
- Stage replays the rehearsed Sim (mortgage payment model with rate/principal sliders)
- Sliders are still interactive in the rehearsed Sim

Say (voice-over while fallback is replaying):
"If live drops, we announce it honestly and replay. No cosplay."

This demonstrates spec §11 compliance: TTS + amber banner, ordered-index replay, not silent corruption.

Press `Cmd+Shift+L` to reset (optional — only if time allows before 0:50).

### 0:50 – 1:00 | Closing shot

Action: let the full stage rest on screen. Do not navigate. Do not click.

If you pressed `Cmd+Shift+L` the stage resets — speak one quick word to grow the Sim back ("Show projectile trajectory") and then let the stage rest.

Say:
"Speak. It grows. Touch it. It responds. Prepared slides are gone."

Final frame: dark stage with widgets on screen, transcript in footer, HUD visible in corner.

---

## What NOT to show

- DevTools console (even if clean — judges do not need to see it)
- Raw JSON in the network tab
- Error messages of any kind
- The browser address bar with the URL visible (unnecessary distraction)
- Any loading spinner that stays on screen longer than ~2 s (if it does, abort the take)
- The text input UI (the `/` toggle) — it undercuts the voice-driven story

---

## Single-take notes

- If the first take garbles an utterance, abort and restart from 0:00. Do not try to recover mid-take.
- Allow 30–45 minutes for recording. The first good take often comes on attempt 3–5.
- After a failed take, press `Cmd+Shift+L` to reset the stage before the next attempt.
- If the network drops mid-take, the fallback fires automatically (amber banner + TTS). This can be the fallback demo moment — but restart the take if it fires too early (before 0:40).
- The best single take with no edits is the submission. A polished two-take edit is worse than a slightly rough single take because the voice continuity breaks.

---

## Post-recording

- Export as MP4, 1080p, 60fps.
- Upload to YouTube as unlisted (NOT private — the share link must work without sign-in).
- Or upload to Google Drive with link sharing enabled for "anyone with the link."
- Paste the URL into the cerebralvalley submission form.
- Do NOT use Devpost for video upload — submit only to cerebralvalley.ai.
