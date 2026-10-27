# POINTER: read this first

> The handoff file. Updated in every PR (CI enforces it). At most 80 lines. Keep these headings.

## State

- **Phase 0 · Bootstrap.** Mode: **LEARN standard** (switched 2026-10-27).
- `main` holds README + LICENSE. PR **#1** (P0-01 starter kit) is open and CI is green: ubuntu 20 s, windows 1 m 21 s, handoff 4 s.
- Works now: `task doctor`, `task check` (lint + script tests), git hooks (format, Conventional Commits, no AI trailers, no push to main), Claude Code hooks, skills and subagents, CI (Linux + Windows) and the handoff check.
- Review feedback on #1, applied:
  - the TS path alias `@/*` (ADR-0004), proven in tsc, Vitest, Vite dev and the production build;
  - the section sign banned at every layer;
  - SPEC and the scaffold gitignored;
  - SCP-01, SCP-02 and SCP-03 (Profile) approved.
- No product code yet. Go, web and DB tasks print `skip:` until P0-02, P0-03 and P0-04.

## FIX-FIRST QUEUE

_(empty)_

## NEXT UP

**P0-02 · Go skeleton: one binary, many modes** (ROADMAP section Phase 0)

- **Why now:** every later item needs a Go module, config, logging and graceful shutdown. It also turns the `skip:` Go tasks into real ones.
- **Start at:** `go.work` and `backend/go.mod` (module `github.com/devnadeemashraf/earlii/backend`), then `backend/cmd/earlii/main.go`. Add the gomod entry to `.github/dependabot.yml`.
- **Done when:** `earlii api` serves `/healthz` and `/readyz`; invalid config fails fast; SIGINT drains in under 10 s; `task check` runs real Go lint and tests on both CI OSes; HANDBOOK has the repo map and runtime flow for `backend/`.
- **LEARN:** the P0-02-1 exercise (graceful shutdown). The AI writes the stub and failing tests; the owner implements it.

## Open questions for the human

1. **Merge P0-01**, then enable branch protection on `main` (docs/SETUP.md section 5, one command).
2. **SPEC purge:** the PR branch history was rewritten without SPEC (owner-approved 2026-10-27). The owner force-pushes it, then asks GitHub Support to drop cached views of the old commits (docs/SETUP.md "Purging leaked files").
3. Optional: set `CONTEXT7_API_KEY` to enable the docs-lookup MCP (docs/AI_WORKFLOW.md).

## Environment notes and gotchas

- Windows 11 dev box. Claude Code hooks run in Git Bash; Task uses its own built-in shell, so Taskfile commands are POSIX-style everywhere.
- Tools come from `mise.toml`. Activate mise in PowerShell (docs/SETUP.md section 2), or prefix commands with `mise exec --`. If `task doctor` fails, a global Node or Go is probably shadowing mise.
- Biome 2.6 also formats Markdown and breaks YAML frontmatter, so `*.md` is excluded in `biome.json`. Don't remove that exclusion.
- `golangci-lint fmt <files>` formats only the files given (verified). The multi-module loops in `Taskfile.yml` (`go list -m`) are untested until P0-02: verify them there.
- CI sets `MISE_DISABLE_TOOLS` to skip installing gopls; `doctor` honours it.
- Dependabot's support for pnpm 12 lockfiles is UNVERIFIED. If its npm PRs fail, see R-01.
- `docs/SPEC.md` and `docs/project-scaffold-claude.md` are gitignored (private and local-only). Fresh clones and CI don't have SPEC. A test fails if either is ever tracked, and the Bash guard blocks `git add` of them. Note: `.gitignore` doesn't untrack a file that is already tracked.
- TS aliases: copy `scripts/test/fixtures/ts-alias/` (tsconfig `paths` + `resolve.tsconfigPaths`). Biome rejects `../` only under `apps/**/src` and `packages/**/src`.
- Biome rewrites unicode escapes in JS strings into literal characters. To refer to a banned character in code, use `String.fromCodePoint(0xa7)`.
- Biome's stdin mode exits 1 whenever it would change anything, so test lint rules on real files (see `ts-alias.test.mjs`).

## Learning

- **Current exercise:** P0-01-1 *explain it*: how the guards enforce policy (`docs/learning/exercises/P0-01-1-explain-pr-guards.md`). Status: open.
- **Next concept:** Go context cancellation and graceful shutdown (P0-02-1).
- **Overdue reviews:** none.

## Recent history

| PR | ID | Summary | Manual test? |
| :-- | :-- | :-- | :-- |
| #1 | P0-01 | Starter kit: docs, tooling, CI, hooks, AI harness, tooling research | yes: ROADMAP P0-01 🧪 |
| — | — | Initial commit: README + LICENSE (on main) | no |
