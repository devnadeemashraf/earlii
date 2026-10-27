import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app";
import { type ApiStatus, ApiStatusError, type StatusApi } from "@/lib/api-status";
import { copy } from "@/lib/copy";
import { createQueryClient } from "@/lib/query-client";
import { mountApp } from "@/mount";
import { createAppRouter } from "@/router";
// "/" is the project root in Vite, so this is apps/web/index.html, read as a string.
import indexHtml from "/index.html?raw";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The real route tree with a fake API in the router context: this mocks the loader's only
// dependency, so the loader, pending, error and component wiring are all under test.
function renderApp(api: StatusApi, path = "/", container?: HTMLElement) {
  const queryClient = createQueryClient({ retry: false });
  const router = createAppRouter(
    { queryClient, api },
    createMemoryHistory({ initialEntries: [path] }),
  );
  const view = render(
    <App router={router} queryClient={queryClient} />,
    container && { container },
  );
  return { ...view, router };
}

describe("home route", () => {
  it("shows a skeleton while the loader runs, then the content", async () => {
    const pending = deferred<ApiStatus>();
    const api = { status: vi.fn(() => pending.promise) };
    renderApp(api);

    expect(await screen.findByRole("status", { name: copy.status.loading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: copy.appName })).toBeInTheDocument();

    await act(async () => pending.resolve({ kind: "ok" }));
    expect(await screen.findByText(copy.status.ok)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: copy.status.loading })).not.toBeInTheDocument();
    expect(api.status).toHaveBeenCalledTimes(1);
  });

  it("passes an abort signal to the API", async () => {
    const api = { status: vi.fn(async (_signal: AbortSignal) => ({ kind: "ok" }) as const) };
    renderApp(api);
    await screen.findByText(copy.status.ok);
    expect(api.status.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it("shows fixed copy when the API fails, and recovers on retry", async () => {
    const api = {
      status: vi
        .fn<StatusApi["status"]>()
        .mockRejectedValueOnce(new ApiStatusError("network"))
        .mockResolvedValueOnce({ kind: "degraded", checks: [{ name: "postgres", ok: false }] }),
    };
    renderApp(api);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.failure.network);

    await act(async () => screen.getByRole("button", { name: copy.retry }).click());
    expect(await screen.findByText(copy.status.degraded)).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it("keeps the details of an unexpected loader error off the page", async () => {
    const api = { status: vi.fn(async () => Promise.reject(new Error("dial tcp 10.0.0.5"))) };
    renderApp(api);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.unexpected);
    expect(document.body).not.toHaveTextContent("10.0.0.5");
  });
});

describe("unknown routes", () => {
  it("render a not-found page with a way home, inside the app shell", async () => {
    const api = { status: vi.fn(async () => ({ kind: "ok" }) as const) };
    renderApp(api, "/no/such/page");

    expect(await screen.findByRole("heading", { name: copy.notFound.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: copy.appName })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.notFound.home })).toHaveAttribute("href", "/");
    expect(api.status).not.toHaveBeenCalled();
  });

  it("never echo the requested path as markup", async () => {
    const api = { status: vi.fn(async () => ({ kind: "ok" }) as const) };
    const { container } = renderApp(api, "/%3Cimg%20src=x%20onerror=alert(1)%3E");
    await screen.findByRole("heading", { name: copy.notFound.title });
    expect(container.querySelector("img")).toBeNull();
    expect(container).not.toHaveTextContent("onerror");
  });
});

describe("first paint", () => {
  // index.html ships a static skeleton inside #root so the page is never blank while JS loads.
  // A bare RouterProvider commits an empty tree before its first match exists, wiping that
  // skeleton (this test caught it). mountApp loads the first route before React mounts.
  it("keeps the inline skeleton until the first route is ready, so #root never empties", async () => {
    const inline = /<div id="root">([\s\S]*)<\/div>\s*<script/.exec(indexHtml)?.[1];
    expect(inline?.trim()).toBeTruthy();

    const root = document.createElement("div");
    root.innerHTML = inline ?? "";
    document.body.append(root);

    let emptied = false;
    const observer = new MutationObserver(() => {
      if (root.childElementCount === 0) emptied = true;
    });
    observer.observe(root, { childList: true, subtree: true });

    const pending = deferred<ApiStatus>();
    const queryClient = createQueryClient({ retry: false });
    const router = createAppRouter(
      { queryClient, api: { status: () => pending.promise } },
      createMemoryHistory({ initialEntries: ["/"] }),
    );
    const mounting = mountApp(root, { router, queryClient });
    await act(async () => {});
    expect(root.querySelector(".boot")).not.toBeNull();

    await act(async () => pending.resolve({ kind: "ok" }));
    const reactRoot = await mounting;
    expect(await screen.findByText(copy.status.ok)).toBeInTheDocument();
    expect(root.querySelector(".boot")).toBeNull();

    observer.disconnect();
    expect(emptied).toBe(false);
    act(() => reactRoot.unmount());
    root.remove();
  });

  it("still mounts if the first load throws, so the inline skeleton never sticks forever", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="boot"></div>';
    document.body.append(root);

    const queryClient = createQueryClient({ retry: false });
    const router = createAppRouter(
      { queryClient, api: { status: async () => ({ kind: "ok" }) } },
      createMemoryHistory({ initialEntries: ["/"] }),
    );
    // e.g. a code-split chunk that 404s after a deploy. RouterProvider loads again on mount.
    vi.spyOn(router, "load").mockRejectedValueOnce(new Error("chunk failed"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const reactRoot = await act(async () => mountApp(root, { router, queryClient }));
    expect(await screen.findByText(copy.status.ok)).toBeInTheDocument();
    expect(logged).toHaveBeenCalled();

    act(() => reactRoot.unmount());
    root.remove();
  });
});
