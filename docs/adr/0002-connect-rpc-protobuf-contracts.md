# ADR-0002: Connect RPC + Protobuf contracts

- **Status:** Accepted
- **Date:** 2026-10-27
- **Roadmap item:** P0-05
- **Deciders:** owner (chose this in Phase 0 questions)

## Context

A Go backend serves a React PWA now and an Expo app later. SPEC section Z requires typed, generated Go and TypeScript clients and **breaking-change checks in CI**. The owner wants to learn inter-service communication (sync RPC vs REST vs async jobs). Clients must work from browsers, without a proxy.

## Options considered

### A: Connect RPC + Protobuf (buf)
- **Pros:**
  - one `.proto` source → a Go server and a TS client;
  - `buf breaking` gives real wire-compatibility checks;
  - speaks gRPC, gRPC-Web and a plain HTTP/JSON protocol, so it works from browsers with no proxy and calls can be debugged with curl;
  - server streaming suits "AI drafts stream" (SPEC section 4).
- **Cons:**
  - a less familiar RPC style;
  - URLs aren't resource-shaped;
  - public/partner APIs would want REST later.

### B: REST + OpenAPI (oapi-codegen + openapi-typescript)
- **Pros:**
  - familiar;
  - resource URLs and HTTP caching semantics.
- **Cons:**
  - breaking-change detection is weaker and tool-dependent;
  - two generators to keep aligned;
  - streaming is ad hoc (SSE).

### C: Hand-written REST + shared TS types
- **Pros:** fastest to start.
- **Cons:**
  - no enforced contract;
  - drift between server and client;
  - fails the SPEC section Z requirement.

## Decision

Use **Connect RPC with Protobuf**, managed by buf (`buf lint`, `buf breaking` against `main` in CI, `buf generate` into `gen/` directories). If a public REST surface is ever needed (webhooks, share links), add it beside Connect as plain handlers. Payment webhooks will be plain HTTP endpoints by nature.

## Consequences

- Positive:
  - typed end to end;
  - CI blocks wire-breaking changes;
  - the same contracts serve web and mobile.
- Negative:
  - the owner learns protobuf schema evolution: field numbers, `reserved`, and `_UNSPECIFIED` enums (a learning goal);
  - generated code adds review noise (collapsed by `.gitattributes`).
- **Open detail for P0-05:** connect-go v1 (`connectrpc.com/connect`) vs v2 (`connectrpc.com/connect/v2`, v2.0.2 verified 2026-10-27). Pick in the P0-05 design step and record it in VERSIONS.

## Verification

P0-05 acceptance: `buf breaking` fails CI on a removed field (a test PR proves it); the web client calls `Health` through the generated client.
