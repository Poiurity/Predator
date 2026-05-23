# Living Stage

**Presenter speaks. Interactive visuals grow on stage at speech speed. The hero is a live Sim widget — drag a slider, the hand-rolled canvas chart reacts in real time at 60 fps. Prepared slides disappear. Say it and it appears. Touch it and it responds.**

Live demo: https://predator-635265297806.us-central1.run.app/
(Valid during judging period — temporary account key expires after judging. See "How to run" for self-hosting.)

Submission frozen at `git tag submission` — commit `0e858354b98a22bc5836b8331805262dc8a9a530`.

---

## Why it is different

- **Pure runtime generation, not retrieval.** Every widget is generated fresh from your speech — no slide deck, no pre-authored content, no retrieval-augmented lookup.
- **Incremental scene growth via `intent: add`.** A conjunction ("also", "and then") grows the stage rather than replacing it. The model tracks the current scene context and appends.
- **Self-correcting transcript.** `callPolish` runs Gemini on your raw ASR output so "Moto" becomes "Model" in the display before the next utterance fires.
- **Five widget types, not one.** Sim (live reactive model), Plot (time-series), Compare (ranked rows), Flow (auto-layout SVG cycle-safe graph), Annotate (KaTeX LaTeX). Each fills progressively as bytes stream.
- **The hero is touchable.** Sim sliders drive a hand-rolled canvas chart at 10 Hz without a single recharts re-render. That is the definition of the demo.

---

## Architecture

```
Browser (React 19 + Vite)
  |
  | same-origin /v1beta/* requests (no CORS, key never in bundle)
  |
Cloud Run single container
  ├── server.js  — Express: serves dist/ static AND proxies /v1beta/* to Gemini
  |                GEMINI_API_KEY lives here only (Cloud Run env var / Secret Manager)
  |
  └──> Gemini Developer API
         model: gemini-3.5-flash
         thinking: MINIMAL (orch/patch) | LOW (fill)
         no temperature / top_p / top_k
         responseJsonSchema + AJV client-side double validation
         4500-token byte-stable PREFIX cache (3300-3800 cached tokens verified live)
```

Key boundary: `GEMINI_API_KEY` never enters the browser bundle. The proxy overwrites the `?key=` query param server-side. `git grep -nE 'AIza[0-9A-Za-z_-]{20,}'` must return zero results before any push.

---

## What we built today

Everything below was written from scratch on race day. The model generates widget selection and variable/relation data only — all runtime logic is hand-written.

- **Reactive runtime** — Zustand store with scene commit, `appendSlots` for incremental growth, AbortController fan-out (one controller per phrase), intent-driven dispatch (`fresh` / `add` / `replace`).
- **Five widget types**
  - `Sim.tsx` — hero widget: mathjs safe-eval, slider bindings, hand-rolled `<canvas>` MiniChart, 60-point redraw, 10 Hz drag reactive.
  - `MiniChart.tsx` — canvas-only chart, no recharts dependency, deterministic redraw on series change.
  - `Plot.tsx` — recharts LineChart for static time-series output (permitted per spec — only the hero Sim chart must be hand-rolled).
  - `Compare.tsx` — ranked rows with leaning indicator, partial-stream tolerant (null-safe keys).
  - `Flow.tsx` — SVG auto-layout directed graph, cycle-safe DFS, null-safe labels during partial streaming.
  - `Annotate.tsx` — KaTeX LaTeX rendering with plain-text fallback.
- **Voice-to-growth pipeline** — `useASR.ts`: Web Speech `onend` restart loop (survives browser-side restarts), interim token accumulation in Zustand store (not inside the SpeechRecognition instance, so it survives restarts), 300ms silence + comma/conjunction phrase-boundary triggers, diff-firing (only the new slice of the interim is sent, not the whole transcript).
- **LLM transcript polish** — `useTranscriptPolish.ts` + `callPolish`: async Gemini call that context-corrects raw ASR output; polished string drives the footer display.
- **Sim widget internal reactive engine** — variable/relation schema evaluation, `compileRels` + `evalRel` via mathjs AST, slider binding to derived values, hand-rolled 60-point MiniChart canvas redraw only when series changes.
- **Partial-JSON streaming** — `callFill` pushes `Partial<FilledWidget>` on each chunk via `partial-json`; widgets render progressively; cyan pulse indicator shows in-flight cards; AJV validates the final parse only.
- **503 exponential backoff retry** — `retry.ts`: max 4 attempts, per-attempt jitter, AbortController-aware (immediately aborts on signal, does not sleep through abort during backoff).
- **Fallback system (spec §11)** — 4000 ms timeout race per phrase → `announce()` (TTS + amber banner, no cosplay) → `useFallback.ts` ordered-index replay from `rehearsed.json` covering all five widget types. `Cmd+Shift+F` forces fallback for demo, `Cmd+Shift+L` resets.
- **Cloud Run single-container deployment** — `server.js` (Express): serves `dist/` static files AND proxies `/v1beta/*` to Gemini. `Dockerfile` multi-stage Node 20 Alpine build. `.env` / `.gitignore` / `.dockerignore` / `.gcloudignore` configured from day one.
- **safe-math sandbox** — `safe-math.ts`: mathjs `parse()` AST walk, node-type blocklist (SymbolNode constructor/prototype/etc., FunctionNode against fn-name whitelist), expression string validated before compile.
- **AJV defense-in-depth** — same JSON schema sent as `responseJsonSchema` AND compiled with AJV and run client-side on every parsed response. `GeminiValidationError` typed throw on failure.
- **4500-token byte-stable PREFIX cache** — `PREFIX.ts`: SHA boot log, all schemas inlined via `JSON.stringify`, utterance/slot/uid appended after the prefix boundary. Live cache hit 3300-3800 `cachedContentTokenCount` verified.
- **Boot SHA fail-loud** — known-good SHA constant; if the prefix drifts on deploy, the console error is immediate and loud.
- **Text input toggle** — `/` opens text input, `Esc` closes; `useASR` gracefully no-ops when mic permission is denied.
- **110 passing tests** — `vitest` covering retry classification, safe-math AST blocklist, AJV schema validation, fallback timeout/abort, store slices, and rehearsed.json shape.
- **Motion FLIP grow animation** — `motion/react` for card entrance; glass card dark stage aesthetic.

---

## Hard rules we followed

| Rule | Value |
|---|---|
| Model ID | `gemini-3.5-flash` (NOT `gemini-3-flash-preview`) |
| thinking level | `MINIMAL` (orch/patch) / `LOW` (fill) — NEVER medium/high (TTFT death at ~20 s) |
| temperature / top_p / top_k | Not sent — Gemini 3.x defaults preferred |
| tools array | Not sent — silent-miss avoidance |
| Sim initial value key | `v0` (NOT `v`) |
| Hero chart | Hand-rolled `<canvas>` (recharts only for static Plot — 10 Hz drag + recharts = jank) |
| Key boundary | Cloud Run env var only; never in bundle; same-origin proxy; `npm run scan:keys` in CI |

---

## How to run

### Deployed (recommended during judging)

Open https://predator-635265297806.us-central1.run.app/

- Grant microphone permission when prompted.
- Speak a sentence describing what to model. The stage grows.
- Drag sliders in the Sim widget to explore the live model.
- If mic is unavailable: press `/` to open text input, type a prompt, press Enter.

Hotkeys:
- `/` — toggle text input
- `Esc` — close text input
- `Cmd+Shift+F` — force fallback demo (rehearsed.json replay with TTS + amber banner)
- `Cmd+Shift+L` — reset stage

Note: the deployed service uses a temporary API key that is valid during the judging period. This key is held in Cloud Run environment variables and is not present in this repository.

### Self-hosted (local dev)

```bash
npm install

# Terminal 1 — Gemini proxy (requires GEMINI_API_KEY)
GEMINI_API_KEY=your_key node server.js

# Terminal 2 — Vite dev server (proxies /v1beta to :8080)
npm run dev
# Open http://localhost:5173
```

Or point Vite at the deployed Cloud Run service directly:

```bash
VITE_DEV_PROXY=https://predator-635265297806.us-central1.run.app npm run dev
```

### Tests / type-check / key scan

```bash
npm test            # 110 tests, ~1.6 s
npm run typecheck   # tsc --noEmit
npm run scan:keys   # git grep for key patterns — must return 0 matches
```

### Deploy to Cloud Run

```bash
npm run deploy
# Uses gcloud run deploy --source . (Cloud Build multi-stage Dockerfile)
# Set CR_SERVICE and CR_REGION env vars to override defaults.
```

---

## Stack

| Dependency | Version | Role |
|---|---|---|
| `@google/genai` | ^2.6.0 | Gemini SDK (structured output, streaming) |
| `react` / `react-dom` | ^19.0.0 | UI |
| `zustand` | ^5.0.0 | State (no React Context) |
| `motion` | ^12.0.0 | FLIP grow animation |
| `recharts` | ^2.13.0 | Plot widget (static chart only) |
| `mathjs` | ^14.0.0 | safe-math AST sandbox for Sim expressions |
| `ajv` | ^8.17.1 | JSON schema validation (client-side, defense-in-depth) |
| `partial-json` | ^0.1.7 | Progressive widget fill from streaming bytes |
| `katex` | ^0.17.0 | LaTeX rendering in Annotate widget |
| `ulid` | ^2.3.0 | Widget slot IDs |
| `vite` | ^6.0.0 | Build / dev server |
| `vitest` | ^4.1.7 | Test runner |
| `typescript` | ^5.6.3 | Type checking |

---

## Submission info

- Submission frozen at `git tag submission` (commit `0e858354b98a22bc5836b8331805262dc8a9a530`)
- Submitted to: cerebralvalley.ai/e/google-io-hackathon/hackathon/submit
- GitHub: https://github.com/Poiurity/Predator

**Note on judging-period access:** The deployed URL above uses a temporary account API key configured as a Cloud Run environment variable. This key is valid during the judging period. It is not present in this repository (`npm run scan:keys` returns zero matches). Judges who want to run the project locally will need to supply their own `GEMINI_API_KEY`.
