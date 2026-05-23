// JSON schemas for Gemini structured output + AJV defense-in-depth (spec §4·§12).
// The same schema object is sent as responseJsonSchema AND validated client-side
// after parsing, so a misbehaving model can't sneak through the orchestrator gate.
//
// AJV runs with strict: false so it ignores gemini-only keywords like
// `propertyOrdering` and `description` without erroring on the schema itself.

import Ajv, { type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

// ─── shared enums ──────────────────────────────────────────────────────
export const WIDGET_TYPES = ["sim", "plot", "flow", "compare", "annotate"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

const POS_ENUM = ["TL", "TR", "BL", "BR", "CENTER", "FULL"] as const;
const SZ_ENUM = ["S", "M", "L", "XL"] as const;
export type Pos = (typeof POS_ENUM)[number];
export type Sz = (typeof SZ_ENUM)[number];

// ─── ORCHESTRATOR (spec §4.1) ──────────────────────────────────────────
export const ORCH_SCHEMA = {
  type: "object",
  propertyOrdering: ["hero", "slots", "uid"],
  required: ["hero", "slots", "uid"],
  properties: {
    hero: {
      type: "integer",
      minimum: 0,
      maximum: 2,
      description: "Index of the hero slot. PREFER a 'sim' for interactivity.",
    },
    slots: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        propertyOrdering: ["t", "pos", "sz", "emp"],
        required: ["t", "pos", "sz"],
        properties: {
          t: { enum: WIDGET_TYPES },
          pos: { enum: POS_ENUM },
          sz: { enum: SZ_ENUM },
          emp: { type: "integer", minimum: 0, maximum: 3 },
        },
      },
    },
    uid: { type: "string" },
  },
} as const;

export type SlotMeta = { t: WidgetType; pos: Pos; sz: Sz; emp?: number };
export type OrchLayout = { hero: number; slots: SlotMeta[]; uid: string };

export const validateOrch = ajv.compile<OrchLayout>(ORCH_SCHEMA as object);

// ─── SIM FILL (spec §4.2) — initial-value key is v0, not v ─────────────
export const SIM_SCHEMA = {
  type: "object",
  propertyOrdering: ["t", "title", "data"],
  required: ["t", "data"],
  properties: {
    t: { const: "sim" },
    title: { type: "string", maxLength: 48 },
    data: {
      type: "object",
      required: ["vars", "rels"],
      properties: {
        vars: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            required: ["n", "v0"],
            properties: {
              n: { type: "string", description: "Variable name (widget-local)." },
              v0: { type: "number", description: "Initial value." },
              min: { type: "number" },
              max: { type: "number" },
              step: { type: "number" },
              unit: { type: "string" },
              slider: { type: "boolean", description: "true exposes a slider." },
            },
          },
        },
        rels: {
          type: "array",
          items: {
            type: "object",
            required: ["lhs", "expr"],
            properties: {
              lhs: { type: "string" },
              expr: {
                type: "string",
                description:
                  "Pure expression over vars names. Operators + - * / ^ ( ) and whitelisted functions (sqrt exp log abs min max sin cos pow floor ceil round) only. No property access, no array indexing, no assignment. No I/O.",
              },
            },
          },
        },
        chart: {
          type: "object",
          properties: {
            x: { type: "string", description: "slider variable name" },
            y: { type: "string", description: "one of rels.lhs to plot" },
            scale: { enum: ["lin", "log"] },
          },
        },
      },
    },
  },
} as const;

export type SimVar = {
  n: string;
  v0: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  slider?: boolean;
};
export type SimRel = { lhs: string; expr: string };
export type SimChart = { x?: string; y?: string; scale?: "lin" | "log" };
export type SimData = { vars: SimVar[]; rels: SimRel[]; chart?: SimChart };
export type SimWidget = { t: "sim"; title?: string; data: SimData };

export const validateSim = ajv.compile<SimWidget>(SIM_SCHEMA as object);

// ─── PLOT (spec §4.3) — recharts allowed (static) ──────────────────────
export const PLOT_SCHEMA = {
  type: "object",
  required: ["t", "data"],
  properties: {
    t: { const: "plot" },
    title: { type: "string", maxLength: 48 },
    data: {
      type: "object",
      required: ["k", "series"],
      properties: {
        k: { enum: ["line", "bar", "area", "scatter"] },
        x: { type: "string" },
        y: { type: "string" },
        scale: { enum: ["lin", "log"] },
        series: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["n", "pts"],
            properties: {
              n: { type: "string" },
              pts: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 2,
                  maxItems: 2,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type PlotKind = "line" | "bar" | "area" | "scatter";
export type PlotSeries = { n: string; pts: [number, number][] };
export type PlotData = {
  k: PlotKind;
  x?: string;
  y?: string;
  scale?: "lin" | "log";
  series: PlotSeries[];
};
export type PlotWidget = { t: "plot"; title?: string; data: PlotData };

export const validatePlot = ajv.compile<PlotWidget>(PLOT_SCHEMA as object);

// ─── COMPARE (spec §4.3) ───────────────────────────────────────────────
export const COMPARE_SCHEMA = {
  type: "object",
  required: ["t", "data"],
  properties: {
    t: { const: "compare" },
    title: { type: "string", maxLength: 48 },
    data: {
      type: "object",
      required: ["a", "b", "rows"],
      properties: {
        a: { type: "string" },
        b: { type: "string" },
        rows: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["k", "av", "bv"],
            properties: {
              k: { type: "string" },
              av: {},
              bv: {},
              lean: { enum: ["a", "b", "tie"] },
            },
          },
        },
      },
    },
  },
} as const;

export type CompareRow = {
  k: string;
  av: unknown;
  bv: unknown;
  lean?: "a" | "b" | "tie";
};
export type CompareData = { a: string; b: string; rows: CompareRow[] };
export type CompareWidget = { t: "compare"; title?: string; data: CompareData };

export const validateCompare = ajv.compile<CompareWidget>(COMPARE_SCHEMA as object);

// ─── FLOW (spec §4.3) ──────────────────────────────────────────────────
export const FLOW_SCHEMA = {
  type: "object",
  required: ["t", "data"],
  properties: {
    t: { const: "flow" },
    title: { type: "string", maxLength: 48 },
    data: {
      type: "object",
      required: ["nodes", "edges"],
      properties: {
        nodes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "l"],
            properties: {
              id: { type: "string" },
              l: { type: "string" },
              kind: { type: "string" },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["s", "t"],
            properties: {
              s: { type: "string" },
              t: { type: "string" },
              l: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

export type FlowNode = { id: string; l: string; kind?: string };
export type FlowEdge = { s: string; t: string; l?: string };
export type FlowData = { nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowWidget = { t: "flow"; title?: string; data: FlowData };

export const validateFlow = ajv.compile<FlowWidget>(FLOW_SCHEMA as object);

// ─── ANNOTATE (spec §4.3) ──────────────────────────────────────────────
export const ANNOTATE_SCHEMA = {
  type: "object",
  required: ["t", "data"],
  properties: {
    t: { const: "annotate" },
    title: { type: "string", maxLength: 48 },
    data: {
      type: "object",
      required: ["txt"],
      properties: {
        txt: { type: "string", maxLength: 280 },
        math: { type: "string" },
        hl: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

export type AnnotateData = { txt: string; math?: string; hl?: string[] };
export type AnnotateWidget = { t: "annotate"; title?: string; data: AnnotateData };

export const validateAnnotate = ajv.compile<AnnotateWidget>(ANNOTATE_SCHEMA as object);

// ─── DISPATCH (spec §7.2 — callFill picks the schema by slot.t) ────────
const SCHEMAS_BY_TYPE = {
  sim: SIM_SCHEMA,
  plot: PLOT_SCHEMA,
  compare: COMPARE_SCHEMA,
  flow: FLOW_SCHEMA,
  annotate: ANNOTATE_SCHEMA,
} as const;

const VALIDATORS_BY_TYPE: Record<WidgetType, ValidateFunction> = {
  sim: validateSim,
  plot: validatePlot,
  compare: validateCompare,
  flow: validateFlow,
  annotate: validateAnnotate,
};

export function fillSchema(t: WidgetType) {
  return SCHEMAS_BY_TYPE[t];
}

export interface FillValidationResult {
  ok: boolean;
  errors?: string;
}

export function validateFill(t: WidgetType, data: unknown): FillValidationResult {
  const v = VALIDATORS_BY_TYPE[t];
  const ok = v(data);
  return ok ? { ok: true } : { ok: false, errors: ajv.errorsText(v.errors) };
}

export type FilledWidget =
  | SimWidget
  | PlotWidget
  | CompareWidget
  | FlowWidget
  | AnnotateWidget;

// ─── PATCH (spec §4.4 — voice edit, RFC6902 subset) ────────────────────
export const PATCH_SCHEMA = {
  type: "object",
  required: ["uid", "patch"],
  properties: {
    uid: { type: "string" },
    patch: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["op", "path"],
        properties: {
          op: { enum: ["replace", "add", "remove"] },
          path: { type: "string" },
          value: {},
        },
      },
    },
  },
} as const;

export type PatchOp = {
  op: "replace" | "add" | "remove";
  path: string;
  value?: unknown;
};
export type Patch = { uid: string; patch: PatchOp[] };

export const validatePatch = ajv.compile<Patch>(PATCH_SCHEMA as object);
