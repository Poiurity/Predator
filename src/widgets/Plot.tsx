// Plot widget — recharts static chart (spec §4.3, §9).
// recharts is explicitly allowed here (and ONLY here). Do NOT use recharts in Sim.
// Supports line / bar / area / scatter. log scale via log y-axis.
// React.memo: data is immutable after fill so re-renders are rare.

import { memo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  ScatterChart,
  Line,
  Bar,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { PlotWidget } from "../lib/schemas";
import { ErrorBoundary } from "./ErrorBoundary";
import { Skeleton } from "./Skeleton";

// Design-token accent palette — one color per series, derived from the
// stage accent (#7adfff warm-cyan) plus desaturated siblings. No purple.
const SERIES_COLORS = [
  "#7adfff", // primary accent — warm cyan (stage light)
  "#ffd166", // sodium yellow
  "#a8e6cf", // pale sage
  "#ff9f80", // ember
];

interface Props {
  title?: string;
  data: PlotWidget["data"];
}

function PlotInner({ title, data }: Props) {
  const { k, series, scale, x: xLabel, y: yLabel } = data;

  // Flatten series into recharts' expected [{x, <name>: y}] format.
  // Each series contributes one key per row keyed by series name.
  const chartData = buildChartData(series);

  const yAxisProps = scale === "log" ? { scale: "log" as const, domain: ["auto", "auto"] as [string, string] } : {};

  const grid = (
    <CartesianGrid
      strokeDasharray="4 4"
      stroke="rgba(255,255,255,0.05)"
      vertical={false}
    />
  );
  const xAxis = (
    <XAxis
      dataKey="x"
      tick={{ fontSize: 11, fill: "var(--fg-dim)" }}
      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
      tickLine={false}
      label={xLabel ? { value: xLabel, position: "insideBottom", offset: -4, fill: "var(--fg-dim)", fontSize: 11 } : undefined}
    />
  );
  const yAxis = (
    <YAxis
      {...yAxisProps}
      tick={{ fontSize: 11, fill: "var(--fg-dim)" }}
      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
      tickLine={false}
      width={48}
      label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "var(--fg-dim)", fontSize: 11 } : undefined}
    />
  );
  // Tooltip animation interferes with Motion FLIP — disable it.
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--bg-card)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 4,
        color: "var(--fg)",
        fontSize: 12,
      }}
      isAnimationActive={false}
    />
  );

  const height = 220;

  let chart: React.ReactNode;
  if (k === "bar") {
    chart = (
      <BarChart data={chartData}>
        {grid}{xAxis}{yAxis}{tooltip}
        {series.map((s, idx) => (
          <Bar
            key={s.n}
            dataKey={s.n}
            fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
            isAnimationActive={false}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    );
  } else if (k === "area") {
    chart = (
      <AreaChart data={chartData}>
        {grid}{xAxis}{yAxis}{tooltip}
        {series.map((s, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          return (
            <Area
              key={s.n}
              dataKey={s.n}
              stroke={color}
              fill={color}
              fillOpacity={0.12}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    );
  } else if (k === "scatter") {
    // Scatter uses a flatter data shape — each series gets its own Scatter element.
    chart = (
      <ScatterChart>
        {grid}{xAxis}{yAxis}{tooltip}
        {series.map((s, idx) => (
          <Scatter
            key={s.n}
            name={s.n}
            data={s.pts.map(([x, y]) => ({ x, y }))}
            fill={SERIES_COLORS[idx % SERIES_COLORS.length]}
            isAnimationActive={false}
          />
        ))}
      </ScatterChart>
    );
  } else {
    // Default: line
    chart = (
      <LineChart data={chartData}>
        {grid}{xAxis}{yAxis}{tooltip}
        {series.map((s, idx) => (
          <Line
            key={s.n}
            dataKey={s.n}
            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  }

  return (
    <div className="card plot-widget">
      {title && <div className="card-title">{title}</div>}
      <div className="plot-chart-area" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart as React.ReactElement}
        </ResponsiveContainer>
      </div>
      {series.length > 1 && (
        <div className="plot-legend">
          {series.map((s, idx) => (
            <span key={s.n} className="plot-legend-item">
              <span
                className="plot-legend-swatch"
                style={{ background: SERIES_COLORS[idx % SERIES_COLORS.length] }}
              />
              {s.n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Merge all series into a single recharts data array keyed by x.
// If two series share the same x value they land on the same row.
// Partial-streaming safety: a series may arrive without `pts` yet (`{n:"Korea"}`)
// or with non-array `pts` from the partial parser — skip those entries until
// the array materializes, never throw mid-render.
function buildChartData(series: PlotWidget["data"]["series"]) {
  const map = new Map<number, Record<string, number>>();
  for (const s of series) {
    if (!s || !Array.isArray(s.pts)) continue;
    for (const pt of s.pts) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const [x, y] = pt;
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!map.has(x)) map.set(x, { x });
      map.get(x)![s.n ?? "series"] = y;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.x - b.x);
}

function PlotWidget_({ title, data }: Props) {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <Skeleton kind="plot" message={`chart error: ${err.message}`} />
      )}
    >
      <PlotInner title={title} data={data} />
    </ErrorBoundary>
  );
}

export const Plot = memo(PlotWidget_);
