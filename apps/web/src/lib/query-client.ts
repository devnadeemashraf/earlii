import { QueryClient } from "@tanstack/react-query";
import { ApiStatusError } from "@/lib/api-status";

// One quick retry covers a blip. The default three, with backoff, would keep a skeleton up for
// seconds before the error state shows. Failures that would only repeat (an error status, a body
// that isn't our API) aren't retried at all: each retry is another hit on the readiness probe.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiStatusError) {
    return error.failure === "network" || error.failure === "timeout";
  }
  return true;
}

// The app's Query defaults, in one place. Tests pass `retry: false` so sad paths fail at once.
export function createQueryClient(overrides: { retry?: false } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: overrides.retry ?? shouldRetry,
      },
    },
  });
}
