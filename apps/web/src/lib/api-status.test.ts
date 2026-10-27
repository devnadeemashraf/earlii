// @vitest-environment node
// The adapter is plain logic over fetch, so it runs in Node: jsdom's AbortSignal isn't accepted by
// Node's fetch, and nothing here touches the DOM.
import { describe, expect, it } from "vitest";
import {
  ApiStatusError,
  fetchApiStatus,
  MAX_BODY_BYTES,
  MAX_CHECKS,
  parseReadyz,
} from "@/lib/api-status";

const json = "application/json";

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

function respond(body: BodyInit | null, init: ResponseInit = {}): typeof fetch {
  return async () =>
    new Response(body, { status: 200, headers: { "content-type": json }, ...init });
}

describe("parseReadyz", () => {
  it("reads a ready API as ok", () => {
    expect(parseReadyz(200, json, '{"status":"ok"}')).toEqual({ kind: "ok" });
  });

  it("accepts a JSON content type with parameters, in any case", () => {
    expect(parseReadyz(200, "Application/JSON; charset=utf-8", '{"status":"ok"}')).toEqual({
      kind: "ok",
    });
  });

  it("reads a 503 with a valid body as degraded content, checks sorted by name", () => {
    const body = '{"status":"unavailable","checks":{"river":"ok","postgres":"fail"}}';
    expect(parseReadyz(503, json, body)).toEqual({
      kind: "degraded",
      checks: [
        { name: "postgres", ok: false },
        { name: "river", ok: true },
      ],
    });
  });

  it("reads a 503 without checks (the readiness timeout) as degraded with none listed", () => {
    expect(parseReadyz(503, json, '{"status":"unavailable"}')).toEqual({
      kind: "degraded",
      checks: [],
    });
  });

  it("rejects other HTTP statuses, such as a server error", () => {
    expect(failureOf(() => parseReadyz(500, "text/plain", "proxy error"))).toBe("http");
    expect(failureOf(() => parseReadyz(404, json, '{"status":"ok"}'))).toBe("http");
  });

  it("rejects an HTML page served with 200, so an SPA fallback never reads as 'API ok'", () => {
    expect(failureOf(() => parseReadyz(200, "text/html", "<!doctype html>"))).toBe("format");
    expect(failureOf(() => parseReadyz(200, null, '{"status":"ok"}'))).toBe("format");
  });

  it("rejects malformed JSON and the wrong shape", () => {
    for (const body of ["{", "", "null", "[]", '"ok"', '{"status":1}', '{"state":"ok"}']) {
      expect(
        failureOf(() => parseReadyz(200, json, body)),
        body,
      ).toBe("format");
    }
  });

  it("rejects a status that contradicts the HTTP code", () => {
    expect(failureOf(() => parseReadyz(200, json, '{"status":"unavailable"}'))).toBe("format");
    expect(failureOf(() => parseReadyz(503, json, '{"status":"ok"}'))).toBe("format");
  });

  it("rejects check values other than ok and fail", () => {
    const body = '{"status":"unavailable","checks":{"db":"maybe"}}';
    expect(failureOf(() => parseReadyz(503, json, body))).toBe("format");
    expect(failureOf(() => parseReadyz(503, json, '{"status":"unavailable","checks":[]}'))).toBe(
      "format",
    );
  });

  it("rejects more checks than the cap, and over-long check names", () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_CHECKS + 1 }, (_, i) => [`c${i}`, "ok"]),
    );
    const tooMany = JSON.stringify({ status: "unavailable", checks: many });
    expect(failureOf(() => parseReadyz(503, json, tooMany))).toBe("format");

    const longName = JSON.stringify({ status: "unavailable", checks: { ["x".repeat(65)]: "ok" } });
    expect(failureOf(() => parseReadyz(503, json, longName))).toBe("format");
  });

  it("accepts check names made of letters, digits, '.', '_' and '-'", () => {
    const body = JSON.stringify({ status: "unavailable", checks: { "river_v0.50-queue": "ok" } });
    expect(parseReadyz(503, json, body)).toEqual({
      kind: "degraded",
      checks: [{ name: "river_v0.50-queue", ok: true }],
    });
  });

  it("rejects check names that could spoof or inject: markup, bidi overrides, zero-width, empty", () => {
    for (const name of ["<img src=x>", "db‮liam", "db​", "", "a b", "\u0000"]) {
      const body = JSON.stringify({ status: "unavailable", checks: { [name]: "ok" } });
      expect(
        failureOf(() => parseReadyz(503, json, body)),
        JSON.stringify(name),
      ).toBe("format");
    }
  });

  it("ignores a __proto__ key instead of polluting the result", () => {
    const body = '{"status":"unavailable","checks":{"__proto__":"ok"}}';
    const got = parseReadyz(503, json, body);
    expect(got).toEqual({ kind: "degraded", checks: [{ name: "__proto__", ok: true }] });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("fetchApiStatus", () => {
  const signal = () => new AbortController().signal;

  it("fetches /readyz and parses it", async () => {
    let seen = "";
    let init: RequestInit | undefined;
    const fetchFn: typeof fetch = async (input, i) => {
      seen = String(input);
      init = i;
      return new Response('{"status":"ok"}', { headers: { "content-type": json } });
    };
    await expect(fetchApiStatus({ signal: signal(), fetch: fetchFn })).resolves.toEqual({
      kind: "ok",
    });
    expect(seen).toBe("/readyz");
    // A captive portal or SSO bounce must not be followed and parsed as the probe.
    expect(init?.redirect).toBe("error");
  });

  it("times out even when fetch ignores the signal and the body never ends", async () => {
    // The response arrives after the timeout has already fired, so an "abort" listener added
    // from then on never runs.
    const late: typeof fetch = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        headers: { "content-type": json },
      });
    };
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: late, timeoutMs: 5 }))).toBe(
      "timeout",
    );
  });

  it("reports an error status as 'http' without downloading the error page", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const fetchFn = respond(body, {
      status: 500,
      headers: { "content-type": "text/html", "content-length": String(MAX_BODY_BYTES * 100) },
    });
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: fetchFn }))).toBe("http");
    expect(pulled).toBe(false);
  });

  it("reads a gateway's 502 or 504 (the dev proxy when the API is down) as 'network'", async () => {
    for (const status of [502, 504]) {
      const fetchFn = respond("Bad Gateway", { status, headers: { "content-type": "text/plain" } });
      expect(
        await rejectionOf(fetchApiStatus({ signal: signal(), fetch: fetchFn })),
        `${status}`,
      ).toBe("network");
    }
  });

  it("maps a network failure to 'network'", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: fetchFn }))).toBe("network");
  });

  it("still times out on browsers without AbortSignal.any (Safari before 17.4, Chrome before 116)", async () => {
    const native = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
    try {
      const hang: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      expect(
        await rejectionOf(fetchApiStatus({ signal: signal(), fetch: hang, timeoutMs: 5 })),
      ).toBe("timeout");
    } finally {
      if (native) Object.defineProperty(AbortSignal, "any", native);
    }
  });

  it("gives up at the timeout when the server never answers", async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: hang, timeoutMs: 5 }))).toBe(
      "timeout",
    );
  });

  it("gives up at the timeout when the body stalls after the headers", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":'));
      },
    });
    expect(
      await rejectionOf(
        fetchApiStatus({ signal: signal(), fetch: respond(stalled), timeoutMs: 5 }),
      ),
    ).toBe("timeout");
  });

  it("passes a caller's cancellation through untouched (TanStack Query cancels this way)", async () => {
    const ctrl = new AbortController();
    const reason = new DOMException("cancelled", "AbortError");
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const p = fetchApiStatus({ signal: ctrl.signal, fetch: hang });
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
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: fetchFn }))).toBe(
      "too-large",
    );
    expect(pulled).toBe(false);
  });

  it("stops reading an undeclared body once it passes the cap", async () => {
    let chunks = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks++;
        controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: respond(endless) }))).toBe(
      "too-large",
    );
    expect(chunks).toBeLessThan(MAX_BODY_BYTES / 1024 + 4);
  });

  it("accepts a body of exactly the cap", async () => {
    const body = `{"status":"ok"}${" ".repeat(MAX_BODY_BYTES - 15)}`;
    expect(body).toHaveLength(MAX_BODY_BYTES);
    await expect(fetchApiStatus({ signal: signal(), fetch: respond(body) })).resolves.toEqual({
      kind: "ok",
    });
  });

  it("rejects a body that isn't valid UTF-8", async () => {
    const bad = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    expect(await rejectionOf(fetchApiStatus({ signal: signal(), fetch: respond(bad) }))).toBe(
      "format",
    );
  });
});
