# Earlii roadmap

Phases from bootstrap to launch. Every item fits in **one PR of about 1–4 sessions** (a session is about 2.5 focused hours).
Sizes: **S** ≈ 1 session · **M** ≈ 2–4 sessions · **L** = an epic that must be split in a docs-only grooming PR before work starts.
Status values: `todo` · `in progress` · `in review (#PR)` · `done (#PR)` · `blocked (D-xx)`.
🧪 marks items the owner must test by hand; the exact check is listed.
**Study** names what the item's private study guide (AGENTS.md section 5) goes deepest on, and the labs it builds. The AI builds the item itself; nothing on the critical path waits for the owner.

Contents: [Timeline](#timeline) · [Phase 0](#phase-0--bootstrap) · [Phase 1](#phase-1--data-platform-mvp) · [Phase 2](#phase-2--personal-mvp) · [Phase 3](#phase-3--public-beta-epics) · [Phase 4](#phase-4--paid-launch-epics) · [Recurring](#recurring-items) · [Milestones](#milestones-and-exit-criteria) · [Budgets](#budgets) · [Risks](#top-risks) · [Decisions](#decisions) · [Spec change proposals](#spec-change-proposals) · [Curriculum map](#curriculum-map) · [Status log](#status-log)

---

## Timeline

This is an honest estimate at **~20 h/week**: about 8 sessions a week, roughly 5 of them going to items once study, reviews and the unexpected are counted. Build mode (since 2026-10-27) takes exercises off the critical path, so expect this to shorten; re-estimate at M0 (R-02).

| Phase | Items | Sessions | Calendar |
| :-- | :-: | :-: | :-- |
| 0 · Bootstrap | 8 | ~16 | weeks 1–3 |
| 1 · Data platform | 14 | ~35 | weeks 4–10 |
| 2 · Personal MVP | 17 | ~45 | weeks 11–19 (**M2 ≈ early March 2027**) |
| 3 · Public beta | 10 epics | ~70 | weeks 20–34 (≈ mid-2027) |
| 4 · Paid launch | 6 epics | ~45 | weeks 35–45 (≈ Q3–Q4 2027) |

Expect a 25–40% slip. The usual causes are first-time Go concurrency work, job-board quirks and DPDP compliance work. Re-estimate at every milestone (R-02).

---

## Phase 0 · Bootstrap

**Goal:** the AI PR loop works end to end on an empty skeleton. That means CI is green, the hooks enforce the rules, and one request flows web → API → DB → job.

### P0-01 · Starter kit: docs, tooling, CI and AI harness
- **Spec:** Z [MVP] · **Size:** M · **Status:** done (#1)
- **Acceptance:**
  - every kit document exists;
  - `task doctor` and `task check` are green on Windows and Linux CI;
  - the hooks reject a non-conventional commit, an AI trailer and a push to main;
  - the Claude hooks block the forbidden git/gh actions;
  - the handoff check runs on PRs;
  - the TypeScript path alias `@/*` (ADR-0004) resolves in typecheck, tests, the dev server and the production build, and Biome rejects `../` imports in app code;
  - the banned character (the section sign) is rejected in files, commits, PR text and agent edits.
- **Tests:** `scripts/test/*.test.mjs`, covering the guards, the commit-msg rule, the handoff rule, pins, the CLIs, the configs parsing, the alias fixture (`scripts/test/fixtures/ts-alias`) and the banned-character check.
- 🧪 Run `task setup`, then `task check`. Try `git commit -m "bad message"` and confirm it's rejected. In Claude Code, ask it to `git push origin main` and confirm it's blocked.
- **Study:** P0-01-1 *explain it*: how the guards turn policy into enforcement.

### P0-02 · Go skeleton: one binary, many modes
- **Spec:** 3, Z [MVP] · **Size:** M · **Status:** done (#2)
- **Acceptance:**
  - `go.work` plus the `backend/` module;
  - `earlii api|worker|scheduler`;
  - config loaded from env and validated at boot, failing fast with clear errors;
  - JSON `slog`;
  - `/healthz` and `/readyz`;
  - graceful shutdown within 10 s on SIGINT/SIGTERM;
  - the gomod entry added to Dependabot;
  - `fmt:go`, `lint:go` and `test:go` run for real.
- **Tests:** config parsing (valid, missing, malformed); shutdown drains in-flight requests; health handlers.
- **Study:** P0-02-1 *implement*: graceful shutdown with `signal.NotifyContext`, `http.Server.Shutdown` and `errgroup`. This covers context cancellation, the core of all Go concurrency.

### P0-03 · Web skeleton
- **Spec:** 3, O [MVP] · **Size:** M · **Status:** done (#3)
- **Acceptance:**
  - `apps/web`: Vite + React + TS, TanStack Router (file routes) and Query, Tailwind, shadcn/ui initialised;
  - the path alias follows the fixture exactly: `tsconfig.json` extends `tsconfig.base.json` with `"paths": { "@/*": ["./src/*"] }`, and `vite.config.ts` sets `resolve.tsconfigPaths: true` (ADR-0004). shadcn's `components.json` aliases use `@/`;
  - Vitest + Testing Library;
  - one route renders a skeleton, then content;
  - a PWA manifest;
  - `test:web` runs for real.
- **Tests:** a render test, and a route test with a mocked loader.
- 🧪 Run `task dev:api` and `task dev:web:lan`, then open the printed Network URL on your phone (same Wi-Fi). Confirm there's no blank flash. (`task dev:web` is the localhost-only default.)
- **Study:** P0-03-1 *explain it*: file-based routing with codegen vs a hand-written route tree.

### P0-04 · Local stack, migrations, sqlc
- **Spec:** 3, X, Z [MVP] · **Size:** M · **Status:** done (#5) · D-07 and D-10 decided in [ADR-0005](adr/0005-migrations.md)
- **Acceptance:**
  - `compose.yaml` with Postgres and `grafana/otel-lgtm`;
  - `task dev` brings everything up;
  - forward-only migrations;
  - River's migrations applied;
  - `sqlc.yaml` with output in `gen/`;
  - DB integration tests run in CI.
- **Tests:** migrations up from empty; re-running is a no-op; a sqlc query round-trip.
- **Study:** P0-04-1 *design it*: an ADR on migration strategy (expand/contract, forward-only, locking).

### P0-05 · Contracts: Protobuf + Connect
- **Spec:** 3, Z [MVP] · **Size:** M · **Status:** done (#7) · [ADR-0006](adr/0006-connect-v2-and-codegen.md)
- **Acceptance:**
  - `proto/earlii/v1/health.proto`;
  - `buf lint`, plus `buf breaking` against main in CI;
  - `task gen` generates the Go server and the TS client;
  - the web app calls `Health`.
- **Tests:** an in-process Connect handler test; a TS client test against a mock transport.
- **Study:** P0-05-1 *implement*: a Connect interceptor that adds request IDs and structured access logs (the middleware pattern).

### P0-06 · One image, many containers
- **Spec:** 3 Packaging, Z [MVP] · **Size:** S · **Status:** done (#8) · [ADR-0007](adr/0007-container-image.md)
- **Acceptance:**
  - a multi-stage Dockerfile building a static binary on a minimal base;
  - the compose services `api`, `worker` and `scheduler` all run the same image;
  - CI builds the image and scans it (Trivy) and lints the Dockerfile (hadolint);
  - the image is at most 30 MB.
- **Tests:** a CI smoke test runs `earlii api` in the container and hits `/healthz`.
- **Study:** P0-06-1 *optimise*: get the image under budget, and explain each layer.

### P0-07a · Telemetry base
- **Spec:** X [MVP] · **Size:** M · **Status:** todo
- **Split from P0-07** in #9 (2026-10-28, owner-approved). Design: ADR-0008, written in this item.
- **Acceptance:**
  - OTel traces, metrics and logs over OTLP/HTTP with the official exporters, configured only by `EARLII_OTLP_ENDPOINT` and `EARLII_OTLP_HEADERS` (a `Secret`). Any `OTEL_*` variable fails the boot, and prod requires https;
  - with no endpoint, nothing is exported, but spans still get real IDs, so stdout lines carry `trace_id` and `span_id`;
  - slog fans out to the stdout JSON and the otelslog bridge, both gated by the same `EARLII_LOG_LEVEL`;
  - RED metrics per RPC from our own connect v2 interceptor (`otelconnect/v2` doesn't exist): `rpc.server.call.duration` (semconv v1.43.0), with any unknown method recorded as `_OTHER`;
  - HTTP-level telemetry (otelhttp) covers requests rejected before the Connect chain (405, 415). An inbound `traceparent` is never adopted, and Host-derived attributes are kept off the metrics;
  - the compose app services join the `obs` network and export to `lgtm`;
  - telemetry flushes inside `EARLII_SHUTDOWN_TIMEOUT`;
  - the image budget gate is raised to 40 MB, and the real size is measured.
- **Tests:**
  - in-memory exporters (`tracetest`, `sdkmetric.ManualReader`) for the RPC span and histogram;
  - an `httptest` OTLP collector (the paths, the headers, a 500, unreachable);
  - abuser tests: 1000 unknown procedures give one series; 1000 Host headers add no series; an inbound `traceparent` is ignored; `OTEL_*` is rejected.
- **Study:** P0-07a-1 *explain it*: the OTel SDK pipeline (provider, processor, exporter) and metric cardinality.

### P0-07b · River in worker mode and one trace from API to worker
- **Spec:** X [MVP] · **Size:** M · **Status:** todo
- **Split from P0-07** in #9 (2026-10-28). Needs P0-07a.
- **Acceptance:**
  - worker mode starts River's client and retries `Start` with backoff, so the worker boots while the DB is down; a `river` readiness check; `Stop` runs inside the drain;
  - the API has an insert-only client. A dev-only `POST /dev/jobs/ping` (mounted only when `EARLII_ENV=dev`, 404 in prod) enqueues a no-op `ping` job (deferred from P0-04);
  - our own River middleware (`Config.Middleware`) carries W3C `traceparent` in the job **metadata**, never in the args, because River hashes the args into unique keys. The work span is a **child** of the insert span (otelriver only links them);
  - local Grafana shows one trace spanning the HTTP request, the insert and the work.
- **Tests:** an integration test with an in-memory exporter asserts the parent/child spans across an enqueued job (one TraceID, and `traceparent` stored in `river_job.metadata`); a forged or oversized `traceparent` starts a new root; uniqueness by args still dedupes with tracing on.
- **Study:** P0-07b-1 *implement*: carrying trace context through job metadata (sync vs async inter-service communication).

---

## Phase 1 · Data platform (MVP)

**Goal:** 200 India-hiring companies polled politely on an adaptive schedule, with change history, deduplication and India normalisation, and no user features yet.

### P1-01 · Company registry schema
- **Spec:** P [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - tables for companies, aliases, domains, offices, hiring regions and boards;
  - a source recorded per field, plus first-seen / last-checked / last-changed timestamps;
  - sqlc queries;
  - a seed file format.
- **Tests:** constraint tests (duplicate domain, orphan board); seed loader idempotency.
- **Study:** P1-01-1 *design it*: the ADR for field-level provenance.

### P1-02 · India location tree and aliases
- **Spec:** S India pack [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - states and UTs → cities, plus remote-India;
  - aliases (Bangalore → Bengaluru, Gurgaon → Gurugram);
  - case- and diacritic-insensitive lookup;
  - prefix suggestions for the city picker.
- **Tests:** a table of aliases; unknown input; prefix ranking; a property test (normalise is idempotent).
- **Study:** P1-02-1 *implement*: a trie for prefix lookup and alias resolution, with Big-O analysis vs a sorted slice plus binary search.

### P1-03 · Polite HTTP client
- **Spec:** Q polite fetching [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - a per-host token-bucket limiter;
  - timeouts and a response-size cap;
  - a robots.txt cache that honours crawl-delay;
  - retries with exponential backoff and full jitter, on 5xx and 429 only;
  - conditional requests (ETag / If-Modified-Since);
  - a clear user agent.
- **Tests:** `httptest` servers for 429 then 200, slow body, huge body, redirect off-host, robots disallow and 304; the race detector on the limiter.
- **Study:**
  - P1-03-1 *implement*: a concurrency-safe token bucket (locks vs channels, with a property test);
  - P1-03-2 *implement*: an LRU cache for robots.txt (a hash map plus a doubly linked list).

### P1-04 · Connector interface and Greenhouse
- **Spec:** Q [MVP] · **Size:** S · **Status:** todo
- **Acceptance:**
  - a `Connector` interface (list jobs → normalised raw postings);
  - the Greenhouse public job-board API, with its docs and terms verified and recorded in LEGAL;
  - recorded fixtures;
  - no live calls in CI.
- **Tests:** fixture parsing; empty board; malformed JSON; pagination.
- **Study:** P1-04-1 *review it*: the AI opens a PR with seeded issues and the owner reviews it.

### P1-05 · Lever connector
- **Spec:** Q [MVP] · **Size:** S · **Status:** todo
- **Acceptance:** Lever postings API, with terms verified; fixtures.
- **Tests:** the same matrix as P1-04.
- **Study:** P1-05-1 *test it*: the owner writes the suite, graded by mutation testing (gremlins) and seeded bugs.

### P1-06 · Change detection and history
- **Spec:** R [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - diff by stable job ID → new / updated / closed;
  - a canonical content hash → a version row on change;
  - first-seen is the freshness clock, and the closed time is recorded;
  - one transaction per board;
  - re-running never creates duplicates.
- **Tests:** run twice and get the same state; reorder the input and get the same hash; a crash mid-run rolls back; a reopened posting.
- **Study:** P1-06-1 *implement*: set-diff plus canonical hashing, and prove idempotency with a test.

### P1-07 · Adaptive fetch scheduling with River
- **Spec:** Q adaptive schedule [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - periodic enqueue;
  - one in-flight job per board (unique jobs);
  - tiers: busy 15 min, normal 1 h, quiet 1 day;
  - boards promoted or demoted by posting rate;
  - a fake clock in tests.
- **Tests:** tier transitions; no double-scheduling under concurrent schedulers; the clock moved forward deterministically.
- **Study:** P1-07-1 *implement*: EWMA-based tiering with a min-heap of next-due boards (O(log n) scheduling).

### P1-08 · Board health and auto-pause
- **Spec:** Q board health [MVP] · **Size:** S · **Status:** todo
- **Acceptance:** a consecutive-failure counter; auto-pause at N; an admin alert (a log plus a metric); resume.
- **Tests:** state machine transitions; recovery resets the counter.
- **Study:** P1-08-1 *bug hunt*: on a practice branch, 2 planted state-machine bugs and only the symptom given.

### P1-09 · India title rules
- **Spec:** S [MVP] · **Size:** M · **Status:** todo
- **Acceptance:** titles → role family + level ("SDE-2", "SSE", "Member of Technical Staff", "Lead"), with a confidence score and "unknown" when unsure.
- **Tests:** a labelled table of 150+ titles; ambiguous cases fall to unknown.
- **Study:** P1-09-1 *implement*: tokenisation plus rule matching with string algorithms (normalisation, n-grams).

### P1-10 · Salary and experience parsing
- **Spec:** S [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - LPA, lakhs and crore; CTC vs base; ranges;
  - "3–5 yrs" and "5+ years";
  - returns "not stated" rather than guessing.
- **Tests:** a table; Go native fuzzing (`FuzzParseSalary`) never panics; round-trip properties.
- **Study:** P1-10-1 *implement*: the parser plus a fuzz target; interval overlap for experience ranges.

### P1-11 · Board discovery and approval queue
- **Spec:** P board discovery [MVP] · **Size:** M · **Status:** todo
- **Acceptance:**
  - paste a careers URL → detect the provider and board ID → validate that it returns jobs → approval queue;
  - SSRF-safe: no private IPs, no redirect to private IPs, and re-check after DNS resolution.
- **Tests:** the red-team cases (localhost, 169.254.169.254, DNS rebinding, redirect chains, huge pages).
- **Study:** P1-11-1 *implement*: the SSRF-safe URL validator (abuser-path testing).

### P1-12 · Repost detection and cross-board dedupe
- **Spec:** R repost detection, S dedupe [MVP] · **Size:** M · **Status:** todo
- **Acceptance:** SimHash over normalised text; Hamming threshold; same company + title + similar text within N days → repost; duplicate clusters via union-find.
- **Tests:** labelled near-duplicate pairs (precision/recall reported); a benchmark.
- **Study:** P1-12-1 *optimise*: SimHash + popcount, then LSH banding to beat an O(n²) baseline under budget.

### P1-13 · Pipeline metrics
- **Spec:** X key numbers [MVP] · **Size:** S · **Status:** todo
- **Acceptance:** detect lag (posted → first seen, when the provider exposes a posted time), fetch errors, queue depth, a Grafana dashboard JSON committed.
- **Tests:** metric emission tests with an in-memory reader.

### P1-14 · Seed: 200 companies
- **Spec:** Z seed data [MVP] · **Size:** S · **Status:** todo
- **Acceptance:** 200 India-hiring companies with validated Greenhouse/Lever boards in the seed file; a loader.
- **Tests:** seed validation (unique domains, valid board IDs).
- 🧪 Spot-check 20 random boards in the browser against the stored postings: counts within ±2, titles match.

---

## Phase 2 · Personal MVP

**Goal:** the owner uses Earlii daily: a guest feed, then sign-in, filters, search, triage and a daily email digest, deployed on free tiers.

| ID | Title | Spec | Size | Acceptance (summary) | Required tests | Study |
| :-- | :-- | :-- | :-: | :-- | :-- | :-- |
| P2-01 | Design tokens and theme presets | O | M | Shared token package; Tailwind theme; Neon/Soft/Brutal presets; dark first-class | WCAG AA contrast test across every preset, in CI | *implement* the contrast-ratio checker |
| P2-02 | Core components | O | M | Role card, chip, badge, button, skeleton, toast with undo, empty state; reduced motion; 44 px targets | Component tests; a11y checks | *test it* |
| P2-03 | Feed RPC | B1, U | M | Keyset pagination; hard filters; freshness × match ranking; indexes | p95 at most 150 ms on 100k postings (bench); stable cursors | *optimise*: keyset vs offset with `EXPLAIN ANALYZE` |
| P2-04 | Guest feed and city picker | A1 | S | Real roles before sign-up; no IP tracking | e2e: first open → feed | — |
| P2-05 | Feed UI | B1 | M | Virtualised list; cached-first; "new since" divider; never blank | e2e plus visual snapshot | *implement* optimistic update with rollback |
| P2-06 | Filters and persistence | B3 | M | Location tree, posted-within, level and more; persisted; "turn into alert" | Unit plus e2e | — |
| P2-07 | Search as you type | B4 | M | FTS plus `pg_trgm`; debounce; stale-response cancellation | Under 200 ms end to end (bench); race test | *implement* AbortController race handling; trigram ranking |
| P2-08 | Triage and undo | B2 | M | Save/skip; J/K/S/X/O shortcuts; 5 s undo; "not for me because…" | Unit plus e2e | *implement* an undo deque with delayed commit |
| P2-09 | Role detail | C | M | Sanitised HTML; eligibility "not stated"; staleness warnings | Red-team XSS corpus | *bug hunt* (sanitiser) |
| P2-10 | Google sign-in and sessions | A2 | M | OIDC; opaque session tokens hashed at rest; device list; sign out everywhere | Red-team auth cases | *design it*: the session model |
| P2-11 | 60-second setup (no resume) | A3 | M | Where / what / must-haves, at most 3 fields per step; instant feed | e2e timed | — |
| P2-12 | Saved searches and incremental matching | D1, U | M | Matching runs on new postings only | Idempotency; no full-table scans | *implement* incremental matching |
| P2-13 | Daily email digest | D, V | M | Fan-out idempotent per (user, role, channel); quiet hours (IST); unsubscribe link | Exactly-once effect under retry | *implement* idempotency keys + outbox |
| P2-14 | Profile | N, A3 (SCP-03) | M | A polished profile page: Google name and photo; headline; job preferences from setup (locations, role families, levels, must-haves), all editable in place with optimistic saves; profile completeness hint | Unit + e2e; authz: only the owner can read or edit a profile | *design it*: the profile and preferences data model |
| P2-15 | Settings and privacy | N, A2 (SCP-03) | M | Notification settings per channel; quiet hours and daily cap; theme (light / dark / system) and accent; signed-in devices with "sign out everywhere"; JSON export; hard delete within 30 days; consent records | Deletion leaves no rows (test); sign-out-everywhere revokes all sessions | — |
| P2-16 | Admin basics | W | M | Connector health; approval queue; pause/resume | Authz: non-admin is denied | — |
| P2-17 | Deploy | 3 Hosting | M | API, worker, DB and OTLP to Grafana Cloud; deploy on merge to main | Post-deploy smoke test | *explain it*: the deploy pipeline |

🧪 Manual checks in Phase 2:
- P2-05: scroll 500 roles on a mid-range Android; it must never go blank.
- P2-08: undo each action within 5 s.
- P2-11: a stopwatch from first open to feed must read under 60 s.
- P2-13: receive a real digest; unsubscribe works in one click.
- P2-14: edit every preference on your phone; each save feels instant and survives a reload.
- P2-15: change the theme and accent, then sign out everywhere from a second device.
- P2-17: open the production URL on mobile data.

---

## Phase 3 · Public beta (epics)

Each epic is **L**: it gets split into S/M items in the grooming PR at M2 (R-02).

| ID | Epic | Spec |
| :-- | :-- | :-- |
| E-01 | AI enrichment with evidence quotes and evals; eval gate in CI; budget guard | T |
| E-02 | Resume parsing → master profile (paid, no-training tier or deterministic; D-09) | A3, F |
| E-03 | Scoring and learning from swipes; "why this matches" | U |
| E-04 | Web push and instant alerts; smart batching; delivery receipts | D, V |
| E-05 | Application tracker | E |
| E-06 | Company pages, follow, request-a-company | K |
| E-07 | Mobile app (Expo) shell + feed + push | 1, O |
| E-08 | Security and DPDP pack: rate limits, bot protection, consent, breach plan | Y |
| E-09 | Growth: waitlist, invites, share cards | M |
| E-10 | Additional sign-in methods, only if users need them (SCP-01: decide later) | A2 |

## Phase 4 · Paid launch (epics)

| ID | Epic | Spec |
| :-- | :-- | :-- |
| E-11 | Plans and Razorpay checkout, GST invoices | L |
| E-12 | Claim-checked drafts with streaming | G |
| E-13 | Follow-ups | H |
| E-14 | Referral finder (LinkedIn export import) | I |
| E-15 | Insights | J |
| E-16 | Terms of service and privacy policy (professional review) | Y |

---

## Recurring items

| ID | Cadence | What |
| :-- | :-- | :-- |
| R-01 | Monthly | Dependency bumps: merge or close Dependabot PRs; `mise outdated` → bump pins in `mise.toml` + VERSIONS; re-verify free-tier facts |
| R-02 | Each milestone | Phase grooming: split the next phase's epics into S/M items (docs-only PR); re-estimate the timeline |
| R-03 | Monthly (from P2-17) | Free-tier usage review: Render hours, Grafana series, LLM spend, email quota |
| R-04 | Weekly | Study review: the owner works through the latest private guide and its labs (`docs/learning/README.md`); re-implement older labs from memory |

## Milestones and exit criteria

| Milestone | Exit criteria |
| :-- | :-- |
| **M0 · Loop works** (end of Phase 0) | CI green on both OSes; one request web → API → DB → job, traced end to end; the owner merged at least 5 PRs produced by the loop |
| **M1 · Data engine** (end of Phase 1) | 200 boards polled on schedule for 7 days; zero duplicate postings; detect-lag p50 within budget; board auto-pause verified |
| **M2 · Personal MVP** (end of Phase 2) | The owner uses it daily for 2 weeks; every Phase 2 budget is met in production; cost ₹0 beyond the domain |
| **M3 · Public beta** | 100 beta users; enrichment eval gate in CI; DPDP checklist complete with professional review |
| **M4 · Paid launch** | Payments live; 50 paying users is the break-even target (SPEC section 1) |

## Budgets

| Budget | Target | Source |
| :-- | :-- | :-- |
| Tap acknowledgement | ≤ 100 ms (optimistic UI) | SPEC section 4 |
| Search end to end | < 200 ms | SPEC section 4 |
| Feed RPC p95 (server) | ≤ 150 ms at 100k postings | derived from SPEC section 4 |
| First feed after first open | < 60 s | SPEC section 4 |
| Posted → alert | busy < 20 min · normal < 70 min · quiet same day | SPEC section 4 |
| AI draft first token | ≤ 1.5 s | SPEC section 4 |
| Web initial JS | ≤ 170 kB gzip (1 kB = 1000 bytes) | our target; gated by `task build:web` since P0-03 (about 113 kB at P0-03) |
| Docker image | ≤ 40 MB (1 MB = 10^6 bytes, of `docker export`) | our target; gated by `task test:image` since P0-06 (17.56 MB at P0-06). Raised from 30 MB on 2026-10-28 (owner-approved): every official OTLP exporter links gRPC, about +11.4 MB for all three (probe builds); the gate changes in P0-07a |
| API / worker memory | ≤ 256 MB RSS each | our target; fits small free-tier instances |
| Fetch politeness | ≤ 1 req/s per host by default; honour crawl-delay | SPEC section Q |
| Monthly cost through M2 | ₹0 beyond the domain | SPEC section 3 (free tiers first) |
| LLM spend (beta) | daily cap; decide the amount in E-01 | SPEC section T budget guard |

## Top risks

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| Scope creep: 26 feature areas for one person | Never ships | MVP is strictly Phase 1–2; epics split only at milestones; push back on additions |
| Job-board terms or format changes | Data gaps, legal exposure | Documented public APIs only; terms recorded per provider in LEGAL; fixtures; auto-pause |
| Free-tier limits (DB expiry, sleep, series caps) | Outages, data loss | D-04 resolved before P2-17; backups from day one of deploy; R-03 monthly review |
| Privacy (DPDP), resumes, LLM data use | Legal and trust damage | Public postings only to the LLM until a paid no-training tier exists; encryption at rest; professional review at M3 |
| Go learning curve slows delivery | Timeline slip | Build mode: the AI builds every item; the owner learns in parallel from private per-PR study guides and labs, with the mentor subagent |
| Notification noise | Churn | Batching, caps and quiet hours are MVP, not later |

## Decisions

| ID | Decision | Status | Assumption in use | First item blocked |
| :-- | :-- | :-- | :-- | :-- |
| D-01 | API style: Connect RPC + Protobuf | **decided** 2026-10-27 · [ADR-0002](adr/0002-connect-rpc-protobuf-contracts.md) | — | — |
| D-02 | Toolchain: Task + mise + lefthook + Biome + golangci-lint | **decided** · [ADR-0001](adr/0001-toolchain-and-repo-automation.md) | — | — |
| D-03 | Modular monolith, one image, many modes | **decided** · [ADR-0003](adr/0003-modular-monolith-one-image.md) | — | — |
| D-04 | Production Postgres host (Render's free DB expires after 30 days) | open | A paid Render basic DB or another free Postgres host; compare at P2-17 | P2-17 |
| D-05 | Email provider for digests (free tier, India deliverability) | open | Choose from 2–3 providers with free tiers in the P2-13 design step | P2-13 |
| D-06 | Sign-in methods at launch | **decided** 2026-10-27 (SCP-01): Google only for MVP; other methods decided later, when needed | — | — |
| D-07 | Migration tool (goose vs tern vs Atlas) | **decided** 2026-10-28 · [ADR-0005](adr/0005-migrations.md): goose embedded in the binary, River first, an explicit `earlii migrate` | — | — |
| D-08 | Keka / Darwinbox / Zoho Recruit public feeds and terms | open (SPEC section 8) | Excluded until verified | Phase 3 connectors |
| D-09 | Resume parsing: paid LLM tier vs deterministic parser | open | Paid, no-training tier only | E-02 |
| D-10 | DB integration tests: testcontainers vs a CI service container | **decided** 2026-10-28 · [ADR-0005](adr/0005-migrations.md): a CI service container in an ubuntu `integration` job | — | — |
| D-11 | Licence: proprietary, all rights reserved | **decided** by the owner 2026-10-27 | — | — |

## Spec change proposals

| ID | Proposal | Replaces | Cost / risk | Status |
| :-- | :-- | :-- | :-- | :-- |
| SCP-01 | MVP sign-in is **Google only**. Other methods (email link, phone) are decided later, only if users need them | A2 (Google + magic link) and section 8 ("Google primary, phone secondary") conflicted | Smallest auth surface; no SMS or email-provider cost for sign-in | **approved** by the owner 2026-10-27; SPEC A2 and section 8 updated |
| SCP-02 | Section 3 Backend: replace "Standard REST Designs if REST chosen otherwise Connect RPC…" with "Connect RPC with Protobuf contracts…" | Section 3 wording | None: matches the owner's pick of Connect RPC | **approved** by the owner 2026-10-27; SPEC section 3 updated |
| SCP-03 | Add a polished **Profile** section (identity, job preferences, user configuration) alongside Settings (notifications, theme, devices, privacy) | SPEC N "Profile and preferences" was a single bullet | One extra M item in Phase 2 (P2-14 Profile; Settings becomes P2-15) | **approved** by the owner 2026-10-27; SPEC N updated |

## Curriculum map

Where each area is studied in depth, in the private per-PR study guides and labs (build mode, AGENTS.md section 5). Every area comes up for real at least once per phase, with rising difficulty. ⭐ marks the core, in-demand skills the owner asked to prioritise beyond CRUD.

| Area | Phase 0 | Phase 1 | Phase 2 | Later |
| :-- | :-- | :-- | :-- | :-- |
| Arrays and strings | — | P1-09 tokenising, P1-10 parsing | P2-07 query normalisation | — |
| Hash maps and sets | — | P1-06 diff by stable ID | P2-13 dedupe per (user, role, channel) | — |
| Stacks, queues, deques | — | P1-03 retry queue | P2-08 undo deque | E-04 batching |
| Linked structures | — | P1-03-2 LRU (map + doubly linked list) ⭐ | — | — |
| Trees, tries, heaps | — | P1-02-1 trie ⭐, P1-07-1 min-heap scheduler ⭐ | P2-03 top-K merge | — |
| Graphs (BFS/DFS, topo, union-find) | — | P1-12 union-find clusters; side quest: BFS "nearby cities" over the location tree | — | E-06 company merge graph |
| Sorting, searching, binary search | — | P1-02 sorted-slice baseline | P2-03 keyset cursors | — |
| Two pointers, sliding window | — | P1-12 shingling window; P1-03 sliding-log vs token bucket | — | — |
| Recursion / backtracking | — | P1-02 tree building | — | side quest: region-pack rule solver |
| Greedy | — | — | P2-13 digest grouping | E-04 smart batching |
| Dynamic programming | — | P1-09 edit distance for title similarity | — | E-03 |
| Bit manipulation | — | P1-12-1 SimHash + popcount ⭐ | — | — |
| Intervals / spatial | — | P1-10 experience-range overlap | P2-13 quiet-hours intervals (IST) | — |
| Testing: unit / integration / e2e | P0-02, P0-04 (integration) | all | P2-04, P2-05 (e2e) | — |
| Property-based and fuzzing | — | P1-03-1 property, P1-10-1 fuzz ⭐ | — | E-01 evals |
| Test doubles, fixtures, flaky tests | P0-05 mock transport | P1-04 httptest + fixtures, P1-07 fake clock | — | — |
| Coverage vs mutation score | — | P1-05-1 *test it* (gremlins) | P2-02 *test it* | — |
| Debugging (repro → bisect → postmortem) | — | P1-08-1 bug hunt; side quest at M1: `git bisect` drill | P2-09 bug hunt | first incident postmortem |
| Performance (measure, profile, budgets) | P0-06-1 image size | P1-12-1 benchmark + pprof ⭐ | P2-03 EXPLAIN ⭐, P2-07 search | — |
| Concurrency (context, errgroup, locks vs channels, races) | P0-02-1 shutdown ⭐ | P1-03-1 limiter ⭐, P1-07 SKIP LOCKED queues ⭐ | — | E-04 fan-out workers |
| Networking and OS | P0-02 signals, P0-06 containers | P1-03 HTTP semantics, conditional requests ⭐ | — | — |
| Design and architecture (interfaces, ADRs, data modelling, API versioning) | P0-04-1 ADR, P0-05 buf breaking ⭐ | P1-01-1 provenance ADR, P1-04 connector interface | P2-10-1 session design | E-01 LLM provider interface |
| Reliability (idempotency, transactions, outbox) | — | P1-06-1 idempotency ⭐ | P2-13 outbox ⭐ | — |
| Security (validation, authn/z, secrets, OWASP) | P0-02 secrets in env | P1-11-1 SSRF ⭐ | P2-09 XSS, P2-10 sessions ⭐ | E-08 |
| Observability (logs, metrics, traces, SLOs) | P0-07a-1 OTel pipeline, P0-07b-1 propagation ⭐ | P1-13 dashboards | P2-17 production SLOs | — |
| LLM features with evals | — | — | — | E-01 precision/recall gate ⭐ |
| Craft (review, git, CI/CD, docs, estimation) | P0-01-1 explain it | P1-04-1 review it | P2-17 explain it | R-02: the owner estimates before grooming |

## Status log

| Date | Event |
| :-- | :-- |
| 2026-10-28 | P0-06 merged (#8). #9 (in review): P0-07 split into P0-07a (telemetry base) and P0-07b (River in worker mode and the trace from API to worker), owner-approved. Image budget raised to 40 MB (the OTLP exporters link gRPC). Trace context goes in job metadata, not args. The enqueue demo is a dev-only HTTP route. |
| 2026-10-28 | P0-05 merged (#7). P0-06 in review (#8): one Dockerfile (static binary on distroless nonroot, 17.56 MB), allowlist build context, compose `app` profile for migrate/api/worker/scheduler, `test:image` smoke test in `task check`, hadolint and Trivy in CI (ADR-0007). D-04 isn't needed for the image and stays due at P2-17. |
| 2026-10-28 | BP-002 merged (#6). P0-05 in review (#7): `proto/earlii/v1/health.proto`, connect-go v2 server with request-ID, access-log and recovery interceptors, generated TS client in `@earlii/api`, the web calls `Health` with a Connect GET, `buf lint`/`buf breaking`/stale-codegen checks (ADR-0006). |
| 2026-10-28 | P0-04 merged (#5). BP-002 in review: `lint:migrations` read main's files trimmed, so every PR and main itself failed `task check`; it now reads exact bytes. P0-05 in progress, stacked on it. |
| 2026-10-28 | BP-001 merged (#4). P0-04 in review (#5): compose stack, `earlii migrate` (River + goose under one advisory lock), sqlc into `gen/db`, Postgres readiness, DB integration tests in CI. D-07 and D-10 decided (ADR-0005). Starting River's client moved to P0-07, which needs it. |
| 2026-10-27 | P0-03 merged (#3). BP-001 in review (#4): `task dev:api` binds `127.0.0.1:8080` only. |
| 2026-10-27 | P0-02 merged (#2). P0-03 in review (#3): web skeleton, PWA manifest, the bundle budget gate. |
| 2026-10-27 | **Mode: build** (owner decision). The AI builds every item; each PR gets a private study guide with labs in `docs/learning/` (gitignored). The P0-02 drain is implemented in #2, and the old LEARN exercises were folded into the P0-01 and P0-02 guides. |
| 2026-10-27 | P0-01 merged (#1). P0-02 in review (#2): Go skeleton, config, probes, modes; the graceful drain is exercise P0-02-1 (stub + skipped tests). |
| 2026-10-27 | Review feedback on #1: TS path alias foundation (ADR-0004); section sign banned; SPEC and scaffold kept local; SCP-01, SCP-02 and SCP-03 approved. |
| 2026-10-27 | Kit generated. Mode: LEARN standard. API style: Connect RPC. P0-01 in review (#1); CI green on ubuntu and windows. |
