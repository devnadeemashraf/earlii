import { createRouter, type RouterHistory } from "@tanstack/react-router";
import type { RouterContext } from "@/lib/router-context";
import { routeTree } from "@/routeTree.gen";

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    // Start loading on hover or touch, so most taps land on a warm cache (SPEC section 4, 100 ms
    // taps). Preloads always ask Query, which owns freshness.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Show the skeleton after 100 ms instead of the default 1 s, and keep it at least 300 ms so
    // it doesn't flicker. Both are a first guess: tune them on a real phone.
    defaultPendingMs: 100,
    defaultPendingMinMs: 300,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
