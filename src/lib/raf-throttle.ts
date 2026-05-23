// requestAnimationFrame coalescing for high-rate inputs (slider drag).
// Within one frame multiple calls collapse to one; the *latest* args win.
// Slider drag at 120Hz becomes ≤60Hz updates without input-latency feel.

export function rafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let scheduled = false;
  let lastArgs: Parameters<T> | undefined;
  return ((...args: Parameters<T>) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (lastArgs) fn(...lastArgs);
    });
  }) as T;
}
