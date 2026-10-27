# ADR-0006: connect-go v2, local codegen pinned to the runtimes, and the Health contract

- **Status:** Accepted
- **Date:** 2026-10-28
- **Roadmap item:** P0-05 (closes ADR-0002's open detail)
- **Deciders:** owner (+ architect / red-team subagents)

## Context

ADR-0002 chose Connect RPC with Protobuf and left one detail open: connect-go v1 or v2. P0-05 also has to decide how code is generated, where it lives, and the shape of the first contract. The constraints:

- **SPEC section Z:** generated Go and TypeScript from one source, with breaking-change checks in CI.
- **CI runs on Ubuntu and Windows**, offline-friendly, with every tool pinned (`mise.toml`, lockfiles).
- **The web initial-JS budget is 170 kB gzip** (ROADMAP section Budgets); it was 112.93 kB before this PR.
- **Browsers call the API unauthenticated** from day one, and the Vite dev server is reachable on the LAN (`task dev:web:lan`).
- **Verified at the pinned versions** (module source, `go doc`, the installed `.d.ts` files):
  - `connectrpc.com/connect/v2` v2.0.2 (v2.0.0 released 2026-10-07): the core no longer imports `net/http`; `connecthttp.Mount` installs one route per procedure on an existing mux; interceptors are `func(next) next` and surround the whole call; only an authored `*connect.Error` is serialised; `connectinprocess` dispatches in-process for tests;
  - `connecthttp.WithReadMaxBytes` is enforced after decompression (`connecthttp/compression.go`);
  - with `WithRequireConnectProtocolHeader`, a Connect GET must carry `connect=v1`;
  - wrong HTTP method, content type, compression or timeout header is rejected before the interceptor chain (`connecthttp/handler.go`);
  - connect-web 2.2.0 has no response size limit and no redirect option; its `fetch` option can wrap both.

## Options considered

### 1. connect-go version

- **A: v1 (`connectrpc.com/connect` v1.21.1).** Mature, and well known to tools and agents. But it uses generic `Request[T]`/`Response[T]` wrappers, its interceptors run after decoding, and moving to v2 later means a rewrite.
- **B: v2 (`connectrpc.com/connect/v2` v2.0.2).** A plain `func(ctx, *Req) (*Res, error)` shape, whole-call interceptors (recovery, request IDs and access logs in one place), safe-by-default errors and an in-process test transport. It is three weeks old: every API is checked with `go doc`, not memory. `otelconnect/v2` exists for P0-07.

### 2. Plugins and pins

- **A: buf remote plugins (BSR).** Nothing to install, but every `task gen` needs the network, and the plugin version is pinned apart from the runtime.
- **B: local plugins pinned to their runtimes.** `protoc-gen-go` and `protoc-gen-connect-go` are `tool` directives in `backend/go.mod`, so `go.sum` pins each generator to the same module version as its runtime library. `protoc-gen-es` is a devDependency of `packages/api`, at the same version as `@bufbuild/protobuf`. buf runs `go tool ...` and `node .../protoc-gen-es` as local plugins.
- **C: mise `go:`/`npm:` tools.** One list, but generator and runtime versions can drift.

### 3. The Health contract

- **A: a failing dependency as a Connect error** (`Unavailable`). The per-check list would need error details, and "the API is up and says what's wrong" reads as a transport failure.
- **B: a normal response with `STATUS_NOT_SERVING`** and the per-check list. This matches `/readyz`, where a 503 with a valid body is content, not an error.

## Decision

- **connect-go v2 (1B).** A new codebase has nothing to migrate, and the whole-call interceptor shape is what P0-05-1 teaches.
- **Local plugins pinned to the runtimes (2B).**
  - `task gen` runs sqlc, then `buf generate`.
  - `task lint:gen` regenerates into a temporary directory and compares it with the committed tree, line endings aside.
  - Generated code goes in `backend/gen/api` (Go, package `earliiv1`) and `packages/api/src/gen` (TS), shipped as the source-only workspace package `@earlii/api`. The Expo app (later) reuses it.
- **Health returns `STATUS_NOT_SERVING` as content (3B).**
  - `/readyz` and `HealthService.Check` read one `health.Checker`, so they never disagree.
  - Concurrent callers share one run, and a report is reused for 1 s, so a flood of browser calls costs one round of pings per second.
  - A shared run is cancelled only when its last waiter leaves.
  - `Check` is `NO_SIDE_EFFECTS`, so the web calls it with a Connect GET; the response says `Cache-Control: no-store`.
- **Breaking changes:** `buf breaking` with the `FILE` rules, against the merge base with main (`task lint:proto`). It skips while main has no `buf.yaml` (this PR). `scripts/test/proto.test.mjs` proves a removed or renumbered field fails and an added one passes.
- **Server hardening:**
  - a 64 KiB request cap, which an RPC that needs more raises per procedure;
  - gzip only above 1 KiB;
  - the Connect protocol header or `connect=v1` required, so a cross-site form, `<img>` or `text/plain` request can't make a valid call;
  - interceptors in this order: request ID, access log, recovery; unknown methods run through the same chain (logged, fixed reply);
  - the server always generates the request ID; a well-formed inbound one is only logged as `client_request_id`.
- **Web:**
  - the generated client over connect-web, Connect JSON, GET;
  - a guarded `fetch` that refuses redirects and the HTTP cache, caps every body at 4 KB and rejects a non-JSON 200;
  - the decoded response is validated before rendering: check names, a cap of 32 checks, no "ok" for an unknown status or a SERVING response with a failing check;
  - the dev proxy forwards only `^/earlii\.v1\.HealthService/Check(\?|$)`.

## Consequences

- Positive:
  - one `.proto` yields a typed Go server and TS client, checked for staleness and wire compatibility in CI;
  - Health is cheap under load and can't leak error text;
  - the interceptor chain is ready for auth (P2-10) and OTel (P0-07).
- Negative / accepted trade-offs:
  - v2's young ecosystem: `validate/v2`, `authn/v2` and `grpchealth/v2` were not found on the module proxy on 2026-10-28;
  - requests rejected before the interceptor chain (405, 415, bad compression) get no access log line until HTTP-level telemetry lands in P0-07;
  - connect-go handlers also speak gRPC-Web, and v2 has no server option to turn it off; it reaches only the same handlers through the same limits;
  - the web initial JS grows by 31.99 kB gzip for the Connect and Protobuf runtimes (112.93 to 144.92 kB of 170 kB; `task build:web` on main and on this branch). The binary codec makes no difference (within 0.01 kB). Lazy-loading the client would only move bytes off the metric, since Health is on the first route's critical path.
- What would make us revisit this: a needed ecosystem package with no `/v2` release, or a public REST surface (add plain handlers beside Connect, as ADR-0002 says).

## Verification

- `backend/internal/rpc/rpc_test.go`: the in-process handler tests (`connectinprocess`), and over HTTP: GET, `no-store`, the required protocol marker, request IDs that are never adopted, panics and plain errors that never leak, oversized and gzip-bomb requests, unknown methods logged as `unknown` without echoing the path.
- `backend/internal/health/health_test.go`: 200 concurrent callers share one run; the TTL; one caller leaving doesn't cancel the others; an abandoned run isn't cached.
- `apps/web/src/lib/api-status.test.ts`: the client against a mock transport (`createRouterTransport`) and over a fake fetch.
- `apps/web/src/dev-server.test.ts`: the exact proxy route.
- `scripts/test/proto.test.mjs`: `buf breaking` fails a removed field.
