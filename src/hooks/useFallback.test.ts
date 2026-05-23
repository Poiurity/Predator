// Tests for useFallback (spec §11 / §12 validation gate).
//
// Covers:
//   - timeout-2500 path → announce + replay
//   - non-AbortError throw → announce + replay
//   - AbortError → silent return, no fallback
//   - already in fallbackMode → straight replay, no live attempt
//   - sequential index advancement on repeated replays

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runUtterance, announce, resetFallback } from "./useFallback";
import { useLS } from "../store";

// ─── Setup: stub browser globals ─────────────────────────────────────────────
// The vitest node environment has no browser globals. We stub the three we need:
// speechSynthesis, SpeechSynthesisUtterance, document.getElementById.

const mockSpeak = vi.fn();
const mockCancel = vi.fn();

// Minimal banner DOM stand-in.
const bannerEl = {
  hidden: true as boolean,
  style: { display: "" as string },
};

// Stub globals BEFORE any module under test is imported.
vi.stubGlobal("speechSynthesis", { speak: mockSpeak, cancel: mockCancel });
vi.stubGlobal(
  "SpeechSynthesisUtterance",
  class {
    lang = "";
    constructor(public text: string) {}
  }
);
vi.stubGlobal("document", {
  getElementById: (id: string) =>
    id === "fallback-banner" ? (bannerEl as unknown as HTMLElement) : null,
});

beforeEach(() => {
  vi.useFakeTimers();
  mockSpeak.mockClear();
  mockCancel.mockClear();
  bannerEl.hidden = true;
  bannerEl.style.display = "";
  // Reset store to a clean state before each test.
  useLS.getState().setFallbackMode(false);
  useLS.getState().resetScriptIndex();
  useLS.getState().clearScene();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A live callback that resolves after `ms` milliseconds. */
function slowLive(ms: number) {
  return (_text: string, _sig: AbortSignal) =>
    new Promise<void>((res) => setTimeout(res, ms));
}

/** A live callback that never resolves (infinite hang). */
function hangingLive(): (_text: string, _sig: AbortSignal) => Promise<void> {
  return (_text, _sig) => new Promise<void>(() => {/* intentional hang */});
}

/** A live callback that rejects immediately with a given error. */
function failingLive(err: Error) {
  return (_text: string, _sig: AbortSignal): Promise<void> =>
    Promise.reject(err);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("runUtterance — timeout triggers fallback", () => {
  it("calls announce and replay after 2500ms with no live chunk", async () => {
    const promise = runUtterance(
      "test utterance",
      hangingLive(),
      new AbortController().signal
    );

    // Advance past the 2500ms timeout.
    await vi.advanceTimersByTimeAsync(2600);
    await promise;

    // TTS should have fired.
    expect(mockSpeak).toHaveBeenCalledOnce();
    // Banner should be visible.
    expect(bannerEl.hidden).toBe(false);
    // Store should be in fallback mode.
    expect(useLS.getState().fallbackMode).toBe(true);
  });

  it("does NOT trigger fallback if live resolves within 2500ms", async () => {
    const promise = runUtterance(
      "fast utterance",
      slowLive(100),
      new AbortController().signal
    );

    await vi.advanceTimersByTimeAsync(2600);
    await promise;

    expect(mockSpeak).not.toHaveBeenCalled();
    expect(bannerEl.hidden).toBe(true);
    expect(useLS.getState().fallbackMode).toBe(false);
  });
});

describe("runUtterance — non-AbortError throw triggers fallback", () => {
  it("triggers fallback on a generic Error throw from live", async () => {
    const networkErr = new Error("network error");
    await runUtterance(
      "test",
      failingLive(networkErr),
      new AbortController().signal
    );

    expect(mockSpeak).toHaveBeenCalledOnce();
    expect(bannerEl.hidden).toBe(false);
    expect(useLS.getState().fallbackMode).toBe(true);
  });

  it("triggers fallback on a 503 error", async () => {
    const err503 = Object.assign(new Error("503"), { status: 503 });
    await runUtterance(
      "test",
      failingLive(err503),
      new AbortController().signal
    );

    expect(mockSpeak).toHaveBeenCalledOnce();
    expect(useLS.getState().fallbackMode).toBe(true);
  });
});

describe("runUtterance — AbortError does NOT trigger fallback", () => {
  it("returns silently on AbortError without announcing", async () => {
    const abortErr = Object.assign(new Error("AbortError"), {
      name: "AbortError",
    });
    await runUtterance(
      "test",
      failingLive(abortErr),
      new AbortController().signal
    );

    expect(mockSpeak).not.toHaveBeenCalled();
    expect(bannerEl.hidden).toBe(true);
    expect(useLS.getState().fallbackMode).toBe(false);
  });
});

describe("runUtterance — fallbackMode already set → straight replay, no live", () => {
  it("skips the live call entirely when already in fallback mode", async () => {
    useLS.getState().setFallbackMode(true);

    const liveFn = vi.fn(async () => {});
    await runUtterance("test", liveFn, new AbortController().signal);

    // live must never be called.
    expect(liveFn).not.toHaveBeenCalled();
    // No additional announce (we're already in fallback).
    expect(mockSpeak).not.toHaveBeenCalled();
  });
});

describe("runUtterance — sequential index advancement", () => {
  it("advances the script index on each replay", async () => {
    const err = new Error("fail");

    expect(useLS.getState().scriptIndex).toBe(0);

    await runUtterance("u1", failingLive(err), new AbortController().signal);
    expect(useLS.getState().scriptIndex).toBe(1);

    await runUtterance("u2", failingLive(err), new AbortController().signal);
    expect(useLS.getState().scriptIndex).toBe(2);
  });

  it("clamps at rehearsed.length - 1 and does not throw", async () => {
    // Drive fallbackMode so subsequent runUtterance calls replay directly.
    useLS.getState().setFallbackMode(true);
    // Push scriptIndex well past the end of the rehearsed array.
    for (let i = 0; i < 20; i++) {
      useLS.getState().nextScriptIndex();
    }
    // Should not throw or go out of bounds.
    await expect(
      runUtterance("extra", (_t, _s) => Promise.resolve(), new AbortController().signal)
    ).resolves.toBeUndefined();
  });
});

describe("announce", () => {
  it("shows banner and fires TTS", () => {
    announce();
    expect(mockSpeak).toHaveBeenCalledOnce();
    expect(bannerEl.hidden).toBe(false);
  });

  it("does not throw if speechSynthesis.speak throws", () => {
    mockSpeak.mockImplementationOnce(() => {
      throw new Error("TTS blocked by browser");
    });
    expect(() => announce()).not.toThrow();
    // Banner should still appear despite TTS failure.
    expect(bannerEl.hidden).toBe(false);
  });
});

describe("resetFallback", () => {
  it("clears fallbackMode, resets scriptIndex, hides banner", async () => {
    // Get into fallback first.
    const err = new Error("fail");
    await runUtterance("test", failingLive(err), new AbortController().signal);
    expect(useLS.getState().fallbackMode).toBe(true);
    expect(bannerEl.hidden).toBe(false);

    resetFallback();

    expect(useLS.getState().fallbackMode).toBe(false);
    expect(useLS.getState().scriptIndex).toBe(0);
    expect(bannerEl.hidden).toBe(true);
  });
});
