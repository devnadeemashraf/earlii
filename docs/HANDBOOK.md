# Earlii developer handbook

Updated incrementally, as part of every PR that changes what it describes. Sections for things not built yet say **(planned, <ID>)**.

## 1. Orientation

Earlii polls public company job boards, detects new roles within minutes, normalises them for India, and serves a personal feed and alerts. Read in this order: SPEC (`docs/SPEC.md`: what and why; **private, local-only and gitignored**, so it isn't on GitHub) → [ROADMAP](ROADMAP.md) (what's next) → [POINTER](POINTER.md) (where we are) → this handbook (how it works) → [CODING_STANDARDS](CODING_STANDARDS.md).

One person maintains everything, with AI help. Optimise for code that is easy to change, test and operate, not for code that is clever.

## 2. Glossary

| Term | Meaning |
| :-- | :-- |
| Board | One company's careers feed at one provider (e.g. a Greenhouse board token) |
| Provider | A job-board/ATS vendor with a public API (Greenhouse, Lever, …) |
| Connector | Code that reads one provider's public feed into raw postings |
| Posting | A job as published. It has a **stable ID** from the provider and **versions** keyed by content hash |
| First seen | When Earlii first saw a posting: the freshness clock |
| Region pack | Per-country data and rules: location tree, title/salary/experience rules, connector list |
| Enrichment | Per-posting-version LLM extraction, where every field has a verbatim evidence quote or "not stated" |
| Mode | The role a single `earlii` binary runs as: `api`, `worker` or `scheduler` |
| POINTER | `docs/POINTER.md`, the session handoff file |
| BP-xxx | A bug from an earlier PR, queued in POINTER's FIX-FIRST QUEUE |
| SCP-xx | A Spec change proposal (ROADMAP) |
| D-xx | An open or closed decision (ROADMAP section Decisions) |
| Study guide | The owner's private, per-PR explanation of a PR's concepts, code, internals and decisions, with labs (`docs/learning/`, gitignored, never committed) |

## 3. Repo map

```text
earlii/
├── AGENTS.md                 Agent instructions (single source); CLAUDE.md imports it
├── Taskfile.yml              Task runner: setup, doctor, check, fmt, lint, test, build:web, dev:api, dev:web(:lan), handoff
├── go.work                   Go workspace: lists every Go module (today only backend/)
├── mise.toml                 Tool version pins (local + CI)
├── lefthook.yml              Git hooks: format, secrets, commit-msg, pre-push
├── biome.json                TS/JS/JSON/CSS format + lint (Markdown excluded; Tailwind directives on)
├── .golangci.yml             Go lint + formatters (gofumpt, goimports)
├── package.json              pnpm workspace root: Biome, TypeScript, Vite, Vitest (exact pins)
├── tsconfig.base.json        Shared strict TS options; every TS project extends it and adds the @/* alias (ADR-0004)
├── pnpm-workspace.yaml       Workspace globs: apps/*, packages/*
├── scripts/                  Repo automation, zero dependencies, tested with node:test
│   ├── lib/                  Pure logic: conventional commits, guards, handoff, pins, shell parsing,
│   │                         bundle budget, app icon + PNG encoder
│   ├── claude/               Claude Code hook entry points (session-start, guard-bash, guard-edit, post-edit-format)
│   ├── test/                 Tests for all of the above, plus config-parsing tests
│   │   └── fixtures/ts-alias/ Reference TS project proving @/* in tsc, Vitest, Vite dev and build
│   ├── check-text.mjs        Banned-character scan (the section sign) for files and staged changes
│   ├── check-web-build.mjs   build:web: production build, stale route tree check, initial-JS budget
│   ├── render-icons.mjs      Regenerates the web app's PNG icons (a test fails if they're stale)
│   ├── doctor.mjs            Tool pin check
│   ├── handoff-check.mjs     POINTER/HANDBOOK rule (CI + local)
│   ├── commit-msg.mjs        commit-msg hook
│   └── pre-push-guard.mjs    pre-push hook
├── .claude/                  Claude Code: settings (hooks, permissions, attribution off), skills, subagents
├── .mcp.json                 MCP servers: gopls, playwright, context7 (optional)
├── .github/                  CI workflow, Dependabot, PR template
├── docs/                     Spec, roadmap, pointer, handbook, standards, versions, setup, ADRs
│   └── learning/             Private study guides and labs, one folder per PR (gitignored, never committed)
├── backend/                  Go module github.com/devnadeemashraf/earlii/backend
│   ├── cmd/earlii/           The one binary: mode dispatch, logger, signals (main.go)
│   └── internal/
│       ├── config/           Env-only config: parse, validate, fail fast with every error
│       ├── health/           /healthz (liveness) and /readyz (concurrent named checks)
│       └── httpserver/       Hardened http.Server (New) and graceful Serve (errgroup + Shutdown)
├── apps/web/                 The React PWA (P0-03): Vite, TanStack Router + Query, Tailwind, shadcn/ui
│   ├── index.html            Inline first-paint skeleton + critical CSS, manifest and theme-color links
│   ├── vite.config.ts        Plugins, the @/ alias, dev-server lock-down (fs, proxy), Vitest settings
│   ├── components.json       shadcn/ui config (aliases use @/)
│   ├── public/               manifest.webmanifest, icon.svg and the rendered PNG icons
│   └── src/
│       ├── main.tsx          Entry: builds the QueryClient and router, then mountApp
│       ├── mount.tsx         Loads the first route, then mounts React (no blank flash)
│       ├── router.ts         createAppRouter: route tree, context, pending and preload defaults
│       ├── routeTree.gen.ts  Generated by the router plugin; committed; never edited by hand
│       ├── routes/           File routes: __root.tsx (shell, not-found, root error), index.tsx (/)
│       ├── components/       App components (api-status) and ui/ (copied shadcn components)
│       └── lib/              api-status (the /readyz adapter), copy, query-client, router-context, utils
├── packages/                 (planned, P0-05 / P2-01) generated API client, design tokens
└── proto/                    (planned, P0-05) Protobuf contracts
```

## 4. Architecture

The architecture is set in ADRs: a **modular monolith** ([ADR-0003](adr/0003-modular-monolith-one-image.md)) built as one Go binary and one Docker image, running in several modes. Contracts are **Connect RPC + Protobuf** ([ADR-0002](adr/0002-connect-rpc-protobuf-contracts.md)).

```mermaid
flowchart LR
  subgraph Clients
    W[Web PWA] ---|Connect over HTTP| API
    M[Mobile app, later] ---|Connect| API
  end
  API[earlii api] --> PG[(Postgres)]
  SCH[earlii scheduler] -->|enqueue River jobs| PG
  WRK[earlii worker] -->|fetch, diff, normalise, enrich, notify| PG
  WRK -->|polite HTTP| JB[Public job boards]
  WRK -->|LLM, later| LLM[Model provider interface]
  API & WRK & SCH -->|OTLP| OBS[Grafana Cloud]
```

- **Module boundaries** (planned, P1-01 onward): `internal/<module>/` per bounded area (registry, connectors, pipeline, feed, alerts, auth). Modules talk through Go interfaces in-process, and never by reaching into another module's tables.
- **Async work** goes through River jobs on Postgres. That avoids a separate broker on free tiers.

## 5. Runtime flows

### Boot and shutdown (P0-02)

`earlii <mode>` (`api`, `worker` or `scheduler`) runs `run()` in `backend/cmd/earlii/main.go`:

1. **Args.** Anything other than exactly one known mode prints the usage line to stderr and exits **2**.
2. **Logger.** A JSON `slog` logger on stdout, with UTC timestamps and a `mode` attribute. It is built *before* config so config errors are JSON too; its level (`slog.LevelVar`) is set after config loads.
3. **Config.** `config.Load(os.Environ())` validates everything and reports every problem at once, naming variables but never echoing values. Invalid config logs one ERROR line and exits **1**.
4. **Signals.** `signal.NotifyContext` turns SIGINT/SIGTERM into a cancelled context. After the first signal the default handlers come back, so a second Ctrl-C kills the process at once.
5. **Serve.** Every mode listens on `EARLII_HTTP_ADDR` and serves `GET /healthz` (always 200 while the process runs) and `GET /readyz` (200 only if every check passes within 2 s; 503 with per-check `ok`/`fail`, details only in the logs). There are no checks yet: Postgres and River add theirs in P0-04. Worker and scheduler only serve probes until River arrives (P0-04).
6. **Drain.** `httpserver.Serve` runs two goroutines in an `errgroup`: one runs `srv.Serve`, the other waits for the signal (or a serving error) and calls `srv.Shutdown` with a fresh `EARLII_SHUTDOWN_TIMEOUT` budget. `Shutdown` stops accepting, closes idle keep-alive connections at once and waits for in-flight requests; if the budget runs out, `srv.Close` cuts off the rest and `Serve` returns an error wrapping `context.DeadlineExceeded`. Exit **0** on a clean stop, **1** on any serving error or forced close. `Shutdown` closes the listener first, so `/readyz` can't report "draining" to new probes. If a load balancer ever needs to deregister an instance before the drain, that takes a pre-stop delay (consider it in P0-06).

Every connection has limits (`internal/httpserver/server.go`): 5 s to read headers, 15 s to read the request, 15 s to write the response, 60 s idle, 64 KiB of headers. The global write timeout will cut off Connect server-streaming RPCs: streaming handlers must set their own deadline with `http.ResponseController` (P0-05).

### Configuration (environment only)

| Variable | Default | Rules |
| :-- | :-- | :-- |
| `EARLII_ENV` | **required** | `dev` or `prod`. Required, so prod never runs on dev defaults |
| `EARLII_HTTP_ADDR` | `:8080` | `host:port`; host empty, `localhost` or an IP; port 0 (random) is rejected in prod |
| `PORT` | none | Used as `:$PORT` only when `EARLII_HTTP_ADDR` is unset (Render sets it, default 10000) |
| `EARLII_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `EARLII_SHUTDOWN_TIMEOUT` | `8s` | Go duration, above 0 and at most 9 s, so the drain finishes before Docker's SIGKILL at 10 s |

An empty value counts as unset. A variable set twice fails the boot. Unknown `EARLII_*` variables (any case) fail the boot unless `EARLII_ENV=prod`, where they are logged as warnings instead, so rolling back to an older image never crash-loops on a variable added for a newer one.

### Web boot and the home route (P0-03)

1. **First paint, before JS.** `index.html` ships critical CSS and a static copy of the home skeleton inside `#root`, with the light/dark background matching `src/index.css` and the manifest. It has no inline scripts or `on*` attributes, so a strict CSP (`script-src 'self'`) can be added later.
2. **Load, then mount.** `main.tsx` creates the QueryClient (`createQueryClient`: one retry, and only for `network` and `timeout` failures) and the router, whose context carries `{ queryClient, api }`. `mountApp` awaits `router.load()` (logging, not blocking on, a rejected load) and only then calls `createRoot().render()`. A bare `RouterProvider` commits an empty tree before its first match exists, which would wipe the inline skeleton (a test proves it). So React's first commit already holds the route's content or error, and the provider reuses that load.
3. **The `/` route.** The loader runs `queryClient.ensureQueryData(apiStatusQuery(api))`, and the component reads the same entry with `useSuspenseQuery`. On later navigations the route's `pendingComponent` (the React skeleton) shows after 100 ms and stays at least 300 ms (`defaultPendingMs`/`defaultPendingMinMs`, a first guess to tune on a phone). Routes preload on intent.
4. **The adapter** (`src/lib/api-status.ts`) GETs `/readyz` with a 5 s timeout combined with Query's abort signal (`anySignal`, which falls back where `AbortSignal.any` is missing: Safari before 17.4, Chrome before 116) and `redirect: "error"`. Any status other than 200 or 503 fails without reading the body: a gateway 502 or 504 (the dev proxy when the API is down) as `network`, anything else as `http`. It reads at most 4 KB (a stalled body is cut off at the timeout), requires `application/json`, accepts only `[A-Za-z0-9_.-]` check names, and narrows the body to `ok` (200) or `degraded` (503 with a valid body, shown as content, not an error). Anything else becomes an `ApiStatusError` with a failure kind, and the UI shows fixed copy for each kind (`src/lib/copy.ts`), never server text. P0-05 swaps the fetch for the Connect Health client.
5. **Dev server.** `task dev:web` serves on localhost:5173, `task dev:web:lan` on the LAN for phone testing. Only `^/readyz$` is proxied, to `http://127.0.0.1:8080`. `server.fs.allow` is limited to the app and `node_modules`, and `fs.deny` adds the private docs to Vite's defaults; otherwise anyone on the Wi-Fi could read `docs/SPEC.md` through `/@fs/`. `allowedHosts` stays at its default (never `true`).

### Other flows

- Request path: web → Connect → handler → sqlc → Postgres (planned, P0-05)
- Fetch cycle: scheduler → River job → connector → change detection → normalisation (planned, P1-03 – P1-07)
- Alert fan-out: new posting → incremental match → digest/push (planned, P2-12, P2-13)

## 6. Data and content pipeline

(planned, P1-01 – P1-12) Registry → polite fetch → change detection (stable ID + content hash) → India normalisation → dedupe → (Beta) enrichment with evidence → matching.

## 7. Testing strategy

- **Repo scripts:** `node:test` in `scripts/test/`. Pure logic lives in `scripts/lib/`, so the rules are unit-tested without git. The CLIs are also tested end to end through `spawnSync`.
- **Go:** table-driven unit tests next to the code, external test packages (`package x_test`) so tests use only the public API. `task test:go` adds `-race` when cgo is on (Linux CI); the Windows dev box has no gcc, so it runs without. Server tests bind `127.0.0.1:0` and synchronise with channels, never sleeps. Coming next: integration tests against Postgres (P0-04, D-10), and connector fixtures with no live network in CI.
- **Web:** Vitest + Testing Library, jsdom by default; files that need Node (the `/readyz` adapter, the PWA contract, the dev server) start with `// @vitest-environment node`. Route tests render the real route tree with `createMemoryHistory`, a fake `api` in the router context and a QueryClient with `retry: false` (`createQueryClient`). The dev-server test boots the real Vite config and attacks it (`/@fs/`, traversal, a foreign Host). Playwright e2e for the key flows comes in P2-04 and P2-05.
- **Required paths for every change:** happy, sad, edge and abuser. See CODING_STANDARDS section Tests.

## 8. Performance budgets

The canonical budgets live in [ROADMAP section Budgets](ROADMAP.md#budgets). How each is measured is added here as each budget gets a gate (planned, P0-06, P2-03, P2-07).

- **Web initial JS** (gated since P0-03): `task build:web` (part of `task check`, before the tests so Vitest can't regenerate the route tree first) runs the app's Vite with Node (no shell) and `--manifest`, then `scripts/check-web-build.mjs` sums the gzip size (Node's default level) of the entry chunk and its static imports, transitively. Lazily loaded route chunks don't count. The manifest is deleted afterwards, so `dist/` doesn't ship it. It fails above 170 kB (1 kB = 1000 bytes, as Vite reports). It was about 113 kB at P0-03, almost all React, React DOM, TanStack Router and Query.

## 9. Security model

- **Agent guardrails** (built): hooks deny secret, generated and vendored edits and dangerous git/gh actions; SPEC and LICENSE edits need the human's approval; permission deny rules block reading `.env*`, keys and `secrets/`.
- **Secrets** live only in environment variables or a secret manager, never in the repo. gitleaks runs in pre-commit and CI.
- **Supply chain:** GitHub Actions are pinned by commit SHA and audited by zizmor; Dependabot opens monthly update PRs.
- **Web dev server** (P0-03): the LAN-exposed Vite server is locked to the app's files and `node_modules`, denies the private docs, rejects foreign Host headers, and proxies only `/readyz` (section 5, tested in `apps/web/src/dev-server.test.ts`). Server text never reaches the page: the UI maps failures to fixed copy, and React escapes everything it renders.
- Application auth, sessions, SSRF defences, HTML sanitisation, CSP and DPDP controls (planned, P1-11, P2-09, P2-10, P2-17, E-08).

## 10. Operations

(planned, P2-17) Deploys, backups, dashboards, alerts and runbooks.

## 11. How-to recipes

- **Run the API locally:** `task dev:api`, then `curl localhost:8080/readyz`. Ctrl-C drains and stops it; a second Ctrl-C kills it.
- **Run the web app:** `task dev:api` in one terminal and `task dev:web` in another, then open http://localhost:5173. On a phone, use `task dev:web:lan` and the printed Network URL (same Wi-Fi).
- **Add a route:** create `apps/web/src/routes/<path>.tsx` exporting `Route = createFileRoute("/<path>")({...})`. The router plugin regenerates `routeTree.gen.ts` whenever Vite or Vitest runs; commit it (`task build:web` fails if it's stale). Give the route a `pendingComponent` skeleton and an `errorComponent` with fixed copy. Keep files that aren't routes (tests too) out of `routes/`.
- **Add a shadcn component:** `cd apps/web && pnpm dlx shadcn@4.23.0 add <name>`. Review the copied code, point its `cn` import at `@/lib/utils` if the CLI changed it, pin any dependency it added exactly, and record new ones in VERSIONS.
- **Change the app icon:** edit `apps/web/public/icon.svg` and the same shapes in `scripts/lib/icons.mjs`, then run `node scripts/render-icons.mjs`.
- **Add a config variable:** add the key to `known` and parse it in `backend/internal/config/config.go`, with tests for valid, missing, malformed and abusive values. Document it in section 5 Configuration. Never echo the value in an error.
- **Start a session:** open Claude Code in the repo root. POINTER is injected automatically. Say "next PR" (`/next-pr`).
- **Add a tool:** pin it in `mise.toml`, add a probe in `scripts/lib/pins.mjs`, record it in `docs/VERSIONS.md`, then run `task doctor`.
- **Add a Claude hook:** put the logic in `scripts/lib/` with tests, keep the entry point thin in `scripts/claude/`, and register it in `.claude/settings.json`. `repo-config.test.mjs` checks the script exists.
- **Bypass the pre-push guard (human only, emergencies):** `EARLII_ALLOW_MAIN_PUSH=1 git push origin main`. Agents are blocked from using it.

## 12. Decision log

| ADR | Title | Status |
| :-- | :-- | :-- |
| [0001](adr/0001-toolchain-and-repo-automation.md) | Toolchain and repo automation (Task, mise, lefthook, Biome, golangci-lint, Node scripts) | Accepted |
| [0002](adr/0002-connect-rpc-protobuf-contracts.md) | Connect RPC + Protobuf contracts | Accepted |
| [0003](adr/0003-modular-monolith-one-image.md) | Modular monolith, one image, many modes | Accepted |
