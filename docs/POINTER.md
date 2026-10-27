# POINTER: read this first

> The handoff file. Updated in every PR (CI enforces it). At most 80 lines. Keep these headings.

## State

- **Phase 0 · Bootstrap.** Mode: **build** (switched 2026-10-27): the AI builds every item; each PR gets a private study guide (AGENTS.md section 5).
- P0-01 to P0-04 and BP-001 (#1 to #5) are merged. **BP-002 (#6) is in review** (main's CI is red until it merges). **P0-05 (Protobuf + Connect) is in review**, stacked on #6: merge #6 first.
- Works now:
  - Go: `earlii api|worker|scheduler|migrate`, env config (`EARLII_DATABASE_URL` required; prod demands verify-full/verify-ca TLS), JSON `slog`, `/healthz` + `/readyz` (a `postgres` check, shared and cached 1 s), graceful drain, `task dev:api` (loopback only: `127.0.0.1:8080`);
  - DB: `task dev` (compose Postgres 18 + Grafana/OTLP, migrate, API, web); `earlii migrate` applies River's 8 migrations then ours (goose, embedded) under one advisory lock (ADR-0005); sqlc into `backend/gen/db` (`task gen`); `lint:migrations` enforces forward-only; DB integration tests run locally with the stack up and in CI's `integration` job;
  - contracts (ADR-0006): `proto/earlii/v1/health.proto`; `task gen` (buf, local plugins) into `backend/gen/api` and `packages/api` (`@earlii/api`); `lint:proto` (buf lint + breaking vs main), `lint:gen` (stale output); connect-go v2 server in `api` mode with request-ID, access-log and recovery interceptors;
  - web: `apps/web` (Vite 8, React 19, TanStack Router file routes + Query, Tailwind 4, shadcn/ui); `/` shows an inline HTML skeleton, then the API status from `HealthService.Check` (generated client, Connect GET, via the dev proxy), with not-found and error states with retry;
  - a PWA manifest with SVG, 192/512, maskable and Apple icons (rendered by `scripts/render-icons.mjs`); no service worker yet;
  - `task dev:web` (localhost) and `task dev:web:lan` (phone); the dev server is locked down (fs allow/deny, Host check, one exact proxied procedure);
  - `task check` now runs `build:web`: the production build, a stale route tree check and the initial-JS budget (144.92 kB of 170 kB gzip; Connect added 31.99 kB).
- No tables yet (P1-01). River's client isn't started yet (P0-07).

## FIX-FIRST QUEUE

- **BP-002** (in review, #6): `lint:migrations` reported every migration on main as "changed after merge", so `task check` has failed on main and on every branch since #5. Evidence: CI run for 48525ab (both check legs); `scripts/check-migrations.mjs:30` read main's files through `git()`, which trims stdout and drops the final newline. Fix: `showFile` returns exact bytes; covered end to end by `scripts/test/check-migrations.test.mjs`.

## NEXT UP

**P0-06 · One image, many containers** (ROADMAP section Phase 0), once #6 and P0-05 are merged.

- **Why now:** every mode already runs from one binary; deploys (D-04) and the P0-07 trace demo need it containerised.
- **Start at:** a multi-stage Dockerfile building a static `CGO_ENABLED=0` binary, compose services `api`, `worker`, `scheduler` on that image, hadolint + Trivy in CI. Decide D-04 (open question 3) first.
- **Done when:** the P0-06 acceptance list in ROADMAP is met (image at most 30 MB, CI smoke test hits `/healthz`).
- **Study:** P0-06-1, explain each image layer and get under budget.

## Open questions for the human

1. **Make `integration` a required check** on the `protect-main` ruleset (#5 adds the job; today 3 checks are required).
2. **SPEC purge follow-up:** ask GitHub Support to drop cached views of the old P0-01 commits (docs/SETUP.md "Purging leaked files"), if not done.
3. **Hosting the worker and DB (D-04):** prod config requires a certificate-verifying `sslmode` and `earlii migrate` needs a direct (non-pooled) connection; check Render supports both (VERSIONS UNVERIFIED). Render's free tier has no background workers. A worker run as a free web service sleeps after 15 min idle, which would break polling. Decide before P0-06.
4. **npm supply-chain settings:** pnpm 12 supports an explicit build-script allowlist (`allowBuilds`); its minimum release age is on by default (P0-05 hit it: connect-es 2.3.0 was a day old, so 2.2.0 is pinned, with no exclusion). Pin the age explicitly in `pnpm-workspace.yaml` in a small chore PR (R-01)?
5. Optional: set `CONTEXT7_API_KEY` to enable the docs-lookup MCP (docs/AI_WORKFLOW.md). Optional: `npx playwright install chrome` so the Playwright MCP (`/snapshot`) can run; it isn't installed on this box.

## Environment notes and gotchas

- The `protect-main` ruleset is active (PR-only, squash, 3 required checks; verified 2026-10-27 with `gh api repos/devnadeemashraf/earlii/rulesets`).
- Windows 11 dev box. Claude Code hooks run in Git Bash; Task uses its own built-in shell, so Taskfile commands are POSIX-style everywhere.
- Tools come from `mise.toml`. Activate mise in PowerShell (docs/SETUP.md section 2), or prefix commands with `mise exec --`. **That includes `git commit`:** without mise on PATH, lefthook's `go-fmt` and `gitleaks` steps fail with "command not found".
- No gcc on this box (`CGO_ENABLED=0`), so local Go tests run without `-race`; both CI runners run with it. Go test binaries take 5–10 s per package to start here (probably antivirus); the tests take milliseconds.
- gitleaks flags a line holding `api` next to a `KEY=value` literal: split the line. golangci-lint's errcheck flags a dropped `error` from a channel (`case <-errCh:`): bind and discard it.
- Biome 2.6 also formats Markdown and breaks YAML frontmatter, so `*.md` is excluded in `biome.json`. It parses Tailwind CSS only with `css.parser.tailwindDirectives` (on).
- CI sets `MISE_DISABLE_TOOLS` to skip installing gopls; `doctor` honours it. Dependabot's support for pnpm 12 lockfiles is UNVERIFIED (see R-01).
- `docs/SPEC.md`, `docs/project-scaffold-claude.md` and `docs/learning/` are gitignored (private, local-only). A test fails if any is tracked, and the Bash guard blocks `git add` of them. The Vite dev server denies them too.
- TS aliases: copy `scripts/test/fixtures/ts-alias/`. Biome rejects `../` only under `apps/**/src` and `packages/**/src`. Biome rewrites unicode escapes in JS strings: use `String.fromCodePoint(0xa7)`.
- Web: `routeTree.gen.ts` is regenerated whenever Vite or Vitest runs. Commit it with any route change (`build:web` fails if it's stale). Don't put non-route files in `src/routes/`. Vitest's jsdom AbortSignal isn't accepted by Node's fetch: test fetch code with `// @vitest-environment node`.
- shadcn CLI 4.23.0: `init` hangs on a preset prompt without `--preset`, and swaps `cn()` to a third-party package. Use `add` only, and review what it copies (HANDBOOK section 11).
- Tests must never depend on the gitignored private files (SPEC, `docs/learning/`): CI has none, and a missing file can pass or fail for the wrong reason (P0-03 CI run 1). Plant look-alike fixtures instead, as `apps/web/src/dev-server.test.ts` does.
- Windows lets a second process bind `127.0.0.1:8080` while another holds `0.0.0.0:8080`, so a stale `task dev:api` keeps serving the Wi-Fi with no "address in use" error. Check `netstat -ano | grep :8080` before trusting a bind.
- **Task lets the shell's environment win over a task's `env:` block.** Tasks that run the binary set variables inline (`KEY=value go run ...`); a test enforces it.
- Postgres: `pg_isready` without `-h` probes the unix socket, which the image's first-run init serves before restarting. Health checks use `-h 127.0.0.1`. The Windows box's Docker Desktop needs starting before `task dev`.
- slog's JSON handler encodes nested structs with `encoding/json`, ignoring `String`/`LogValue` on fields: `config.Secret` also implements `MarshalText`.
- connect-go is **v2** (`connectrpc.com/connect/v2`): agents remember v1's API (`connect.Request[T]`, `NewXxxHandler`). Check every call with `go doc` (ADR-0006). wrapcheck needs `connect(/v2)?` in its signature regexps.
- A Claude `Edit`/`Write` can turn a `\u202e`-style escape into the raw character; build such test strings at runtime (`string(rune(0x202e))`, `String.fromCodePoint`).
- `scripts/lib/git.mjs` `git()` trims stdout: fine for refs and lists, wrong for file contents. Read files at a commit with `showFile` (BP-002).
- In Node scripts, `String.replace(a, b)` treats `` $` ``, `$'` and `$&` in `b` as patterns, which bites when `b` is Markdown with backticks. Pass `() => b`.

## Learning

- **Private study guides** live in `docs/learning/` (gitignored: never `git add` it; the Bash guard denies it). Index and progress: `docs/learning/README.md`.
- **Latest:** P0-05 (`docs/learning/P0-05-contracts-connect/`), then BP-002, P0-04, BP-001, P0-03, P0-02, P0-01. Labs: `cd docs/learning/<ID>-<slug>/labs` and follow its README.
- **Next guide:** P0-06, written in that PR after `/handoff`.

## Recent history

| PR | ID | Summary | Manual test? |
| :-- | :-- | :-- | :-- |
| P0-05 PR | P0-05 | `health.proto`, buf lint/breaking/stale-codegen checks, connect-go v2 server (request ID, access log, recovery; 64 KiB cap; protocol marker required), shared cached readiness `Checker`, `@earlii/api` TS client, web calls `Health` by Connect GET through a guarded fetch (ADR-0006) | yes: `task dev`, open http://localhost:5173 (status card), `task dev:down`, reload (degraded card), and see the `rpc` log line |
| #6 | BP-002 | `lint:migrations` reads main's migrations byte-exact (`showFile`), fixing a false "changed after merge" that turned main red; end-to-end CLI test | no |
| #5 | P0-04 | Compose stack (Postgres 18, otel-lgtm; loopback only), `earlii migrate` (River then goose under one advisory lock), sqlc into `gen/db`, Postgres readiness, strict DB URL config, forward-only lint, DB integration tests in CI (ADR-0005) | yes: `task dev`, curl `127.0.0.1:8080/readyz` (200), `task dev:down`, curl again (503) |
| #4 | BP-001 | `task dev:api` binds `127.0.0.1:8080` only; a test keeps it equal to the web dev proxy target | yes: `task dev:api`, curl `127.0.0.1:8080/readyz` (200) and `<LAN IP>:8080/readyz` (refused) |
| #3 | P0-03 | Web skeleton: Vite/React/TanStack/Tailwind/shadcn, skeleton then content, PWA manifest, locked-down dev server, bundle gate | yes: `task dev:api` + `task dev:web:lan`, open on a phone |
| #2 | P0-02 | Go skeleton: modes, env config, JSON logs, health probes, hardened server, graceful drain; switch to build mode | yes: `task dev:api`, curl the probes, Ctrl-C |
| #1 | P0-01 | Starter kit: docs, tooling, CI, hooks, AI harness, tooling research | yes: ROADMAP P0-01 🧪 |
