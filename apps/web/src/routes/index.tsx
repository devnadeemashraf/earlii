import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ApiStatusCard, ApiStatusFailed, ApiStatusSkeleton } from "@/components/api-status";
import { apiStatusQuery } from "@/lib/api-status";

export const Route = createFileRoute("/")({
  // The loader warms the Query cache; the component reads the same cache entry, so navigating
  // back renders from cache instantly while Query refetches in the background.
  loader: ({ context }) => context.queryClient.ensureQueryData(apiStatusQuery(context.api)),
  pendingComponent: ApiStatusSkeleton,
  errorComponent: HomeError,
  component: Home,
});

function Home() {
  const { api } = Route.useRouteContext();
  const { data } = useSuspenseQuery(apiStatusQuery(api));
  return <ApiStatusCard status={data} />;
}

function HomeError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    setRetrying(true);
    // Re-runs the loader; the failed query has no data, so ensureQueryData fetches again.
    // A loader error lands in this component again; only the reload machinery itself can reject.
    router
      .invalidate()
      .catch((err: unknown) => console.error("retry failed", err))
      .finally(() => setRetrying(false));
  };
  return <ApiStatusFailed error={error} onRetry={retry} retrying={retrying} />;
}
