// Annotate widget — body text with highlights and optional math pill (spec §4.3).
// hl: string[] — bold-highlights every match (case-insensitive) in txt.
// math: optional string — displayed as monospace pill (no KaTeX).
// React.memo: data is immutable after fill.

import { memo, useMemo } from "react";
import type { AnnotateWidget } from "../lib/schemas";
import { ErrorBoundary } from "./ErrorBoundary";
import { Skeleton } from "./Skeleton";

interface Props {
  title?: string;
  data: AnnotateWidget["data"];
}

// Split txt into runs: plain text or highlighted.
interface Run { text: string; highlight: boolean }

function buildRuns(txt: string, hl: string[]): Run[] {
  if (!hl.length) return [{ text: txt, highlight: false }];

  // Escape any regex special chars in hl terms.
  const escaped = hl.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = txt.split(pattern);

  const termSet = new Set(hl.map((h) => h.toLowerCase()));
  return parts.map((part) => ({
    text: part,
    highlight: termSet.has(part.toLowerCase()),
  }));
}

function AnnotateInner({ title, data }: Props) {
  const { txt, math, hl = [] } = data;

  const runs = useMemo(() => buildRuns(txt, hl), [txt, hl]);

  return (
    <div className="card annotate-widget">
      {title && <div className="card-title">{title}</div>}
      <p className="annotate-body">
        {runs.map((run, i) =>
          run.highlight ? (
            <strong key={i} className="annotate-hl">{run.text}</strong>
          ) : (
            <span key={i}>{run.text}</span>
          )
        )}
      </p>
      {math && (
        <div className="annotate-math-pill">
          <code className="annotate-math">{math}</code>
        </div>
      )}
    </div>
  );
}

function AnnotateWidget_({ title, data }: Props) {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <Skeleton kind="annotate" message={`annotate error: ${err.message}`} />
      )}
    >
      <AnnotateInner title={title} data={data} />
    </ErrorBoundary>
  );
}

export const Annotate = memo(AnnotateWidget_);
