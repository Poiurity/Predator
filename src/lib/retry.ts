// Exponential backoff retry for transient Gemini errors (spec §7.1).
// Required for gemini-3.5-flash which hits 503 under load post-launch.
//
// Bound is mandatory: unbounded retries can trip the temp account's
// abuse clause (= disqualification). The sleep itself is abort-aware so
// switching utterances cancels a pending backoff immediately rather than
// waiting out the full delay.

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_MSG = /overwhelmed|UNAVAILABLE|503/i;

export interface RetryOptions {
  /** Additional attempts after the initial try. Default 4. */
  max?: number;
  /** Base backoff in ms. Delay = base * 2^attempt + jitter(0-200ms). */
  base?: number;
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  { max = 4, base = 400 }: RetryOptions = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    try {
      return await fn(signal);
    } catch (e) {
      lastErr = e;
      const err = e as {
        status?: number;
        response?: { status?: number };
        message?: unknown;
      };
      const status = err?.status ?? err?.response?.status;
      const message = String(err?.message ?? "");
      const transient =
        (status !== undefined && TRANSIENT_STATUS.has(status)) ||
        TRANSIENT_MSG.test(message);
      if (!transient || attempt === max) throw e;
      const delay = base * 2 ** attempt + Math.random() * 200;
      console.warn(
        `[retry] ${status ?? "?"} ${attempt + 1}/${max} in ${Math.round(delay)}ms`
      );
      await sleepUntilAborted(delay, signal);
    }
  }
  throw lastErr;
}

function sleepUntilAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
