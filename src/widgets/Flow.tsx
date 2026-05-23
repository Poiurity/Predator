// Flow widget — top-down auto-layout DAG in SVG (spec §4.3).
// No graph library. BFS layering + equal-width columns per layer.
// Nodes: rounded rects with label. Edges: quadratic bezier + arrowhead.
// React.memo: data is immutable after fill.

import { memo, useMemo } from "react";
import type { FlowWidget, FlowNode, FlowEdge } from "../lib/schemas";
import { ErrorBoundary } from "./ErrorBoundary";
import { Skeleton } from "./Skeleton";

interface Props {
  title?: string;
  data: FlowWidget["data"];
}

// Layout constants
const NODE_W = 120;
const NODE_H = 40;
const NODE_RX = 6;
const H_GAP = 36; // horizontal gap between nodes in same layer
const V_GAP = 64; // vertical gap between layers
const PAD = 20;   // canvas padding

interface LayoutNode extends FlowNode {
  x: number;
  y: number;
}

function computeLayout(nodes: FlowNode[], edges: FlowEdge[]): LayoutNode[] {
  // BFS to assign layers (longest path from a root = no incoming edges).
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  const nodeById = new Map<string, FlowNode>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
    nodeById.set(n.id, n);
  }
  for (const e of edges) {
    inDegree.set(e.t, (inDegree.get(e.t) ?? 0) + 1);
    outEdges.get(e.s)?.push(e.t);
  }

  // Layer assignment via BFS from roots.
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) { queue.push(id); layer.set(id, 0); }
  }

  // Any node not reachable from a root (cycle or disconnected) gets layer 0.
  for (const n of nodes) {
    if (!layer.has(n.id)) { queue.push(n.id); layer.set(n.id, 0); }
  }

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]!;
    const curLayer = layer.get(cur) ?? 0;
    for (const next of (outEdges.get(cur) ?? [])) {
      const existing = layer.get(next) ?? -1;
      if (curLayer + 1 > existing) {
        layer.set(next, curLayer + 1);
        queue.push(next);
      }
    }
  }

  // Group nodes by layer.
  const byLayer = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  }

  // Assign x/y for each node.
  const result: LayoutNode[] = [];
  const maxPerLayer = Math.max(...Array.from(byLayer.values()).map((a) => a.length));
  const totalW = maxPerLayer * NODE_W + (maxPerLayer - 1) * H_GAP;

  for (const [l, ids] of Array.from(byLayer.entries()).sort(([a], [b]) => a - b)) {
    const rowW = ids.length * NODE_W + (ids.length - 1) * H_GAP;
    const startX = (totalW - rowW) / 2;
    ids.forEach((id, i) => {
      const node = nodeById.get(id);
      if (!node) return;
      result.push({
        ...node,
        x: PAD + startX + i * (NODE_W + H_GAP),
        y: PAD + l * (NODE_H + V_GAP),
      });
    });
  }

  return result;
}

// Midpoint of a node's bottom center.
function bottomCenter(n: LayoutNode) { return { x: n.x + NODE_W / 2, y: n.y + NODE_H }; }
// Midpoint of a node's top center.
function topCenter(n: LayoutNode) { return { x: n.x + NODE_W / 2, y: n.y }; }

function FlowInner({ title, data }: Props) {
  const { nodes, edges } = data;

  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

  const nodeById = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of layout) m.set(n.id, n);
    return m;
  }, [layout]);

  // Compute SVG canvas size.
  const svgW = layout.reduce((max, n) => Math.max(max, n.x + NODE_W + PAD), 200);
  const svgH = layout.reduce((max, n) => Math.max(max, n.y + NODE_H + PAD), 120);

  // Arrowhead marker id — stable per widget instance.
  const markerId = "flow-arrow";

  return (
    <div className="card flow-widget">
      {title && <div className="card-title">{title}</div>}
      <div className="flow-svg-wrap">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="flow-svg"
          aria-label={title ?? "flow diagram"}
        >
          <defs>
            <marker
              id={markerId}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.35)" />
            </marker>
          </defs>

          {/* Edges first (below nodes) */}
          {edges.map((e, i) => {
            const src = nodeById.get(e.s);
            const tgt = nodeById.get(e.t);
            if (!src || !tgt) return null;
            const from = bottomCenter(src);
            const to = topCenter(tgt);
            const cp1y = from.y + (to.y - from.y) * 0.45;
            const cp2y = to.y - (to.y - from.y) * 0.45;
            const d = `M ${from.x} ${from.y} C ${from.x} ${cp1y}, ${to.x} ${cp2y}, ${to.x} ${to.y}`;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1.5}
                  markerEnd={`url(#${markerId})`}
                />
                {e.l && (
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="var(--fg-dim)"
                  >
                    {e.l}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {layout.map((n) => (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={NODE_RX}
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
              />
              <text
                x={n.x + NODE_W / 2}
                y={n.y + NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fill="var(--fg)"
              >
                {n.l.length > 14 ? n.l.slice(0, 13) + "…" : n.l}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function FlowWidget_({ title, data }: Props) {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <Skeleton kind="flow" message={`flow error: ${err.message}`} />
      )}
    >
      <FlowInner title={title} data={data} />
    </ErrorBoundary>
  );
}

export const Flow = memo(FlowWidget_);
