import { expect, test } from "vitest";
import { formatRole } from "@/lib/format-role";
import { sample } from "@/main";

test("aliases resolve in tests, including nested alias imports", () => {
  expect(formatRole("SSE", "Pune")).toBe("SSE · Pune");
  expect(sample).toBe("SDE-2 · Bengaluru (12 min ago)");
});
