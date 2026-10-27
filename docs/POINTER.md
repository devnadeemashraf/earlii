# POINTER: read this first

> The handoff file. Updated in every PR (CI enforces it). At most 80 lines. Keep these headings.

## State

- **Phase 0 · Bootstrap.** Mode: **build** (switched 2026-10-27): the AI builds every item; each PR gets a private study guide (AGENTS.md section 5).
- P0-01 is merged (#1). **P0-02 (Go skeleton) is in review as #2** on `feat/P0-02-go-skeleton`.
- Works now:
  - `earlii api|worker|scheduler`: config validated at boot, JSON `slog` in UTC, `/healthz` and `/readyz` in every mode;
  - graceful drain on SIGINT/SIGTERM (`httpserver.Serve`: errgroup + `Shutdown`, then `Close` at `EARLII_SHUTDOWN_TIMEOUT`), and a second Ctrl-C force-quits;
  - `task dev:api`;
  - real `fmt:go`, `lint:go` and `test:go` (with `-race` where cgo is on);
  - the gomod Dependabot entry.
- No web app, DB or contracts yet. The web and DB tasks print `skip:` until P0-03 and P0-04.

## FIX-FIRST QUEUE

_(empty)_

## NEXT UP

**P0-03 · Web skeleton** (ROADMAP section Phase 0)

- **Why now:** P0-05 (contracts) needs both ends: the Go server exists, so the web app is the missing half. It also turns `test:web` and `lint:types` into real tasks.
- **Start at:** `apps/web/`. Copy `scripts/test/fixtures/ts-alias/` for tsconfig and Vite (ADR-0004). Pin the candidates in docs/VERSIONS.md (React, TanStack Router and Query, Tailwind), re-verifying the versions first.
- **Done when:** the P0-03 acceptance list in ROADMAP is met. That means one route renders a skeleton then content, `test:web` runs for real, and there's a PWA manifest. 🧪 Open it on a phone over LAN.
- **Study:** file-based routing with codegen vs a hand-written route tree (in the P0-03 guide).

## Open questions for the human

1. **Enable branch protection** on `main` if you haven't yet (docs/SETUP.md section 5, one command).
2. **SPEC purge follow-up:** ask GitHub Support to drop cached views of the old P0-01 commits (docs/SETUP.md "Purging leaked files"), if not done.
3. **Hosting the worker (D-04):** Render's free tier has no background workers. A worker run as a free web service sleeps after 15 min idle, which would break polling. Decide before P0-06.
4. Optional: set `CONTEXT7_API_KEY` to enable the docs-lookup MCP (docs/AI_WORKFLOW.md).

## Environment notes and gotchas

- Windows 11 dev box. Claude Code hooks run in Git Bash; Task uses its own built-in shell, so Taskfile commands are POSIX-style everywhere.
- Tools come from `mise.toml`. Activate mise in PowerShell (docs/SETUP.md section 2), or prefix commands with `mise exec --`. **That includes `git commit`:** without mise on PATH, lefthook's `go-fmt` and `gitleaks` steps fail with "command not found".
- The multi-module loops in `Taskfile.yml` (`go list -m` over `go.work`) are verified on Windows, including `cd` into a `C:\...` path.
- No gcc on this box (`CGO_ENABLED=0`), so local Go tests run without `-race`. Both CI runners (Linux and Windows) run with it (verified on #2).
- Go test binaries take about 5–10 s per package to start on this box (probably antivirus scanning new executables). The tests themselves take milliseconds.
- gitleaks flags a line holding `api` next to a `KEY=value` literal. Split the line; don't allow-list it.
- golangci-lint's errcheck also flags an `error` received from a channel and dropped (`case <-errCh:`). Bind it and discard it explicitly.
- Biome 2.6 also formats Markdown and breaks YAML frontmatter, so `*.md` is excluded in `biome.json`. Don't remove that exclusion.
- CI sets `MISE_DISABLE_TOOLS` to skip installing gopls; `doctor` honours it.
- Dependabot's support for pnpm 12 lockfiles is UNVERIFIED. If its npm PRs fail, see R-01.
- `docs/SPEC.md`, `docs/project-scaffold-claude.md` and `docs/learning/` are gitignored (private, local-only). A test fails if any is ever tracked, and the Bash guard blocks `git add` of them. `.gitignore` alone does not untrack a file that is already tracked: use `git rm --cached`.
- TS aliases: copy `scripts/test/fixtures/ts-alias/`. Biome rejects `../` only under `apps/**/src` and `packages/**/src`. Biome rewrites unicode escapes in JS strings: use `String.fromCodePoint(0xa7)`.

## Learning

- **Private study guides** live in `docs/learning/` (gitignored: never `git add` it; the Bash guard denies it). Index and progress: `docs/learning/README.md`.
- **Latest:** P0-02 (Go skeleton) and P0-01 (starter kit). The P0-02 labs are a self-contained Go module: `cd docs/learning/P0-02-go-skeleton/labs && go test ./...`.
- **Next guide:** P0-03, written in that PR after `/handoff`.

## Recent history

| PR | ID | Summary | Manual test? |
| :-- | :-- | :-- | :-- |
| #2 | P0-02 | Go skeleton: modes, env config, JSON logs, health probes, hardened server, graceful drain; switch to build mode | yes: `task dev:api`, curl the probes, Ctrl-C |
| #1 | P0-01 | Starter kit: docs, tooling, CI, hooks, AI harness, tooling research | yes: ROADMAP P0-01 🧪 |
| — | — | Initial commit: README + LICENSE (on main) | no |
