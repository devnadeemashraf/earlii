import { describe, expect, it } from "vitest";
import { ApiStatusError } from "@/lib/api-status";
import { createQueryClient, shouldRetry } from "@/lib/query-client";

describe("shouldRetry", () => {
  it("retries a transient failure once", () => {
    for (const failure of ["network", "timeout"] as const) {
      expect(shouldRetry(0, new ApiStatusError(failure)), failure).toBe(true);
      expect(shouldRetry(1, new ApiStatusError(failure)), failure).toBe(false);
    }
  });

  it("never retries a failure that would repeat (the same bad answer comes back)", () => {
    for (const failure of ["http", "format", "too-large"] as const) {
      expect(shouldRetry(0, new ApiStatusError(failure)), failure).toBe(false);
    }
  });

  it("retries an unknown error once", () => {
    expect(shouldRetry(0, new Error("boom"))).toBe(true);
    expect(shouldRetry(1, new Error("boom"))).toBe(false);
  });
});

describe("createQueryClient", () => {
  it("uses shouldRetry by default, and lets tests turn retries off", () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetry);
    expect(createQueryClient({ retry: false }).getDefaultOptions().queries?.retry).toBe(false);
  });
});
