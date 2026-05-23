// Compare widget — two-column A vs B table (spec §4.3).
// lean:"a"|"b"|"tie" adds a thin accent bar on the winning cell.
// React.memo: data is immutable after fill.

import { memo } from "react";
import type { CompareWidget } from "../lib/schemas";
import { ErrorBoundary } from "./ErrorBoundary";
import { Skeleton } from "./Skeleton";

interface Props {
  title?: string;
  data: CompareWidget["data"];
}

function CompareInner({ title, data }: Props) {
  const { a, b, rows } = data;
  return (
    <div className="card compare-widget">
      {title && <div className="card-title">{title}</div>}
      <div className="compare-table">
        {/* Column headers */}
        <div className="compare-row compare-header">
          <div className="compare-key" />
          <div className="compare-cell compare-cell-a">{a}</div>
          <div className="compare-cell compare-cell-b">{b}</div>
        </div>
        {rows.map((row) => (
          <div key={row.k} className="compare-row">
            <div className="compare-key">{row.k}</div>
            <div
              className="compare-cell compare-cell-a"
              data-lean={row.lean === "a" ? "win" : row.lean === "tie" ? "tie" : undefined}
            >
              {String(row.av ?? "—")}
            </div>
            <div
              className="compare-cell compare-cell-b"
              data-lean={row.lean === "b" ? "win" : row.lean === "tie" ? "tie" : undefined}
            >
              {String(row.bv ?? "—")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareWidget_({ title, data }: Props) {
  return (
    <ErrorBoundary
      fallback={(err) => (
        <Skeleton kind="compare" message={`compare error: ${err.message}`} />
      )}
    >
      <CompareInner title={title} data={data} />
    </ErrorBoundary>
  );
}

export const Compare = memo(CompareWidget_);
