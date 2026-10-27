# ADR-0003: Modular monolith, one image, many modes

- **Status:** Accepted
- **Date:** 2026-10-27
- **Roadmap item:** P0-02, P0-06
- **Deciders:** owner (SPEC §3 Packaging) + architect

## Context

SPEC §3 asks for "one Dockerfile, one image; each mode runs as its own container", on free tiers first and AWS later. The workload has three shapes:

- a latency-sensitive API (SPEC §4: under 100 ms taps, under 200 ms search);
- bursty background work (fetching, diffing, enrichment, notifications);
- a scheduler.

There is one maintainer.

## Options considered

### A: Microservices (a service per area)
- **Pros:** independent scaling and deploys.
- **Cons:**
  - network hops on every call;
  - distributed transactions;
  - N deploy pipelines;
  - overwhelming ops for one person on free tiers.

### B: A single process doing everything
- **Pros:** simplest.
- **Cons:**
  - a fetch burst or LLM call can starve API latency;
  - one crash takes everything down;
  - API and workers can't be scaled separately.

### C: Modular monolith; one binary and image; `earlii api|worker|scheduler` modes
- **Pros:**
  - in-process calls between modules;
  - one build and one image;
  - each mode is its own container, so API latency is isolated from background work and modes scale independently;
  - modules can be extracted later if a real need appears.
- **Cons:**
  - module boundaries need discipline (enforced by `internal/` packages and review);
  - all modes share one release cadence.

## Decision

**Option C.** Modules live in `backend/internal/<module>/` and expose Go interfaces. Async work flows through River jobs on Postgres, which avoids a separate message broker. One Dockerfile produces the single image, and Compose/Render run it with different commands.

## Consequences

- Positive:
  - lowest operational load;
  - API isolation from background work;
  - a clean path to AWS (same image, different orchestrator).
- Negative:
  - Postgres is a shared dependency, so its load must be watched (queue depth metric, P1-13);
  - a bad deploy affects all modes at once (mitigated by post-deploy smoke tests, P2-16).
- Revisit if one module needs a different runtime, scaling profile or release cadence badly enough to justify a network boundary.

## Verification

P0-06: the same image runs all three modes in Compose. P0-07: one trace spans API → job → worker.
