# POINTER: read this first

> The handoff file. Updated in every PR (CI enforces it). At most 80 lines. Keep these headings.

## State

- **Phase 0 · Bootstrap.** Mode: **LEARN standard** (switched 2026-10-27).
- P0-01 is merged (#1). **P0-02 (Go skeleton) is in review as #2** on `feat/P0-02-go-skeleton`.
- Works now:
  - `earlii api|worker|scheduler`: config validated at boot, JSON `slog` in UTC, `/healthz` and `/readyz` in every mode, and a second Ctrl-C force-quits;
  - `task dev:api`;
  - real `fmt:go`, `lint:go` and `test:go` (with `-race` where cgo is on);
  - the gomod Dependabot entry.
- **Not yet: the graceful drain.** `httpserver.Serve` is the P0-02-1 exercise stub: it closes connections on the signal without draining. P0-02's "drains in-flight requests" criterion is met when the owner finishes P0-02-1. Its tests already exist and are skipped.
- No web app, DB or contracts yet. The web and DB tasks print `skip:` until P0-03 and P0-04.

## FIX-FIRST QUEUE

_(empty)_

## NEXT UP

**P0-03 · Web skeleton** (ROADMAP section Phase 0)

- **Why now:** P0-05 (contracts) needs both ends: the Go server exists, so the web app is the missing half. It also turns `test:web` and `lint:types` into real tasks.
- **Start at:** `apps/web/`. Copy `scripts/test/fixtures/ts-alias/` for tsconfig and Vite (ADR-0004). Pin the candidates in docs/VERSIONS.md (React, TanStack Router and Query, Tailwind), re-verifying the versions first.
- **Done when:** the P0-03 acceptance list in ROADMAP is met. That means one route renders a skeleton then content, `test:web` runs for real, and there's a PWA manifest. 🧪 Open it on a phone over LAN.
- **LEARN:** P0-03-1 *explain it*: file-based routing with codegen vs a hand-written route tree.

## Open questions for the human

1. **Enable branch protection** on `main` if you haven't yet (docs/SETUP.md section 5, one command).
2. **SPEC purge follow-up:** ask GitHub Support to drop cached views of the old P0-01 commits (docs/SETUP.md "Purging leaked files"), if not done.
3. **Hosting the worker (D-04):** Render's free tier has no background workers. A worker run as a free web service sleeps after 15 min idle, which would break polling. Decide before P0-06.
4. Optional: set `CONTEXT7_API_KEY` to enable the docs-lookup MCP (docs/AI_WORKFLOW.md).

## Environment notes and gotchas

- Windows 11 dev box. Claude Code hooks run in Git Bash; Task uses its own built-in shell, so Taskfile commands are POSIX-style everywhere.
- Tools come from `mise.toml`. Activate mise in PowerShell (docs/SETUP.md section 2), or prefix commands with `mise exec --`. **That includes `git commit`:** without mise on PATH, lefthook's `go-fmt` and `gitleaks` steps fail with "command not found".
- The multi-module loops in `Taskfile.yml` (`go list -m` over `go.work`) are verified on Windows, including `cd` into a `C:\...` path.
- No gcc on this box (`CGO_ENABLED=0`), so local Go tests run without `-race`. Linux CI runs with it. Whether `windows-latest` has cgo is UNVERIFIED: check the CI log for the "cgo is off" note.
- Go test binaries take about 5–10 s per package to start on this box (probably antivirus scanning new executables). The tests themselves take milliseconds.
- gitleaks flags a line holding `api` next to a `KEY=value` literal. Split the line; don't allow-list it.
- golangci-lint's errcheck also flags an `error` received from a channel and dropped (`case <-errCh:`). Bind it and discard it explicitly.
- Biome 2.6 also formats Markdown and breaks YAML frontmatter, so `*.md` is excluded in `biome.json`. Don't remove that exclusion.
- CI sets `MISE_DISABLE_TOOLS` to skip installing gopls; `doctor` honours it.
- Dependabot's support for pnpm 12 lockfiles is UNVERIFIED. If its npm PRs fail, see R-01.
- `docs/SPEC.md` and `docs/project-scaffold-claude.md` are gitignored (private, local-only). A test fails if either is ever tracked, and the Bash guard blocks `git add` of them.
- TS aliases: copy `scripts/test/fixtures/ts-alias/`. Biome rejects `../` only under `apps/**/src` and `packages/**/src`. Biome rewrites unicode escapes in JS strings: use `String.fromCodePoint(0xa7)`.

## Learning

- **Current exercises:**
  - P0-02-1 *implement*: graceful shutdown in `backend/internal/httpserver/serve.go` (`docs/learning/exercises/P0-02-1-graceful-shutdown.md`). Status: open. Start by setting `exerciseStarted = true` in `serve_test.go`.
  - P0-01-1 *explain it*: the PR guards. Status: open.
- **Next concept:** file-based routing and codegen (P0-03-1).
- **Overdue reviews:** none.

## Recent history

| PR | ID | Summary | Manual test? |
| :-- | :-- | :-- | :-- |
| #2 | P0-02 | Go skeleton: modes, env config, JSON logs, health probes, hardened server; drain is exercise P0-02-1 | yes: `task dev:api`, curl the probes, Ctrl-C |
| #1 | P0-01 | Starter kit: docs, tooling, CI, hooks, AI harness, tooling research | yes: ROADMAP P0-01 🧪 |
| — | — | Initial commit: README + LICENSE (on main) | no |
