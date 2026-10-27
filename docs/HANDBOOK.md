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
| Decision story | An interview-ready write-up of a technical decision (`docs/learning/STORIES.md`) |

## 3. Repo map

```text
earlii/
├── AGENTS.md                 Agent instructions (single source); CLAUDE.md imports it
├── Taskfile.yml              Task runner: setup, doctor, check, fmt, lint, test, dev:api, handoff
├── go.work                   Go workspace: lists every Go module (today only backend/)
├── mise.toml                 Tool version pins (local + CI)
├── lefthook.yml              Git hooks: format, secrets, commit-msg, pre-push
├── biome.json                TS/JS/JSON/CSS format + lint (Markdown excluded)
├── .golangci.yml             Go lint + formatters (gofumpt, goimports)
├── package.json              pnpm workspace root: Biome, TypeScript, Vite, Vitest (exact pins)
├── tsconfig.base.json        Shared strict TS options; every TS project extends it and adds the @/* alias (ADR-0004)
├── pnpm-workspace.yaml       Workspace globs: apps/*, packages/*
├── scripts/                  Repo automation, zero dependencies, tested with node:test
│   ├── lib/                  Pure logic: conventional commits, guards, handoff, pins, shell parsing
│   ├── claude/               Claude Code hook entry points (session-start, guard-bash, guard-edit, post-edit-format)
│   ├── test/                 Tests for all of the above, plus config-parsing tests
│   │   └── fixtures/ts-alias/ Reference TS project proving @/* in tsc, Vitest, Vite dev and build
│   ├── check-text.mjs        Banned-character scan (the section sign) for files and staged changes
│   ├── doctor.mjs            Tool pin check
│   ├── handoff-check.mjs     POINTER/HANDBOOK rule (CI + local)
│   ├── commit-msg.mjs        commit-msg hook
│   └── pre-push-guard.mjs    pre-push hook
├── .claude/                  Claude Code: settings (hooks, permissions, attribution off), skills, subagents
├── .mcp.json                 MCP servers: gopls, playwright, context7 (optional)
├── .github/                  CI workflow, Dependabot, PR template
├── docs/                     Spec, roadmap, pointer, handbook, standards, versions, setup, ADRs, learning
├── backend/                  Go module github.com/devnadeemashraf/earlii/backend
│   ├── cmd/earlii/           The one binary: mode dispatch, logger, signals (main.go)
│   └── internal/
│       ├── config/           Env-only config: parse, validate, fail fast with every error
│       ├── health/           /healthz (liveness) and /readyz (concurrent named checks)
│       └── httpserver/       Hardened http.Server (New) and graceful Serve (EXERCISE P0-02-1)
├── apps/web/                 (planned, P0-03) React PWA
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
5. **Serve.** Every mode listens on `EARLII_HTTP_ADDR` and serves `GET /healthz` (always 200 while the process runs) and `GET /readyz` (200 only if every check passes within 2 s; 503 with per-check `ok`/`fail`, details only in the logs). The `shutdown` check fails as soon as the signal arrives. Worker and scheduler only serve probes until River arrives (P0-04).
6. **Drain.** `httpserver.Serve` stops accepting, drains in-flight requests for up to `EARLII_SHUTDOWN_TIMEOUT`, then force-closes. Exit **0** on a clean stop, **1** on any serving error. **Today `Serve` is the P0-02-1 exercise stub, which closes connections without draining.**

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

### Other flows

- Request path: web → Connect → handler → sqlc → Postgres (planned, P0-05)
- Fetch cycle: scheduler → River job → connector → change detection → normalisation (planned, P1-03 – P1-07)
- Alert fan-out: new posting → incremental match → digest/push (planned, P2-12, P2-13)

## 6. Data and content pipeline

(planned, P1-01 – P1-12) Registry → polite fetch → change detection (stable ID + content hash) → India normalisation → dedupe → (Beta) enrichment with evidence → matching.

## 7. Testing strategy

- **Repo scripts:** `node:test` in `scripts/test/`. Pure logic lives in `scripts/lib/`, so the rules are unit-tested without git. The CLIs are also tested end to end through `spawnSync`.
- **Go:** table-driven unit tests next to the code, external test packages (`package x_test`) so tests use only the public API. `task test:go` adds `-race` when cgo is on (Linux CI); the Windows dev box has no gcc, so it runs without. Server tests bind `127.0.0.1:0` and synchronise with channels, never sleeps. Coming next: integration tests against Postgres (P0-04, D-10), and connector fixtures with no live network in CI.
- **Web** (planned, P0-03): Vitest + Testing Library; Playwright e2e for the key flows (P2-04, P2-05).
- **Required paths for every change:** happy, sad, edge and abuser. See CODING_STANDARDS section Tests.

## 8. Performance budgets

The canonical budgets live in [ROADMAP section Budgets](ROADMAP.md#budgets). How each is measured is added here as each budget gets a gate (planned, P0-06, P2-03, P2-07).

## 9. Security model

- **Agent guardrails** (built): hooks deny secret, generated and vendored edits and dangerous git/gh actions; SPEC and LICENSE edits need the human's approval; permission deny rules block reading `.env*`, keys and `secrets/`.
- **Secrets** live only in environment variables or a secret manager, never in the repo. gitleaks runs in pre-commit and CI.
- **Supply chain:** GitHub Actions are pinned by commit SHA and audited by zizmor; Dependabot opens monthly update PRs.
- Application auth, sessions, SSRF defences, HTML sanitisation and DPDP controls (planned, P1-11, P2-09, P2-10, E-08).

## 10. Operations

(planned, P2-17) Deploys, backups, dashboards, alerts and runbooks.

## 11. How-to recipes

- **Run the API locally:** `task dev:api`, then `curl localhost:8080/readyz`. Ctrl-C drains and stops it; a second Ctrl-C kills it.
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
