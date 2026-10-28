// @vitest-environment node
// The adapter is plain logic over fetch and Connect, so it runs in Node: jsdom's AbortSignal isn't
// accepted by Node's fetch, and nothing here touches the DOM.
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { CheckResponseSchema, HealthService, Status } from "@earlii/api";
import { describe, expect, it } from "vitest";
import {
  ApiStatusError,
  createApiTransport,
  fetchApiStatus,
  MAX_BODY_BYTES,
  MAX_CHECKS,
  parseCheckResponse,
} from "@/lib/api-status";

const json = "application/json";
const signal = () => new AbortController().signal;

function failureOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof ApiStatusError) return err.failure;
    throw err;
  }
  throw new Error("expected an ApiStatusError");
}

async function rejectionOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiStatusError) return err.failure;
    throw err;
  }
  throw new Error("expected an ApiStatusError");
}

type Checks = Array<{ name: string; ok: boolean }>;

function response(status: Status, checks: Checks = []) {
  return create(CheckResponseSchema, { status, checks });
}

// A mock transport: the generated client talks to an in-memory HealthService, no HTTP at all.
function serving(res: ReturnType<typeof response> | (() => never)) {
  return createRouterTransport(({ service }) => {
    service(HealthService, { check: () => (typeof res === "function" ? res() : res) });
  });
}

// A real Connect transport over a fake fetch, for what happens on the wire.
function overFetch(fetchFn: typeof fetch) {
  return createApiTransport({ fetch: fetchFn });
}

function respond(body: BodyInit | null, init: ResponseInit = {}): typeof fetch {
  return async () =>
    new Response(body, { status: 200, headers: { "content-type": json }, ...init });
}

const hang: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("parseCheckResponse", () => {
  it("reads SERVING as ok", () => {
    expect(parseCheckResponse(response(Status.SERVING, [{ name: "postgres", ok: true }]))).toEqual({
      kind: "ok",
    });
  });

  it("reads NOT_SERVING as degraded content, checks sorted by name", () => {
    const res = response(Status.NOT_SERVING, [
      { name: "river", ok: true },
      { name: "postgres", ok: false },
    ]);
    expect(parseCheckResponse(res)).toEqual({
      kind: "degraded",
      checks: [
        { name: "postgres", ok: false },
        { name: "river", ok: true },
      ],
    });
  });

  it("reads NOT_SERVING without checks as degraded with none listed", () => {
    expect(parseCheckResponse(response(Status.NOT_SERVING))).toEqual({
      kind: "degraded",
      checks: [],
    });
  });

  it("never reads UNSPECIFIED or an unknown enum value as ok", () => {
    expect(failureOf(() => parseCheckResponse(response(Status.UNSPECIFIED)))).toBe("format");
    expect(failureOf(() => parseCheckResponse(response(99 as Status)))).toBe("format");
  });

  it("rejects SERVING alongside a failing check: it would show 'all good' over a failure", () => {
    const res = response(Status.SERVING, [{ name: "postgres", ok: false }]);
    expect(failureOf(() => parseCheckResponse(res))).toBe("format");
  });

  it("rejects more checks than the cap, and over-long check names", () => {
    const many = Array.from({ length: MAX_CHECKS + 1 }, (_, i) => ({ name: `c${i}`, ok: true }));
    expect(failureOf(() => parseCheckResponse(response(Status.NOT_SERVING, many)))).toBe("format");
    const long = [{ name: "x".repeat(65), ok: true }];
    expect(failureOf(() => parseCheckResponse(response(Status.NOT_SERVING, long)))).toBe("format");
  });

  it("accepts check names made of letters, digits, '.', '_' and '-'", () => {
    const res = response(Status.NOT_SERVING, [{ name: "river_v0.50-queue", ok: true }]);
    expect(parseCheckResponse(res)).toEqual({
      kind: "degraded",
      checks: [{ name: "river_v0.50-queue", ok: true }],
    });
  });

  it("rejects check names that could spoof or inject: markup, bidi overrides, zero-width, empty", () => {
    for (const name of ["<img src=x>", "db‮liam", "db​", "", "a b", "\u0000"]) {
      const res = response(Status.NOT_SERVING, [{ name, ok: true }]);
      expect(
        failureOf(() => parseCheckResponse(res)),
        JSON.stringify(name),
      ).toBe("format");
    }
  });
});

describe("fetchApiStatus over a mock transport", () => {
  it("calls Health through the generated client", async () => {
    const transport = serving(response(Status.SERVING, [{ name: "postgres", ok: true }]));
    await expect(fetchApiStatus({ signal: signal(), transport })).resolves.toEqual({ kind: "ok" });
  });

  it("validates what the server sent: 5000 checks are 'format', not a 5000-row card", async () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ name: `c${i}`, ok: false }));
    const transport = serving(response(Status.NOT_SERVING, many));
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), transport }))).toBe("format");
  });

  it("maps a server error to 'http' and never keeps the server's message", async () => {
    const transport = serving(() => {
      throw new ConnectError("dial postgres://admin:hunter2@10.0.0.5", Code.Internal);
    });
    try {
      await fetchApiStatus({ signal: signal(), transport });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiStatusError);
      expect((err as ApiStatusError).failure).toBe("http");
      expect((err as Error).message).not.toContain("hunter2");
    }
  });

  it("maps Unavailable to 'network' and DeadlineExceeded to 'timeout'", async () => {
    for (const [code, want] of [
      [Code.Unavailable, "network"],
      [Code.DeadlineExceeded, "timeout"],
    ] as const) {
      const transport = serving(() => {
        throw new ConnectError("x", code);
      });
      expect(await rejectionOf(fetchApiStatus({ signal: signal(), transport })), want).toBe(want);
    }
  });
});

describe("fetchApiStatus on the wire", () => {
  it("calls Check with a Connect GET to the same origin, refusing redirects and caches", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchFn: typeof fetch = async (input, i) => {
      url = String(input);
      init = i;
      return new Response('{"status":"STATUS_SERVING"}', { headers: { "content-type": json } });
    };
    await expect(
      fetchApiStatus({ signal: signal(), transport: overFetch(fetchFn) }),
    ).resolves.toEqual({ kind: "ok" });

    const u = new URL(url, "http://origin.test");
    expect(u.pathname).toBe("/earlii.v1.HealthService/Check");
    expect(u.searchParams.get("connect")).toBe("v1");
    expect(u.searchParams.get("encoding")).toBe("json");
    expect(init?.method).toBe("GET");
    // A captive portal or SSO bounce must not be followed and parsed as our answer.
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
  });

  it("reads a gateway's 502 or 504 (the dev proxy when the API is down) as 'network'", async () => {
    for (const status of [502, 504]) {
      const fetchFn = respond("Bad Gateway", { status, headers: { "content-type": "text/plain" } });
      expect(
        await rejectionOf(fetchApiStatus({ signal: signal(), transport: overFetch(fetchFn) })),
        `${status}`,
      ).toBe("network");
    }
  });

  it("maps a network failure to 'network'", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(
      await rejectionOf(fetchApiStatus({ signal: signal(), transport: overFetch(fetchFn) })),
    ).toBe("network");
  });

  it("rejects an HTML page served with 200, so an SPA fallback never reads as 'API ok'", async () => {
    const fetchFn = respond("<!doctype html>", { headers: { "content-type": "text/html" } });
    expect(
      await rejectionOf(fetchApiStatus({ signal: signal(), transport: overFetch(fetchFn) })),
    ).toBe("format");
  });

  it("rejects a body that isn't the message: wrong JSON shape or invalid UTF-8", async () => {
    for (const body of ['{"status":', "[]", new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])]) {
      const failure = await rejectionOf(
        fetchApiStatus({ signal: signal(), transport: overFetch(respond(body)) }),
      );
      expect(["format", "http"], String(body)).toContain(failure);
    }
  });

  it("gives up at the timeout when the server never answers", async () => {
    expect(
      await rejectionOf(
        fetchApiStatus({ signal: signal(), transport: overFetch(hang), timeoutMs: 5 }),
      ),
    ).toBe("timeout");
  });

  it("gives up at the timeout when the body stalls after the headers", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":'));
      },
    });
    expect(
      await rejectionOf(
        fetchApiStatus({ signal: signal(), transport: overFetch(respond(stalled)), timeoutMs: 5 }),
      ),
    ).toBe("timeout");
  });

  it("still times out on browsers without AbortSignal.any (Safari before 17.4, Chrome before 116)", async () => {
    const native = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
    try {
      expect(
        await rejectionOf(
          fetchApiStatus({ signal: signal(), transport: overFetch(hang), timeoutMs: 5 }),
        ),
      ).toBe("timeout");
    } finally {
      if (native) Object.defineProperty(AbortSignal, "any", native);
    }
  });

  it("passes a caller's cancellation through untouched (TanStack Query cancels this way)", async () => {
    const ctrl = new AbortController();
    const reason = new DOMException("cancelled", "AbortError");
    const p = fetchApiStatus({ signal: ctrl.signal, transport: overFetch(hang) });
    ctrl.abort(reason);
    await expect(p).rejects.toBe(reason);
  });

  it("rejects a declared body over the cap without reading it", async () => {
    let pulled = false;
    // highWaterMark 0: the stream doesn't pre-fill its queue, so pull() runs only on a real read.
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const fetchFn = respond(body, {
      headers: { "content-type": json, "content-length": String(MAX_BODY_BYTES + 1) },
    });
    expect(
      await rejectionOf(fetchApiStatus({ signal: signal(), transport: overFetch(fetchFn) })),
    ).toBe("too-large");
    expect(pulled).toBe(false);
  });

  it("stops reading an undeclared body once it passes the cap, error bodies included", async () => {
    for (const status of [200, 500]) {
      let chunks = 0;
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunks++;
          controller.enqueue(new Uint8Array(1024).fill(0x20));
        },
      });
      expect(
        await rejectionOf(
          fetchApiStatus({ signal: signal(), transport: overFetch(respond(endless, { status })) }),
        ),
        `${status}`,
      ).toBe("too-large");
      expect(chunks).toBeLessThan(MAX_BODY_BYTES / 1024 + 4);
    }
  });

  it("accepts a body of exactly the cap", async () => {
    const msg = '{"status":"STATUS_SERVING"}';
    const body = `${msg}${" ".repeat(MAX_BODY_BYTES - msg.length)}`;
    expect(body).toHaveLength(MAX_BODY_BYTES);
    await expect(
      fetchApiStatus({ signal: signal(), transport: overFetch(respond(body)) }),
    ).resolves.toEqual({ kind: "ok" });
  });
});
