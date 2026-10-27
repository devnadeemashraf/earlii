// @vitest-environment node
import { describe, expect, it } from "vitest";
import { anySignal, anySignalFallback } from "@/lib/signals";

describe.each([
  ["anySignal", anySignal],
  ["anySignalFallback", anySignalFallback],
])("%s", (_name, combine) => {
  it("aborts when any input aborts, with that input's reason", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combine([a.signal, b.signal]);
    expect(combined.aborted).toBe(false);
    const reason = new Error("b went first");
    b.abort(reason);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe(reason);
    a.abort(new Error("too late"));
    expect(combined.reason).toBe(reason);
  });

  it("is aborted at once if an input already is", () => {
    const reason = new Error("already");
    const combined = combine([new AbortController().signal, AbortSignal.abort(reason)]);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe(reason);
  });

  it("never aborts with no inputs", () => {
    expect(combine([]).aborted).toBe(false);
  });
});
