import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "./retry";

function httpErr(status?: number, message?: string) {
  const e = new Error(message ?? `http ${status ?? "?"}`) as Error & {
    status?: number;
  };
  if (status !== undefined) e.status = status;
  return e;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withRetry — happy path", () => {
  it("resolves on first try without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    const ctrl = new AbortController();
    await expect(withRetry(fn, ctrl.signal, { base: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("recovers after one transient 503", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) throw httpErr(503);
      return "ok";
    };
    await withRetry(fn, new AbortController().signal, { base: 1 });
    expect(calls).toBe(2);
  });

  it("forwards the signal into fn so downstream can listen", async () => {
    const ctrl = new AbortController();
    const fn = vi.fn(async (sig: AbortSignal) => {
      expect(sig).toBe(ctrl.signal);
      return "ok";
    });
    await withRetry(fn, ctrl.signal, { base: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withRetry — transient classification", () => {
  it("retries each of 429/500/502/503/504", async () => {
    for (const status of [429, 500, 502, 503, 504]) {
      let calls = 0;
      const fn = async () => {
        calls++;
        if (calls === 1) throw httpErr(status);
        return "ok";
      };
      await withRetry(fn, new AbortController().signal, { base: 1 });
      expect(calls, `status ${status}`).toBe(2);
    }
  });

  it("treats UNAVAILABLE / overwhelmed messages as transient", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) throw new Error("model UNAVAILABLE right now");
      if (calls === 2) throw new Error("server overwhelmed");
      return "ok";
    };
    await withRetry(fn, new AbortController().signal, { base: 1, max: 3 });
    expect(calls).toBe(3);
  });

  it("does NOT retry on non-transient 400/401/404", async () => {
    for (const status of [400, 401, 404]) {
      let calls = 0;
      const fn = async () => {
        calls++;
        throw httpErr(status);
      };
      await expect(
        withRetry(fn, new AbortController().signal, { base: 1 })
      ).rejects.toThrow();
      expect(calls, `status ${status}`).toBe(1);
    }
  });

  it("throws after max retries on persistent 503", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw httpErr(503);
    };
    await expect(
      withRetry(fn, new AbortController().signal, { base: 1, max: 3 })
    ).rejects.toThrow();
    expect(calls).toBe(4); // initial + 3 retries
  });

  it("reads status from response.status as fallback", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        const e = new Error("nested") as Error & {
          response: { status: number };
        };
        e.response = { status: 503 };
        throw e;
      }
      return "ok";
    };
    await withRetry(fn, new AbortController().signal, { base: 1 });
    expect(calls).toBe(2);
  });
});

describe("withRetry — abort behavior", () => {
  it("throws AbortError immediately if signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const fn = vi.fn(async () => "ok");
    await expect(withRetry(fn, ctrl.signal, { base: 1 })).rejects.toThrow(
      /abort/i
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("aborts during backoff sleep and stops retrying", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        setTimeout(() => ctrl.abort(), 5);
        throw httpErr(503);
      }
      throw new Error("unreachable");
    };
    await expect(
      withRetry(fn, ctrl.signal, { base: 200, max: 3 })
    ).rejects.toThrow(/abort/i);
    expect(calls).toBe(1);
  });
});
