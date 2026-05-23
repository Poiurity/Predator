import { describe, it, expect } from "vitest";
import { validateExpr, compileRels, evalRel } from "./safe-math";

const vars = new Set(["x", "y", "rate", "p"]);

describe("validateExpr — allowed shapes", () => {
  it("accepts simple arithmetic with known vars", () => {
    expect(validateExpr("x * 2 + y", vars)).toEqual([]);
  });

  it("accepts whitelisted functions and constants", () => {
    expect(validateExpr("sqrt(abs(x)) + log(y) + pi", vars)).toEqual([]);
  });

  it("accepts unary minus, decimals, and exponents", () => {
    expect(validateExpr("-3.14 * x^2", vars)).toEqual([]);
  });

  it("accepts parens and nesting", () => {
    expect(validateExpr("((x + y) * rate) / 100", vars)).toEqual([]);
  });

  it("accepts min/max/pow with multiple args", () => {
    expect(validateExpr("max(min(x, y), pow(rate, 2))", vars)).toEqual([]);
  });
});

describe("validateExpr — blocked shapes (security)", () => {
  it("blocks .constructor accessor (sandbox escape attempt)", () => {
    expect(validateExpr("x.constructor", vars).length).toBeGreaterThan(0);
  });

  it("blocks array index access", () => {
    expect(validateExpr("x[0]", vars).length).toBeGreaterThan(0);
  });

  it("blocks assignment", () => {
    const errs = validateExpr("y = 5", vars);
    expect(errs.some((e) => /AssignmentNode/.test(e))).toBe(true);
  });

  it("blocks function declarations", () => {
    const errs = validateExpr("f(a) = a + 1", vars);
    expect(errs.some((e) => /FunctionAssignmentNode/.test(e))).toBe(true);
  });

  it("blocks object literals", () => {
    expect(validateExpr("{a:1}", vars).length).toBeGreaterThan(0);
  });

  it("blocks string literals via surface regex", () => {
    const errs = validateExpr('"hi"', vars);
    expect(errs.some((e) => /illegal/.test(e))).toBe(true);
  });

  it("blocks unknown symbols", () => {
    const errs = validateExpr("x + zzz", vars);
    expect(errs.some((e) => /unknown symbol: zzz/.test(e))).toBe(true);
  });

  it("blocks unknown functions", () => {
    const errs = validateExpr("evil(x)", vars);
    expect(errs.some((e) => /fn not allowed/.test(e))).toBe(true);
  });

  it("returns parse error on unbalanced parens", () => {
    expect(validateExpr("((x +", vars)).toEqual(["parse error"]);
  });

  it("rejects import() as a forbidden function call", () => {
    expect(validateExpr("import(x)", new Set(["x"])).length).toBeGreaterThan(0);
  });

  it("rejects createUnit() as a forbidden function call", () => {
    expect(
      validateExpr("createUnit(x)", new Set(["x"])).length
    ).toBeGreaterThan(0);
  });
});

describe("compileRels + evalRel", () => {
  it("compiles and evaluates a single rel correctly", () => {
    const compiled = compileRels(
      [{ lhs: "monthly", expr: "p * rate / 1200" }],
      vars
    );
    expect(compiled.length).toBe(1);
    expect(evalRel(compiled[0]!, { p: 200000, rate: 5 })).toBeCloseTo(833.33, 1);
  });

  it("supports chained rels (later rel references earlier lhs)", () => {
    const compiled = compileRels(
      [
        { lhs: "interest", expr: "p * rate" },
        { lhs: "yearly",   expr: "interest * 12 / 100" },
      ],
      new Set(["p", "rate"])
    );
    const scope: Record<string, number> = { p: 1000, rate: 5 };
    for (const c of compiled) scope[c.lhs] = evalRel(c, scope);
    expect(scope.interest).toBe(5000);
    expect(scope.yearly).toBe(600);
  });

  it("throws when a rel expr is invalid", () => {
    expect(() =>
      compileRels(
        [{ lhs: "bad", expr: "x.constructor" }],
        new Set(["x"])
      )
    ).toThrow(/bad rel "bad"/);
  });

  it("evalRel returns NaN on non-finite (division by zero)", () => {
    const compiled = compileRels(
      [{ lhs: "div", expr: "1 / x" }],
      new Set(["x"])
    );
    expect(evalRel(compiled[0]!, { x: 0 })).toBeNaN();
  });

  it("evalRel returns NaN when result is complex (log of negative)", () => {
    const compiled = compileRels(
      [{ lhs: "lg", expr: "log(x)" }],
      new Set(["x"])
    );
    expect(evalRel(compiled[0]!, { x: -1 })).toBeNaN();
  });
});
