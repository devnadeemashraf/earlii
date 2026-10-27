import type { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "@/app";
import type { createAppRouter } from "@/router";

// Loads the first route, then mounts React. A bare RouterProvider commits an empty tree before
// its first match exists, which would wipe index.html's inline skeleton and flash a blank page.
// Loading first keeps that skeleton up until React's first commit already has the route (the
// loaded skeleton, content or error), and RouterProvider then reuses the load instead of
// repeating it. Loader errors don't reject here: the router stores them for errorComponent.
export async function mountApp(
  container: HTMLElement,
  deps: { router: ReturnType<typeof createAppRouter>; queryClient: QueryClient },
): Promise<Root> {
  try {
    await deps.router.load();
  } catch (err) {
    // load() itself can still throw (a route chunk that fails to download, a blocked redirect).
    // Mount anyway: RouterProvider loads again and shows the error states, where a stuck inline
    // skeleton would show nothing forever.
    console.error("initial route load failed", err);
  }
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App router={deps.router} queryClient={deps.queryClient} />
    </StrictMode>,
  );
  return root;
}
