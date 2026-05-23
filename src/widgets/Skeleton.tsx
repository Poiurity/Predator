interface Props {
  kind?: string;
  message?: string;
}

// Placeholder shown while a widget is loading OR after a render error.
// Stays in the layout grid so the rest of the scene does not reflow.
export function Skeleton({ kind, message }: Props) {
  return (
    <div className="card card-skeleton" data-kind={kind}>
      <div className="skeleton-bar" />
      <div className="skeleton-bar w-3-4" />
      <div className="skeleton-bar w-half" />
      {message && <div className="skeleton-message">{message}</div>}
    </div>
  );
}
