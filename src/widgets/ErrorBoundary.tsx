import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  fallback: ReactNode | ((error: Error) => ReactNode);
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

// Class component because hooks cannot catch render-time errors.
// Used to wrap every widget so one bad expr/render only takes that
// slot — the rest of the scene stays alive (spec §9·§12).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[widget error]", error, info);
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
    return this.props.children;
  }
}
