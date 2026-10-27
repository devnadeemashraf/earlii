import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiStatusCard, ApiStatusFailed, ApiStatusSkeleton } from "@/components/api-status";
import { ApiStatusError } from "@/lib/api-status";
import { copy } from "@/lib/copy";

describe("ApiStatusCard", () => {
  it("shows a ready API", () => {
    render(<ApiStatusCard status={{ kind: "ok" }} />);
    const card = screen.getByRole("region", { name: copy.status.heading });
    expect(card).toHaveTextContent(copy.status.ok);
    expect(within(card).queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists each check of a degraded API with its state", () => {
    render(
      <ApiStatusCard
        status={{
          kind: "degraded",
          checks: [
            { name: "postgres", ok: false },
            { name: "river", ok: true },
          ],
        }}
      />,
    );
    expect(screen.getByText(copy.status.degraded)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      `postgres${copy.status.checkFail}`,
      `river${copy.status.checkOk}`,
    ]);
  });

  it("says so when a degraded API names no checks", () => {
    render(<ApiStatusCard status={{ kind: "degraded", checks: [] }} />);
    expect(screen.getByText(copy.status.noChecks)).toBeInTheDocument();
  });

  it("renders hostile check names as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const { container } = render(
      <ApiStatusCard status={{ kind: "degraded", checks: [{ name: hostile, ok: false }] }} />,
    );
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ApiStatusSkeleton", () => {
  it("is announced as a busy status, not a spinner", () => {
    render(<ApiStatusSkeleton />);
    const status = screen.getByRole("status", { name: copy.status.loading });
    expect(status).toHaveAttribute("aria-busy", "true");
  });
});

describe("ApiStatusFailed", () => {
  it("shows fixed copy for each failure kind, never the error's own message", () => {
    for (const failure of ["network", "timeout", "http", "format", "too-large"] as const) {
      const { unmount } = render(
        <ApiStatusFailed error={new ApiStatusError(failure)} onRetry={() => {}} retrying={false} />,
      );
      expect(screen.getByRole("alert")).toHaveTextContent(copy.failure[failure]);
      unmount();
    }
  });

  it("hides the details of an unexpected error", () => {
    render(
      <ApiStatusFailed
        error={new Error("ECONNREFUSED 10.0.0.5:5432")}
        onRetry={() => {}}
        retrying={false}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(copy.unexpected);
    expect(alert).not.toHaveTextContent("10.0.0.5");
  });

  it("retries on tap, and can't be tapped again while retrying", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ApiStatusFailed error={new ApiStatusError("network")} onRetry={onRetry} retrying={false} />,
    );
    screen.getByRole("button", { name: copy.retry }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <ApiStatusFailed error={new ApiStatusError("network")} onRetry={onRetry} retrying={true} />,
    );
    const busy = screen.getByRole("button", { name: copy.retrying });
    expect(busy).toBeDisabled();
    busy.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
