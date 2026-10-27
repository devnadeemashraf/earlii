import type { QueryClient } from "@tanstack/react-query";
import type { StatusApi } from "@/lib/api-status";

// What every route's loader receives. The API is injected rather than imported, so tests hand
// the real route tree a fake (ROADMAP P0-03: "a route test with a mocked loader").
export interface RouterContext {
  queryClient: QueryClient;
  api: StatusApi;
}
