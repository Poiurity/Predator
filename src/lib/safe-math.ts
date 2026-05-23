// Sandboxed math expression evaluator for Sim widget relations.
// Defense in depth: surface regex + ast node-type blocklist + symbol/fn
// whitelists + disabled dynamic import + finite-number eval. See spec §5.

import { create, all, type EvalFunction } from "mathjs";

const math = create(all);

// Block runtime escape vectors that mathjs would otherwise expose.
math.import(
  {
    import: () => {
      throw new Error("safe-math: import disabled");
    },
    createUnit: () => {
      throw new Error("safe-math: createUnit disabled");
    },
  },
  { override: true }
);

const ALLOWED_FNS = new Set([
  "sqrt", "exp", "log", "log10", "log2",
  "abs", "min", "max", "pow",
  "sin", "cos", "tan",
  "asin", "acos", "atan", "atan2",
  "floor", "ceil", "round", "sign",
  "sinh", "cosh", "tanh",
]);

const ALLOWED_CONSTS = new Set(["pi", "PI", "e", "E", "tau"]);

// Characters allowed at the surface level — anything outside this set is
// rejected before parsing (catches strings, brackets, dot-access early).
const SURFACE = /^[0-9a-zA-Z_+\-*/^().,\s]+$/;

export function validateExpr(
  expr: string,
  varNames: ReadonlySet<string>
): string[] {
  const errs: string[] = [];
  if (!SURFACE.test(expr)) errs.push("illegal characters");

  let node;
  try {
    node = math.parse(expr);
  } catch {
    return ["parse error"];
  }

  node.traverse((n: any) => {
    switch (n.type) {
      case "AccessorNode":
      case "IndexNode":
      case "ObjectNode":
      case "AssignmentNode":
      case "FunctionAssignmentNode":
        errs.push(`forbidden node: ${n.type}`);
        break;
      case "FunctionNode": {
        const fn = n.fn?.name;
        if (!fn || !ALLOWED_FNS.has(fn)) {
          errs.push(`fn not allowed: ${fn ?? "?"}`);
        }
        break;
      }
      case "SymbolNode": {
        const name = n.name;
        if (
          !varNames.has(name) &&
          !ALLOWED_CONSTS.has(name) &&
          !ALLOWED_FNS.has(name)
        ) {
          errs.push(`unknown symbol: ${name}`);
        }
        break;
      }
    }
  });

  return errs;
}

export type CompiledRel = { lhs: string; fn: EvalFunction };

// Compile-once / eval-many. Later rels may reference earlier lhs names so
// chains like { interest = p*rate, yearly = interest*12 } compile cleanly.
export function compileRels(
  rels: ReadonlyArray<{ lhs: string; expr: string }>,
  varNames: ReadonlySet<string>
): CompiledRel[] {
  const known = new Set(varNames);
  const out: CompiledRel[] = [];
  for (const r of rels) {
    const errs = validateExpr(r.expr, known);
    if (errs.length) {
      throw new Error(`bad rel "${r.lhs}": ${errs.join("; ")}`);
    }
    out.push({ lhs: r.lhs, fn: math.compile(r.expr) });
    known.add(r.lhs);
  }
  return out;
}

export function evalRel(
  c: CompiledRel,
  scope: Record<string, number>
): number {
  const v = c.fn.evaluate(scope);
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}
