# Living Stage

Speak, and the slide grows.

A voice-driven presentation surface that builds interactive visualizations in
real time as the presenter speaks. The stage's centerpiece is an interactive
**Sim** widget — a live mathematical model with sliders that re-evaluate at
60fps as the speaker drags them. Around it, supporting widgets (charts, flow
diagrams, comparisons, annotated notes) grow into place phrase by phrase
while the presenter talks.

Built for the 2026 Google I/O Hackathon. Live demo:
**https://predator-635265297806.us-central1.run.app/**

---

## What it does

1. **You speak (or type).** The browser's Web Speech API streams interim
   transcript; phrase boundaries (300 ms silence, commas, conjunctions) fire
   incremental orchestrator calls.
2. **The model decides what to show.** Gemini 3.5 Flash returns a structured
   JSON layout (`{ intent, hero, slots, uid }`). `intent` ∈
   `{fresh, add, replace}` lets short follow-up phrases _add_ to the existing
   scene instead of replacing it — so the stage grows as the talk unfolds.
3. **Widgets fill in parallel, streaming.** Each slot's content arrives as
   Gemini streams JSON; a partial-JSON parser pushes intermediate shapes to
   the widgets so the audience sees data appearing as it's generated.
4. **The transcript self-corrects.** A second, cheap model call polishes the
   raw ASR output every ~600 ms, so earlier words get re-interpreted when
   later context arrives ("Moto mortgage" → "Model mortgage").
5. **Resilience.** Any utterance that does not return a valid scene within
   4 s falls back to an ordered rehearsed capture, announced both by TTS and
   a banner — no pretending the live model is up when it isn't.

---

## Architecture

```
 Browser (Vite build)
   ├── Web Speech API → useASR → store.transcript / interim
   ├── handleUtterance (Stage.tsx)
   │     ├── callOrchestrator → intent + slots
   │     ├── callFill ×N (parallel, streaming JSON)
   │     └── callPolish (debounced, async)
   │
   ▼  POST /v1beta/...  (same-origin)
 Cloud Run (server.js, single container)
   ├── serves dist/  (static)
   └── proxies /v1beta/* to generativelanguage.googleapis.com
        ↑ injects GEMINI_API_KEY from service env var
          (key never present in the browser bundle)
```

Single-origin design means CORS-free, key-tight: the bundle never sees the
key, and a `git grep -nE 'AIza[0-9A-Za-z_-]{20,}'` pre-push scan is part of
the workflow.

---

## Widgets

| Widget   | Role                       | Renderer                  |
|----------|----------------------------|---------------------------|
| Sim      | Hero — interactive model   | Hand-rolled `<canvas>` chart, `mathjs`-sandboxed expressions, local React state (slider drag never re-renders other widgets) |
| Plot     | Static charts              | `recharts`                |
| Compare  | Two-column comparison      | CSS grid                  |
| Flow     | Nodes + edges              | Hand-rolled SVG, cycle-safe BFS auto-layout |
| Annotate | Note with optional formula | KaTeX-rendered LaTeX      |

Each slot is wrapped in a per-widget `ErrorBoundary`, so a single
malformed fill never collapses the scene.

---

## Hard rules baked into the system

- **Model:** `gemini-3.5-flash` (the post-launch GA — not the stale
  `gemini-3-flash-preview` quickstart).
- **`thinkingLevel`:** `MINIMAL` for orchestrator and polish, `LOW` for fill.
  Higher levels are never sent (TTFT inflation kills live demos).
- **No `temperature` / `top_p` / `top_k`** — the 3.x defaults are the
  recommended path; tuning them down trips repetition.
- **No `tools` array** — implicit cache treats the first call with `tools`
  as a different prefix and silently misses.
- **`v0`, not `v`,** is the initial-value key on every sim variable.
- **Hero chart is hand-rolled `<canvas>`,** not `recharts`. 10 Hz slider
  drags through `recharts` blow the 60 fps budget.
- **Same-origin only.** The browser never speaks to
  `generativelanguage.googleapis.com` directly.
- **503 retry with abort:** four exponential-backoff attempts with jitter;
  aborts immediately on a new utterance so superseded calls cancel cleanly.
- **Defense-in-depth validation:** every fill is sent with a
  `responseJsonSchema` AND re-validated with AJV after parse.
- **Honest fallback:** rehearsed replay announces itself with TTS + visible
  banner. No cosplay of live behavior.

---

## Running it

### Hosted

Just open https://predator-635265297806.us-central1.run.app/. The page is the
demo.

### Local

```bash
npm install
```

Two terminals:

```bash
# 1. proxy + static server (needs the key)
GEMINI_API_KEY=AIza... node server.js   # listens on :8080
```

```bash
# 2. Vite dev server (proxies /v1beta/* to :8080)
npm run dev                              # listens on :5173
```

Then open http://localhost:5173. The text input is hidden by default —
press **`/`** to open it, **Esc** to close. The mic listens continuously
once granted.

**Demo hotkeys**

| Key            | Action |
|----------------|--------|
| `/`            | Open text input |
| `Esc`          | Close text input |
| `Cmd+Shift+F`  | Force fallback path (for showing the resilience story) |
| `Cmd+Shift+L`  | Recover from fallback back to live |

---

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 6, Zustand for state, Motion (Framer)
  for FLIP transitions, `mathjs` for sandboxed sim expressions, `partial-json`
  for streaming JSON, `recharts` for static plots, KaTeX for LaTeX.
- **Backend:** Node 20 single container on Cloud Run. ~140 lines of
  `server.js` — serves `dist/` and proxies `/v1beta/*` to the Gemini
  Developer API.
- **Model:** Gemini 3.5 Flash via `@google/genai` v2.6, streaming structured
  output, ~4 500-token byte-stable prefix verified cache-hitting at
  ~3 300–3 800 tokens per call.
- **Tests:** 110 unit/integration tests via Vitest covering retry,
  safe-math, schemas, fallback, store, and the rehearsed capture.

---

## Commands

```bash
npm run dev          # Vite on :5173 (needs node server.js on :8080)
npm run build        # tsc --noEmit && vite build
npm run typecheck    # tsc --noEmit
npm test             # 110 tests via vitest
npm run scan:keys    # pre-push key-leak grep (must print ✅)
npm run start        # production server (node server.js)
npm run deploy       # gcloud run deploy (auto-detects Dockerfile)
```

---

## Submission

Code is frozen at git tag `submission`.

```bash
git checkout submission   # reproduce the exact demo state
```

---

## License

This repository is the submission artifact for the 2026 Google I/O Hackathon.
All rights reserved unless a `LICENSE` file is added later.
