import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { copy } from "@/lib/copy";
import type { RouterContext } from "@/lib/router-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

// index.html's inline skeleton mirrors this shell. Change both together.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="font-black text-4xl tracking-tight">{copy.appName}</h1>
        <p className="text-muted-foreground">{copy.tagline}</p>
      </header>
      <main className="flex flex-col gap-4">{children}</main>
    </div>
  );
}

function RootLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

// The path is never echoed: fixed copy only.
function NotFound() {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold text-lg">{copy.notFound.title}</h2>
      <p className="text-muted-foreground">{copy.notFound.body}</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center self-start font-medium underline underline-offset-4"
      >
        {copy.notFound.home}
      </Link>
    </section>
  );
}

// Last line of defence for errors no route handled. The layout itself may be what failed, so it
// renders its own shell, and never the error's message.
function RootError() {
  return (
    <Shell>
      <p role="alert">{copy.unexpected}</p>
    </Shell>
  );
}
