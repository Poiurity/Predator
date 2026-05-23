import { useMemo, useState } from "react";
import { tryCompileRels, evalRel, type CompiledRel } from "../lib/safe-math";
import { rafThrottle } from "../lib/raf-throttle";
import type { SimData, SimVar } from "../lib/schemas";
import { MiniChart } from "./MiniChart";
import { ErrorBoundary } from "./ErrorBoundary";
import { Skeleton } from "./Skeleton";

interface Props {
  data: SimData;
  title?: string;
}

// Hero Sim widget. State is LOCAL (useState) — not in the store —
// so cross-call name collisions cannot break the slider. compileRels
// throws on invalid expr; the wrapping ErrorBoundary degrades that
// single widget to a skeleton without taking the scene down. Spec §6.
export function Sim({ data, title }: Props) {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <Skeleton kind="sim" message={`expression error: ${err.message}`} />
      )}
    >
      <SimInner data={data} title={title} />
    </ErrorBoundary>
  );
}

function SimInner({ data, title }: Props) {
  // Streaming-safe guard: if vars hasn't streamed in yet, render a placeholder
  // skeleton frame instead of throwing on `data.vars[0]!`. The ErrorBoundary
  // around SimInner would catch it but remount-on-error per chunk causes jank.
  if (!data.vars || data.vars.length === 0) {
    return (
      <div className="card sim-widget" data-emp="3">
        {title && <div className="card-title">{title}</div>}
        <Skeleton kind="sim" />
      </div>
    );
  }

  const varNames = useMemo(
    () => new Set(data.vars.map((v) => v.n)),
    [data.vars]
  );

  // tryCompileRels skips rels that fail to parse instead of throwing.
  // During partial streaming the model may emit a half-formed expr ("p * ra")
  // that would throw in strict compileRels and trigger an ErrorBoundary
  // remount on every chunk. Tolerant compile keeps successfully-parsed rels
  // visible; bad ones get logged once and ignored until they fully arrive.
  const compiled = useMemo<CompiledRel[]>(() => {
    const { ok, bad } = tryCompileRels(data.rels ?? [], varNames);
    if (bad.length > 0) {
      console.debug("[sim] skipping unparseable rels (partial stream?):", bad);
    }
    return ok;
  }, [data.rels, varNames]);

  const sliderVar = useMemo<SimVar>(
    () => data.vars.find((v) => v.slider) ?? data.vars[0]!,
    [data.vars]
  );

  const [val, setVal] = useState<number>(sliderVar.v0);
  const setValRaf = useMemo(() => rafThrottle((v: number) => setVal(v)), []);

  // Evaluate every rel under the current slider value.
  const scope = useMemo(() => {
    const s: Record<string, number> = {};
    for (const v of data.vars) s[v.n] = v.n === sliderVar.n ? val : v.v0;
    for (const c of compiled) s[c.lhs] = evalRel(c, s);
    return s;
  }, [val, compiled, data.vars, sliderVar.n]);

  // Sample the y(x) curve along the slider variable's range.
  const series = useMemo(
    () => sampleCurve(data, compiled, sliderVar, 60),
    [data, compiled, sliderVar]
  );

  const yName = data.chart?.y ?? compiled[0]?.lhs ?? "";

  return (
    <div className="card sim-widget" data-emp="3">
      {title && <div className="card-title">{title}</div>}

      <MiniChart
        series={series}
        cursorX={val}
        scale={data.chart?.scale ?? "lin"}
      />

      <div className="sim-slider-row">
        <label htmlFor="sim-slider">
          {sliderVar.n}
          {sliderVar.unit ? ` (${sliderVar.unit})` : ""}
        </label>
        <input
          id="sim-slider"
          type="range"
          min={sliderVar.min ?? 0}
          max={sliderVar.max ?? 100}
          step={sliderVar.step ?? 1}
          value={val}
          onChange={(e) => setValRaf(Number(e.target.value))}
        />
        <span className="sim-value">
          {formatNumber(val)}
          {sliderVar.unit ?? ""}
        </span>
      </div>

      <div className="sim-readouts">
        {data.rels.map((r) => (
          <div
            key={r.lhs}
            className="sim-readout"
            data-current={r.lhs === yName ? "true" : "false"}
          >
            <span className="sim-readout-name">{r.lhs}</span>
            <span className="sim-readout-value">{formatNumber(scope[r.lhs])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sampleCurve(
  data: SimData,
  compiled: CompiledRel[],
  sliderVar: SimVar,
  n: number
): Array<[number, number]> {
  const min = sliderVar.min ?? 0;
  const max = sliderVar.max ?? 100;
  const yName = data.chart?.y ?? compiled[0]?.lhs;
  if (!yName) return [];

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const x = min + ((max - min) * i) / n;
    const s: Record<string, number> = {};
    for (const v of data.vars) s[v.n] = v.n === sliderVar.n ? x : v.v0;
    for (const c of compiled) s[c.lhs] = evalRel(c, s);
    const y = s[yName];
    if (Number.isFinite(y)) pts.push([x, y as number]);
  }
  return pts;
}

function formatNumber(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6 || (abs < 0.01 && n !== 0)) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
