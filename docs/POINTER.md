# POINTER: read this first

> The handoff file. Updated in every PR (CI enforces it). At most 80 lines. Keep these headings.

## State

- **Phase 0 · Bootstrap.** Mode: **LEARN standard** (switched 2026-10-27).
- `main` holds README + LICENSE. PR for **P0-01** (starter kit) is open on `chore/P0-01-starter-kit`.
- Works now: `task doctor`, `task check` (lint + script tests), git hooks (format, Conventional Commits, no AI trailers, no push to main), Claude Code hooks, skills and subagents, CI (Linux + Windows) and the handoff check.
- No product code yet. Go, web and DB tasks print `skip:` until P0-02, P0-03 and P0-04.

## FIX-FIRST QUEUE

_(empty)_

## NEXT UP

**P0-02 · Go skeleton: one binary, many modes** (ROADMAP §Phase 0)

- **Why now:** every later item needs a Go module, config, logging and graceful shutdown. It also turns the `skip:` Go tasks into real ones.
- **Start at:** `go.work` and `backend/go.mod` (module `github.com/devnadeemashraf/earlii/backend`), then `backend/cmd/earlii/main.go`. Add the gomod entry to `.github/dependabot.yml`.
- **Done when:** `earlii api` serves `/healthz` and `/readyz`; invalid config fails fast; SIGINT drains in under 10 s; `task check` runs real Go lint and tests on both CI OSes; HANDBOOK has the repo map and runtime flow for `backend/`.
- **LEARN:** the P0-02-1 exercise (graceful shutdown). The AI writes the stub and failing tests; the owner implements it.

## Open questions for the human

1. **Merge P0-01**, then enable branch protection on `main` (docs/SETUP.md §5, one command).
2. **SCP-01** (ROADMAP): Google-only sign-in for MVP, with magic link in Beta and phone OTP later? Approve or adjust.
3. **SCP-02:** may the agent edit the SPEC §3 wording to "Connect RPC" (you already picked it)?
4. Optional: set `CONTEXT7_API_KEY` to enable the docs-lookup MCP (docs/AI_WORKFLOW.md).

## Environment notes and gotchas

- Windows 11 dev box. Claude Code hooks run in Git Bash; Task uses its own built-in shell, so Taskfile commands are POSIX-style everywhere.
- Tools come from `mise.toml`. Activate mise in PowerShell (docs/SETUP.md §2), or prefix commands with `mise exec --`. If `task doctor` fails, a global Node or Go is probably shadowing mise.
- Biome 2.6 also formats Markdown and breaks YAML frontmatter, so `*.md` is excluded in `biome.json`. Don't remove that exclusion.
- `golangci-lint fmt <files>` formats only the files given (verified). The multi-module loops in `Taskfile.yml` (`go list -m`) are untested until P0-02: verify them there.
- CI sets `MISE_DISABLE_TOOLS` to skip installing gopls; `doctor` honours it.
- Dependabot's support for pnpm 12 lockfiles is UNVERIFIED. If its npm PRs fail, see R-01.
- `docs/project-scaffold-claude.md` is excluded locally via `.git/info/exclude` (your prompt file, not committed).

## Learning

- **Current exercise:** P0-01-1 *explain it*: how the guards enforce policy (`docs/learning/exercises/P0-01-1-explain-pr-guards.md`). Status: open.
- **Next concept:** Go context cancellation and graceful shutdown (P0-02-1).
- **Overdue reviews:** none.

## Recent history

| PR | ID | Summary | Manual test? |
| :-- | :-- | :-- | :-- |
| (open) | P0-01 | Starter kit: docs, tooling, CI, hooks, AI harness, tooling research | yes: ROADMAP P0-01 🧪 |
| — | — | Initial commit: README + LICENSE (on main) | no |
