// Byte-stable Gemini cache prefix (spec §10).
//
// Goal: ~2,500 tokens (1st target) of system context that does NOT change
// between utterances, so Gemini's implicit/explicit context cache reports
// cachedContentTokenCount > 0 on the 2nd utterance. If the HUD shows 0
// after the 2nd utterance, flip ENABLE_PADDING_LEVER to true to push the
// prefix to ~4,500 tokens (above every known floor — Dev API 1024/2048
// and Vertex 4096). That is the silent-miss lever.
//
// Anything that varies per call (the utterance, the slot meta, the uid)
// MUST be appended AFTER `PREFIX` by the caller — never inline it here.
//
// Schema JSON is inlined via JSON.stringify on the schema objects so the
// prefix automatically tracks schema edits but stays byte-identical for
// any given schema state. On boot we log PREFIX_SHA so divergence vs a
// known-good rehearsed value is visible (fail loud per §10).
//
// Constraint reminders for the model (echoed inside the prefix text):
//   - sim expr grammar matches src/lib/safe-math.ts ALLOWED_FNS exactly.
//   - initial-value key is `v0`, NOT `v`.
//   - thinking is minimal/low only (we set it server-side; do not assume).
//   - no `tools` array is sent (silent-miss avoidance).

import {
  ORCH_SCHEMA,
  SIM_SCHEMA,
  PLOT_SCHEMA,
  COMPARE_SCHEMA,
  FLOW_SCHEMA,
  ANNOTATE_SCHEMA,
  PATCH_SCHEMA,
} from "./lib/schemas";

// ── System framing ────────────────────────────────────────────────────
const SYSTEM = `# Living Stage — Model Brief

You drive an interactive presentation stage. The user speaks; you emit
ONE structured JSON response per call. There are two roles in the system:

1. ORCHESTRATOR — given an utterance, decide which 1-3 widgets to place
   on the stage, where, and which one is the hero (the focal widget).
   Prefer a "sim" as hero whenever the utterance is about a model,
   trade-off, parameter, scaling, dependency, or anything tweakable.
   Output the layout JSON only — NO widget content. Be fast and shallow.

2. FILL — given a single slot meta + the utterance, fill the widget's
   data. Each widget type has its own schema; emit ONLY that shape.

Hard rules for both roles:
- Output MUST be valid JSON conforming to the supplied responseJsonSchema.
- Do NOT wrap output in markdown fences. No commentary. JSON only.
- Initial-value key for sim variables is "v0" (NOT "v"). This is a
  recurring trap — repeat: v0.
- Sim "rels.expr" is a pure mathematical expression over the variable
  names declared in "vars". Allowed operators: + - * / ^ ( ). Allowed
  function names: sqrt exp log log10 log2 abs min max pow sin cos tan
  floor ceil round sign sinh cosh tanh. Allowed constants: pi e tau.
  NO property access, NO array indexing, NO assignment, NO statements.
- A sim widget should expose 1-2 sliders (slider:true) over variables
  whose change reveals the relationship the speaker is describing.
- Annotate "txt" stays under 280 chars; Plot is for static read-only
  reference data (use sim for anything interactive).

Layout DSL:
- pos ∈ {TL, TR, BL, BR, CENTER, FULL}. Hero typically CENTER or FULL
  with sz L/XL; secondary widgets take corners with sz S/M.
- sz ∈ {S, M, L, XL}. The hero MUST be at least L.
- emp ∈ {0,1,2,3}: visual emphasis. Hero is 3, supporting is 0 or 1.
- A scene has 1-3 slots total. Two-slot scenes are common; three is the
  cap. Never emit 0 slots.

Style tokens (informational — the renderer applies these, don't echo):
- background: deep stage; cards: subtle elevation; hero: pulse on emp:3.
- Display font for titles, body font for prose. No purple gradient cliche.

The "uid" field on orchestrator output is an opaque session id provided
later by the caller; emit a short ulid-like string and the runtime will
override if needed.
`;

// ── Widget catalog: schemas inlined so prefix tracks any schema edit ──
const WIDGET_CATALOG = `# Widget Catalog (responseJsonSchema candidates)

## orchestrator
${JSON.stringify(ORCH_SCHEMA)}

## sim (hero candidate — interactive, hand-rolled chart)
${JSON.stringify(SIM_SCHEMA)}

## plot (read-only, static — recharts)
${JSON.stringify(PLOT_SCHEMA)}

## compare (two-column row table)
${JSON.stringify(COMPARE_SCHEMA)}

## flow (nodes + edges)
${JSON.stringify(FLOW_SCHEMA)}

## annotate (≤280 char note, optional math/highlights)
${JSON.stringify(ANNOTATE_SCHEMA)}

## patch (voice edit — RFC6902 subset)
${JSON.stringify(PATCH_SCHEMA)}
`;

// ── Reactive expression rules (mirrors safe-math whitelist) ───────────
const REACTIVE_RULES = `# Sim Reactive Rules

Every "rels[i]" defines lhs = expr, where lhs is a derived name (not a
slider variable) and expr is a pure expression over the variable names
in "vars" plus the allowed functions/constants. The renderer compiles
expr ONCE and re-evaluates it whenever a slider variable changes (~10Hz
rAF-throttled). The hand-rolled mini chart plots chart.x (a slider var)
on the x-axis and chart.y (one of rels.lhs) on the y-axis — so chart.y
MUST exist in rels.

Bad expr examples (will be rejected by safe-math, do NOT emit):
  "x.constructor"        — property access banned
  "arr[0]"               — indexing banned
  "x = 1; x+2"           — statements banned
  "eval('1+1')"          — non-whitelisted function
  "fetch('...')"         — I/O banned

Good expr examples:
  "sqrt(a*a + b*b)"
  "p * (1 - exp(-t / tau))"
  "max(0, min(1, x / k))"
  "log(1 + n) / log(2)"

Variables that are sliders MUST set min, max, step, and slider:true.
Pick step so a full sweep is ~50-200 increments (smooth feel).
`;

// ── Few-shot examples ─────────────────────────────────────────────────
const FEWSHOT_ORCH = `# Few-shot: orchestrator

Input utterance: "let's tune a logistic growth model — carrying capacity
matters most"
Expected output (one valid JSON value, schema = orchestrator):
{"hero":0,"slots":[{"t":"sim","pos":"CENTER","sz":"XL","emp":3},{"t":"annotate","pos":"TR","sz":"S","emp":0}],"uid":"01HKZ"}

Input utterance: "compare a SQL vs a vector database for retrieval"
Expected output:
{"hero":0,"slots":[{"t":"compare","pos":"CENTER","sz":"L","emp":3},{"t":"annotate","pos":"BR","sz":"S","emp":1}],"uid":"01HKZ"}
`;

const FEWSHOT_SIM = `# Few-shot: sim fill

Input utterance: "show how RC low-pass cutoff drops as resistance grows"
Expected output (schema = sim):
{"t":"sim","title":"RC low-pass cutoff","data":{"vars":[{"n":"R","v0":1000,"min":100,"max":100000,"step":100,"unit":"ohm","slider":true},{"n":"C","v0":0.000001,"min":1e-9,"max":1e-5,"step":1e-9,"unit":"F","slider":true}],"rels":[{"lhs":"fc","expr":"1 / (2 * pi * R * C)"}],"chart":{"x":"R","y":"fc","scale":"log"}}}

Input utterance: "logistic growth, slide carrying capacity"
Expected output (schema = sim):
{"t":"sim","title":"Logistic growth","data":{"vars":[{"n":"r","v0":0.4,"min":0.05,"max":2,"step":0.01,"slider":true},{"n":"K","v0":100,"min":10,"max":500,"step":1,"unit":"units","slider":true},{"n":"t","v0":10,"min":0,"max":50,"step":0.1}],"rels":[{"lhs":"N","expr":"K / (1 + (K - 1) * exp(-r * t))"}],"chart":{"x":"K","y":"N","scale":"lin"}}}
`;

const FEWSHOT_PLOT = `# Few-shot: plot fill (static reference)

Input utterance: "show throughput vs concurrency curve from the paper"
Expected output (schema = plot):
{"t":"plot","title":"Throughput vs concurrency","data":{"k":"line","x":"concurrency","y":"throughput","scale":"lin","series":[{"n":"observed","pts":[[1,120],[2,210],[4,360],[8,540],[16,640],[32,610]]}]}}
`;

// ── Padding (lever for the 2,500 → 4,500 bump per §10) ────────────────
// Toggling this to true at build time pushes the prefix above the
// Vertex 4096-token floor. We pre-write the padding text so the lever
// is a one-line change — and keeping it as a constant means PREFIX_SHA
// changes deterministically when flipped, which is what we want.
const ENABLE_PADDING_LEVER = true;

const PADDING_BLOCK = `# Reference padding — operating notes

Notes on operating the stage that the model can lean on but should never
echo back verbatim. These exist primarily to keep the cached prefix
above every published prefix-cache floor for gemini-3.5-flash on the
Developer API and on Vertex (1024, 2048, 4096 have all been seen on
different surfaces in the last six weeks; 4500 tokens is safely above
all three).

- Utterances are short (≤40 words usually). Do not over-interpret.
- If two interpretations are equally plausible, prefer the one that
  ends in a "sim" hero — interactivity wins demos.
- For sim, the simplest closed-form relation that captures the
  speaker's claim is correct. Do not bury intent under fancy math.
- For compare, pick 3-5 rows. Each row's "lean" is optional but useful.
- For flow, 3-7 nodes. Edges go left-to-right in reading order.
- Never name a variable "constructor", "prototype", "__proto__",
  "eval", "import", "require", "Function", "process", or "globalThis".
  Those are banned identifiers in the safe-math evaluator.
- Slider step must divide (max - min) into a smooth number of points
  (50-200 is the sweet spot for the rAF-throttled redraw).
- chart.scale = "log" when the y-axis spans more than ~1.5 decades.
- If the utterance asks for a comparison of two named things, use
  compare; if it asks for a process or sequence, use flow; if it asks
  for "show me the data" or "the curve from X", use plot; otherwise
  prefer sim when there is any tunable parameter at all.

Additional few-shot — orchestrator with a flow hero:

Input utterance: "walk through the request lifecycle in our gateway"
Expected output:
{"hero":0,"slots":[{"t":"flow","pos":"CENTER","sz":"XL","emp":3},{"t":"annotate","pos":"BR","sz":"S","emp":0}],"uid":"01HKZ"}

Additional few-shot — annotate fill:

Input utterance: "remember: the bottleneck is the embedding step"
Expected output (schema = annotate):
{"t":"annotate","title":"Bottleneck reminder","data":{"txt":"Bottleneck: the embedding step dominates p99 latency. Everything else is dwarfed by it once batch size > 16.","hl":["embedding step","p99"]}}

Additional few-shot — compare fill:

Input utterance: "sql vs vector db for retrieval"
Expected output (schema = compare):
{"t":"compare","title":"SQL vs Vector DB","data":{"a":"SQL","b":"Vector DB","rows":[{"k":"query shape","av":"exact match / range","bv":"k-NN by embedding","lean":"tie"},{"k":"latency at 10M rows","av":"ms with index","bv":"ms with HNSW","lean":"tie"},{"k":"semantic similarity","av":"no","bv":"yes","lean":"b"},{"k":"transactional writes","av":"yes","bv":"limited","lean":"a"}]}}

End of padding block.
`;

// ── Assembly ──────────────────────────────────────────────────────────
const PARTS: string[] = [
  SYSTEM,
  WIDGET_CATALOG,
  REACTIVE_RULES,
  FEWSHOT_ORCH,
  FEWSHOT_SIM,
  FEWSHOT_PLOT,
];
if (ENABLE_PADDING_LEVER) PARTS.push(PADDING_BLOCK);

export const PREFIX: string = PARTS.join("\n\n");

// ── SHA-256 boot log (fail loud per §10) ──────────────────────────────
// Computed asynchronously; PREFIX_SHA is a Promise<string>. Caller should
// `await PREFIX_SHA` at app boot and compare to a known-good value.
async function computeSha(s: string): Promise<string> {
  // Browser path
  const subtle =
    typeof globalThis !== "undefined" &&
    (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(s);
    const digest = await subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node fallback (tests) — dynamic import so the browser bundle stays clean.
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

export const PREFIX_SHA: Promise<string> = computeSha(PREFIX);

// Boot log — only in browser to avoid noisy test output.
if (typeof window !== "undefined") {
  void PREFIX_SHA.then((sha) => {
    // eslint-disable-next-line no-console
    console.info(
      `[prefix] sha=${sha} bytes=${PREFIX.length} padded=${ENABLE_PADDING_LEVER}`
    );
  });
}
