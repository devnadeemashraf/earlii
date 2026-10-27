import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { type ApiStatus, ApiStatusError } from "@/lib/api-status";
import { copy } from "@/lib/copy";

// index.html carries a static copy of ApiStatusSkeleton's layout (the inline first-paint
// skeleton). Change both together.

function Card(props: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className="flex min-h-36 flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground"
    />
  );
}

export function ApiStatusCard({ status }: { status: ApiStatus }) {
  return (
    <Card aria-labelledby="api-status-heading">
      <h2 id="api-status-heading" className="font-semibold text-lg">
        {copy.status.heading}
      </h2>
      {status.kind === "ok" ? (
        <p>{copy.status.ok}</p>
      ) : (
        <>
          <p>{copy.status.degraded}</p>
          {status.checks.length === 0 ? (
            <p className="text-muted-foreground">{copy.status.noChecks}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {status.checks.map((c) => (
                <li key={c.name} className="flex justify-between gap-4">
                  <span className="truncate">{c.name}</span>
                  <span className={c.ok ? "text-muted-foreground" : "font-medium text-destructive"}>
                    {c.ok ? copy.status.checkOk : copy.status.checkFail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

export function ApiStatusSkeleton() {
  return (
    // <section> with a status role: a live region screen readers announce while it loads.
    <Card role="status" aria-busy="true" aria-label={copy.status.loading}>
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </Card>
  );
}

export function ApiStatusFailed({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  // Fixed copy only: an unexpected error's message can carry hosts or stack details.
  const message = error instanceof ApiStatusError ? copy.failure[error.failure] : copy.unexpected;
  return (
    <Card role="alert">
      <h2 className="font-semibold text-lg">{copy.status.heading}</h2>
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-auto min-h-11 self-start rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
      >
        {retrying ? copy.retrying : copy.retry}
      </button>
    </Card>
  );
}
