# POINTER: read this first

> The handoff file. Updated in every PR (CI enforces it). At most 80 lines. Keep these headings.

## State

- **Phase 0 · Bootstrap.** Mode: **build** (switched 2026-10-27): the AI builds every item; each PR gets a private study guide (AGENTS.md section 5).
- P0-01 (#1) and P0-02 (#2) are merged. **P0-03 (web skeleton) is in review as #3** on `feat/P0-03-web-skeleton`.
- Works now:
  - Go: `earlii api|worker|scheduler`, env config, JSON `slog`, `/healthz` + `/readyz`, graceful drain, `task dev:api`;
  - web: `apps/web` (Vite 8, React 19, TanStack Router file routes + Query, Tailwind 4, shadcn/ui); `/` shows an inline HTML skeleton, then the API status from `/readyz` (via the dev proxy), with not-found and error states with retry;
  - a PWA manifest with SVG, 192/512, maskable and Apple icons (rendered by `scripts/render-icons.mjs`); no service worker yet;
  - `task dev:web` (localhost) and `task dev:web:lan` (phone); the dev server is locked down (fs allow/deny, Host check, one proxied path);
  - `task check` now runs `build:web`: the production build, a stale route tree check and the initial-JS budget (about 113 kB of 170 kB gzip).
- No DB or contracts yet. The DB tasks arrive in P0-04.

## FIX-FIRST QUEUE

- **BP-001 · `task dev:api` listens on every interface.** `defaultHTTPAddr = ":8080"` (`backend/internal/config/config.go:37`), and `dev:api` in `Taskfile.yml` doesn't override it, so anyone on the same Wi-Fi can reach the dev API directly. Today it only serves the probes, but every handler added later is exposed too. The web dev proxy targets `127.0.0.1:8080`, so the fix is `EARLII_HTTP_ADDR: 127.0.0.1:8080` in `dev:api`'s env, plus a HANDBOOK note. Keep the `:8080` default: containers need all interfaces (P0-06). Found by the P0-03 red-team.

## NEXT UP

**P0-04 · Local stack, migrations, sqlc** (ROADMAP section Phase 0), once the FIX-FIRST QUEUE is empty.

- **Why now:** P0-05's Health RPC and everything in Phase 1 need Postgres and River. P0-04 also turns `/readyz` into a real check.
- **Start at:** decide D-07 (migration tool; working assumption goose) and D-10 (DB integration tests; working assumption a CI service container) in the design step, with ADRs. Re-verify the candidates in VERSIONS (River was released the same day it was checked).
- **Done when:** the P0-04 acceptance list in ROADMAP is met (`compose.yaml`, `task dev`, forward-only migrations, River's migrations, `sqlc.yaml` into `gen/`, DB integration tests in CI).
- **Study:** an ADR on migration strategy (expand/contract, forward-only, locking), in the P0-04 guide.

## Open questions for the human

1. **SPEC purge follow-up:** ask GitHub Support to drop cached views of the old P0-01 commits (docs/SETUP.md "Purging leaked files"), if not done.
2. **Hosting the worker (D-04):** Render's free tier has no background workers. A worker run as a free web service sleeps after 15 min idle, which would break polling. Decide before P0-06.
3. **npm supply-chain settings:** pnpm 12 supports an explicit build-script allowlist (`allowBuilds`) and a minimum release age for new versions. Neither is set in `pnpm-workspace.yaml`. Worth a small chore PR (R-01)? No P0-03 dependency needed a build script.
4. Optional: set `CONTEXT7_API_KEY` to enable the docs-lookup MCP (docs/AI_WORKFLOW.md). Optional: `npx playwright install chrome` so the Playwright MCP (`/snapshot`) can run; it isn't installed on this box.

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
- In Node scripts, `String.replace(a, b)` treats `` $` ``, `$'` and `$&` in `b` as patterns, which bites when `b` is Markdown with backticks. Pass `() => b`.

## Learning

- **Private study guides** live in `docs/learning/` (gitignored: never `git add` it; the Bash guard denies it). Index and progress: `docs/learning/README.md`.
- **Latest:** P0-03 (web skeleton), P0-02 (Go skeleton), P0-01 (starter kit). Labs: `cd docs/learning/<ID>-<slug>/labs` and follow its README.
- **Next guide:** P0-04, written in that PR after `/handoff`.

## Recent history

| PR | ID | Summary | Manual test? |
| :-- | :-- | :-- | :-- |
| #3 | P0-03 | Web skeleton: Vite/React/TanStack/Tailwind/shadcn, skeleton then content, PWA manifest, locked-down dev server, bundle gate | yes: `task dev:api` + `task dev:web:lan`, open on a phone |
| #2 | P0-02 | Go skeleton: modes, env config, JSON logs, health probes, hardened server, graceful drain; switch to build mode | yes: `task dev:api`, curl the probes, Ctrl-C |
| #1 | P0-01 | Starter kit: docs, tooling, CI, hooks, AI harness, tooling research | yes: ROADMAP P0-01 🧪 |
