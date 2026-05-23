# Cerebral Valley Hackathon — Submission Form Responses

Submit at: https://cerebralvalley.ai/e/google-io-hackathon/hackathon/submit
DO NOT submit to Devpost — Devpost submission is disqualifying.

---

## Form field answers

### Project Name

```
Living Stage
```

### One-liner (tagline)

```
Speak and the interactive slide grows at speech speed — drag a slider and the live model responds.
```

### Description (longer — ~200 words)

```
Living Stage turns the presenter's voice into a growing interactive stage in real time.
As you speak, Gemini 3.5 Flash generates a structured scene layout and fills each widget
concurrently via fan-out — Sim (live reactive model with hand-rolled canvas chart), Plot
(time-series), Compare, Flow (auto-layout SVG graph), and Annotate (KaTeX LaTeX). Widgets
stream progressively: bytes arrive, the card pulses, and the content fills in as you are still
talking.

The hero moment is the Sim widget: drag a slider and the canvas chart reacts at 60 fps. No
recharts, no re-render cost — a deterministic hand-rolled redraw loop. The model only generates
variable names, value ranges, and relation expressions. The reactive engine that evaluates those
expressions and drives the chart is hand-written in this repo.

The stage grows incrementally. Say "also" and the existing widgets stay; new ones grow in via
intent: add. ASR output is self-corrected by a background Gemini polish call. If the live model
drops, the system announces honestly via TTS and amber banner, then replays rehearsed.json.
Prepared slides do not exist. Say it and it appears. Touch it and it responds.
```

### Tech Stack

```
React 19, TypeScript, Vite, Zustand — frontend
@google/genai v2.6, gemini-3.5-flash — AI (structured JSON output, streaming, MINIMAL/LOW thinking)
Express (server.js) on Cloud Run — single container: serves static dist/ and proxies /v1beta/* to Gemini
mathjs — safe AST sandbox for Sim expression evaluation
AJV — client-side JSON schema validation (defense-in-depth alongside responseJsonSchema)
partial-json — progressive widget fill from streaming bytes
KaTeX — LaTeX rendering in Annotate widget
recharts — Plot widget only (static time-series)
motion/react — FLIP grow animation
vitest — 110 passing tests
```

### What we built today (direct link)

See README.md "What we built today" section: https://github.com/Poiurity/Predator#what-we-built-today

Summary: reactive runtime (Zustand store + scene commit + AbortController fan-out), five widget
types (Sim / Plot / Compare / Flow / Annotate), voice-to-growth pipeline (Web Speech restart loop
+ interim store accumulation + phrase-boundary triggers + diff-firing), Sim widget internal
reactive engine (variable/relation evaluation + slider bindings + hand-rolled MiniChart canvas),
503 retry (exponential backoff + AbortController integration + 4-attempt cap), partial-JSON
streaming in callFill, LLM transcript polish, AJV defense-in-depth, 4500-token byte-stable PREFIX
cache, ordered-index fallback system, 110 tests.

### Does your project use managed agents? Explain how. (REQUIRED *)

```
We use the @google/genai SDK (v2.6) to call gemini-3.5-flash with structured JSON output
(responseJsonSchema) and streaming. We did not use Vertex AI Agent Builder, the Antigravity
Managed Agents API (preview), Google ADK, or any managed-agents framework.

The orchestration logic is hand-written in this repo: an utterance fires callOrchestrator
(MINIMAL thinking) which returns a layout JSON; each slot then fires callFill concurrently
(LOW thinking) via AbortController fan-out. This is parallel specialist logic — Stage Director
decides layout, per-slot fills run concurrently — but it is implemented in plain TypeScript
client-side, not via a managed-agents API.

We evaluated the Antigravity Managed Agents preview but did not use it in the live path for
two reasons: the 14:30 PT access window on race day left insufficient time to validate it
against our deterministic widget-fill requirements, and the preview does not support structured
output, which our AJV-validated schema gate requires for correctness.
```

### Live Demo URL

```
https://predator-635265297806.us-central1.run.app/
```

Note: this URL uses a temporary account API key held in Cloud Run environment variables. Valid
during the judging period. The key is not present in the repository.

Text mode access (no microphone required): press `/` to open the text input field.

### GitHub Repository URL

```
https://github.com/Poiurity/Predator
```

### Demo Video URL

(Fill in after recording and uploading — YouTube unlisted or Google Drive with public link sharing.)

```
[INSERT VIDEO URL HERE before submitting]
```

### Git tag

```
submission
```

Frozen at commit: `0e858354b98a22bc5836b8331805262dc8a9a530`

---

## Q&A prep — likely judge questions

### "Why not use managed agents?"

The Antigravity Managed Agents API preview was not accessible until 14:30 PT on race day, and it
does not support structured output. Our live path requires deterministic AJV-validated JSON for
every widget fill — a schema violation triggers fallback, not silent corruption. Using a managed
agent that cannot guarantee structured output would break our correctness invariant in front of
judges. The orchestration logic is simpler as hand-written TypeScript fan-out anyway.

### "How do you handle 503s?"

`retry.ts` wraps every Gemini call with exponential backoff: up to 4 attempts, per-attempt jitter
(base-2 with cap), AbortController-aware so backoff sleep is interrupted immediately on abort.
429, 500, 502, 503, 504, and UNAVAILABLE/overwhelmed message patterns all trigger retry. If all 4
attempts fail, `useFallback` catches the error and fires the 4-second fallback path.

### "How does the cache work?"

`PREFIX.ts` defines a byte-stable ~4500-token system context that never changes between utterances.
All schemas are inlined via `JSON.stringify` so they track edits but stay byte-identical for any
given schema state. The utterance, slot metadata, and uid are appended after the prefix boundary by
the caller. On the second utterance, `cachedContentTokenCount` in the HUD should read 3300–3800.
If it reads 0, the prefix is too short for the API floor — we bump via the `ENABLE_PADDING_LEVER`
flag. On boot, the SHA of the prefix is logged so drift is visible immediately.

### "What if the mic doesn't work?"

Press `/` to open the text input toggle. Type a prompt and press Enter. `useASR` gracefully no-ops
when mic permission is denied — no crash, no error banner. The text path goes through exactly the
same `handleUtterance` pipeline as voice, so all widgets, fallback, and cache behavior are
identical.

### "What if Gemini is down?"

Each phrase races against a 4000 ms timeout. If the race is lost (timeout or error after 4 retries),
`useFallback` fires: `announce()` speaks a TTS message and shows an amber banner ("Live model
unavailable — replaying rehearsed demo"), then `rehearsed.json` is replayed via ordered-index
(no hash matching, spec §11). The rehearsed set covers all five widget types including a Sim with
sliders and relations. Sliders remain interactive during rehearsed replay. There is no silent
fallback — the system always tells the presenter and audience what is happening.

### "Why hand-rolled canvas for the Sim chart?"

Slider drag fires at 10 Hz. With recharts, every drag event triggers a full React render subtree
diff + SVG repaint — at 10 Hz that is jank at 60 fps. The hand-rolled `MiniChart.tsx` uses a
single `<canvas>` element, redraws only the 60-point series array in a `requestAnimationFrame`
callback, and skips if the series reference has not changed. The result is a deterministic,
predictable, 60 fps redraw with no React overhead. recharts is used only for the static Plot
widget where drag events do not exist.

### "What about security?"

`GEMINI_API_KEY` lives exclusively in Cloud Run environment variables (or Secret Manager). It is
never written to this repository, never embedded in the Vite bundle, and never sent to the browser.
The same-origin proxy in `server.js` strips the sentinel `apiKey: "proxied"` value and appends the
real key server-side. `npm run scan:keys` (`git grep -nE 'AIza[0-9A-Za-z_-]{20,}'`) must return
zero matches and is listed in the test plan as a required pre-push step.

### "What is the hero moment and what makes it yours?"

The Sim widget is the hero. The presenter says "Model projectile motion with sliders for velocity
and angle," the widget grows in, and then they drag a slider — the canvas chart reshapes live.
The model only generated the variable names, ranges, and relation expressions. The reactive engine
that evaluates those expressions, binds them to sliders, and redraws the chart is hand-written code
in `src/widgets/Sim.tsx` and `src/widgets/MiniChart.tsx`. The model is the raw material; the
interactivity is ours.

---

## Submission checklist (verify before submitting)

- [ ] `git tag submission` visible on GitHub: https://github.com/Poiurity/Predator/releases/tag/submission
- [ ] Demo URL loads without error: https://predator-635265297806.us-central1.run.app/
- [ ] `npm run scan:keys` returns zero matches
- [ ] Demo video uploaded and URL is public (unlisted YouTube or Drive "anyone with link")
- [ ] Managed agents field filled in (NOT blank)
- [ ] Submitting to cerebralvalley.ai — NOT Devpost
