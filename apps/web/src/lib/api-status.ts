// Asks the Go API whether it can serve us, through the generated Connect Health client (P0-05,
// ADR-0006). The parsed ApiStatus shape and the UI built on it are transport-agnostic.
import { Code, ConnectError, createClient, type Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { type CheckResponse, HealthService, Status } from "@earlii/api";
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

// The real body is under 100 bytes; anything near this cap is not our API. connect-web has no
// response size limit of its own, so the guarded fetch below enforces it, error bodies included.
export const MAX_BODY_BYTES = 4 * 1024;
export const MAX_CHECKS = 32;
// Names are identifiers our own code chooses ("postgres", "river"). Anything else, such as bidi
// overrides or zero-width characters that could make the page lie, is not our API.
const CHECK_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
// Well past the API's own 2 s readiness budget, well short of a user giving up.
export const TIMEOUT_MS = 5_000;

function isJson(contentType: string | null): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

// Turns a Check response into an ApiStatus. NOT_SERVING is content (the API is up but a
// dependency isn't), not an error. The decoded message is still untrusted input: it is checked
// before the UI renders any of it.
export function parseCheckResponse(res: CheckResponse): ApiStatus {
  if (res.checks.length > MAX_CHECKS) throw new ApiStatusError("format");
  const checks = res.checks.map(({ name, ok }) => {
    if (!CHECK_NAME.test(name)) throw new ApiStatusError("format");
    return { name, ok };
  });
  checks.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  switch (res.status) {
    case Status.SERVING:
      // "All systems go" over a failing check would be a lie.
      if (checks.some((c) => !c.ok)) throw new ApiStatusError("format");
      return { kind: "ok" };
    case Status.NOT_SERVING:
      return { kind: "degraded", checks };
    default:
      // UNSPECIFIED, or a value added after this build: never read as ok.
      throw new ApiStatusError("format");
  }
}

// Reads at most `max` bytes. A stalled body is cut off when `signal` aborts.
async function readCapped(
  res: Response,
  max: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) {
    await res.body?.cancel();
    throw new ApiStatusError("too-large");
  }
  if (!res.body) return new Uint8Array();

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
    return bytes;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// Wraps fetch with the guards connect-web doesn't have: no redirects (a captive portal's or SSO's
// page is not our answer), no HTTP cache, a capped body, and a 200 that must be JSON (an SPA
// fallback page is not our API). Failures are thrown as ApiStatusError, which Connect keeps as the
// cause of the ConnectError it raises.
export function createGuardedFetch(base?: typeof fetch): typeof fetch {
  return async (input, init) => {
    // Looked up per call, so a test's stubbed global fetch is used.
    const doFetch = base ?? globalThis.fetch;
    const signal = init?.signal ?? new AbortController().signal;
    let res: Response;
    try {
      res = await doFetch(input, { ...init, redirect: "error", cache: "no-store" });
    } catch (err) {
      // Our own abort is Connect's to report as canceled; anything else never reached the API.
      if (signal.aborted) throw err;
      throw new ApiStatusError("network", { cause: err });
    }
    if (res.status === 200 && !isJson(res.headers.get("content-type"))) {
      await res.body?.cancel();
      throw new ApiStatusError("format");
    }
    const body = await readCapped(res, MAX_BODY_BYTES, signal);
    // The body is now decoded bytes in memory: the original length and encoding no longer
    // describe it.
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(body.byteLength > 0 ? body : null, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}

// The app's Connect transport: same origin (the dev proxy, later the same host), JSON so calls can
// be read in devtools, and GET for side-effect-free methods such as Check.
export function createApiTransport(opts: { fetch?: typeof fetch } = {}): Transport {
  return createConnectTransport({
    baseUrl: "/",
    useHttpGet: true,
    fetch: createGuardedFetch(opts.fetch),
  });
}

function failureOf(err: unknown): ApiStatusFailure {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (e instanceof ApiStatusError) return e.failure;
  }
  if (err instanceof ConnectError) {
    // A gateway's 502, 503 or 504 (the dev proxy when the API is down) arrives as Unavailable:
    // transient, so it's retried and gets "can't reach" copy.
    if (err.code === Code.Unavailable) return "network";
    if (err.code === Code.DeadlineExceeded) return "timeout";
  }
  return "http";
}

let transport: Transport | undefined;
function defaultTransport(): Transport {
  transport ??= createApiTransport();
  return transport;
}

export async function fetchApiStatus(opts: {
  signal: AbortSignal;
  transport?: Transport;
  timeoutMs?: number;
}): Promise<ApiStatus> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
  const signal = anySignal([opts.signal, timeout]);
  const client = createClient(HealthService, opts.transport ?? defaultTransport());

  try {
    // timeoutMs 0: our own timeout signal covers the body too, which Connect's header doesn't.
    const res = await client.check({}, { signal, timeoutMs: 0 });
    return parseCheckResponse(res);
  } catch (err) {
    // The caller's cancellation (Query unmounting or refetching) is theirs to handle.
    if (opts.signal.aborted) throw opts.signal.reason;
    if (timeout.aborted) throw new ApiStatusError("timeout", { cause: err });
    if (err instanceof ApiStatusError) throw err;
    throw new ApiStatusError(failureOf(err), { cause: err });
  }
}

export const connectStatusApi: StatusApi = {
  status: (signal) => fetchApiStatus({ signal }),
};

export function apiStatusQuery(api: StatusApi) {
  return queryOptions({
    queryKey: ["api-status"],
    queryFn: ({ signal }) => api.status(signal),
    staleTime: 10_000,
  });
}
