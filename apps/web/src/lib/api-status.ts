// Reads the Go API's readiness probe. P0-05 replaces the fetch with the generated Connect Health
// client; the parsed ApiStatus shape and the UI built on it stay.
import { queryOptions } from "@tanstack/react-query";
import { anySignal } from "@/lib/signals";

export type ApiStatus =
  | { kind: "ok" }
  | { kind: "degraded"; checks: ReadonlyArray<{ name: string; ok: boolean }> };

export type ApiStatusFailure = "network" | "timeout" | "http" | "format" | "too-large";

// Carries a failure kind, never server text: the UI maps kinds to fixed copy, so nothing the
// server (or a proxy in between) sends ever reaches the page as an error message.
export class ApiStatusError extends Error {
  readonly failure: ApiStatusFailure;

  constructor(failure: ApiStatusFailure, options?: ErrorOptions) {
    super(`api status: ${failure}`, options);
    this.name = "ApiStatusError";
    this.failure = failure;
  }
}

// What the router context hands to loaders, so tests can swap in a fake.
export interface StatusApi {
  status(signal: AbortSignal): Promise<ApiStatus>;
}

export const READYZ_PATH = "/readyz";
// The real body is under 100 bytes; anything near this cap is not our API.
export const MAX_BODY_BYTES = 4 * 1024;
export const MAX_CHECKS = 32;
// Names are identifiers our own code chooses ("postgres", "river"). Anything else, such as bidi
// overrides or zero-width characters that could make the page lie, is not our API.
const CHECK_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
// Well past the API's own 2 s readiness budget, well short of a user giving up.
export const TIMEOUT_MS = 5_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isJson(contentType: string | null): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

function parseChecks(raw: unknown): Array<{ name: string; ok: boolean }> {
  if (raw === undefined) return [];
  if (!isRecord(raw)) throw new ApiStatusError("format");
  const entries = Object.entries(raw);
  if (entries.length > MAX_CHECKS) throw new ApiStatusError("format");
  const checks = entries.map(([name, value]) => {
    if (!CHECK_NAME.test(name) || (value !== "ok" && value !== "fail")) {
      throw new ApiStatusError("format");
    }
    return { name, ok: value === "ok" };
  });
  return checks.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// Turns a /readyz response into an ApiStatus. A 503 with a well-formed body is content (the API
// is up but a dependency isn't), not an error.
export function parseReadyz(
  httpStatus: number,
  contentType: string | null,
  body: string,
): ApiStatus {
  if (httpStatus !== 200 && httpStatus !== 503) throw new ApiStatusError("http");
  if (!isJson(contentType)) throw new ApiStatusError("format");

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (err) {
    throw new ApiStatusError("format", { cause: err });
  }
  if (!isRecord(data)) throw new ApiStatusError("format");

  if (httpStatus === 200 && data.status === "ok") return { kind: "ok" };
  if (httpStatus === 503 && data.status === "unavailable") {
    return { kind: "degraded", checks: parseChecks(data.checks) };
  }
  throw new ApiStatusError("format");
}

// Reads at most `max` bytes. A stalled body is cut off when `signal` aborts.
async function readCapped(res: Response, max: number, signal: AbortSignal): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) {
    await res.body?.cancel();
    throw new ApiStatusError("too-large");
  }
  if (!res.body) return "";

  // An abort listener never fires for a signal that is already aborted (the response arrived
  // after the timeout, from a fetch that ignored the signal), so check before waiting on reads.
  signal.throwIfAborted();
  const reader = res.body.getReader();
  // Cancelling the reader settles a pending read(), so a stalled stream can't hang this loop
  // even when the fetch implementation doesn't tie the body to the signal.
  const onAbort = () => void reader.cancel(signal.reason).catch(() => {});
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        throw new ApiStatusError("too-large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (err) {
      throw new ApiStatusError("format", { cause: err });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchApiStatus(opts: {
  signal: AbortSignal;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<ApiStatus> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
  const signal = anySignal([opts.signal, timeout]);

  try {
    const res = await doFetch(READYZ_PATH, {
      signal,
      headers: { accept: "application/json" },
      cache: "no-store",
      // A captive portal's or SSO's redirect is not our probe: fail instead of parsing it.
      redirect: "error",
    });
    // Status first: an error page's body is never needed, so don't download it. A gateway's
    // 502 or 504 (the dev proxy, later a load balancer) means the API couldn't be reached at all:
    // that's transient, so it's 'network', which is retried and gets "can't reach" copy.
    if (res.status !== 200 && res.status !== 503) {
      await res.body?.cancel();
      throw new ApiStatusError(res.status === 502 || res.status === 504 ? "network" : "http");
    }
    const body = await readCapped(res, MAX_BODY_BYTES, signal);
    return parseReadyz(res.status, res.headers.get("content-type"), body);
  } catch (err) {
    // The caller's cancellation (Query unmounting or refetching) is theirs to handle.
    if (opts.signal.aborted) throw opts.signal.reason;
    if (timeout.aborted) throw new ApiStatusError("timeout", { cause: err });
    if (err instanceof ApiStatusError) throw err;
    throw new ApiStatusError("network", { cause: err });
  }
}

export const httpStatusApi: StatusApi = {
  status: (signal) => fetchApiStatus({ signal }),
};

export function apiStatusQuery(api: StatusApi) {
  return queryOptions({
    queryKey: ["api-status"],
    queryFn: ({ signal }) => api.status(signal),
    staleTime: 10_000,
  });
}
