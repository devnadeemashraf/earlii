# ADR-0001: Toolchain and repo automation

- **Status:** Accepted
- **Date:** 2026-10-27
- **Roadmap item:** P0-01
- **Deciders:** owner (via kit review)

## Context

The project is a Go + TypeScript monorepo developed on **Windows 11** by one person with AI agents, with CI on GitHub Actions (Linux and Windows). It needs:

- one command for everything CI runs;
- identical tool versions locally and in CI;
- git hooks for formatting, commit messages and push guards;
- policy enforcement for AI agents.

Every script must be tested (kit rule 4).

## Options considered

### Task runner
- **Make:** the default on Unix, but not installed on Windows, and shell differences (cmd vs sh) make recipes non-portable.
- **just:** pleasant syntax, but it runs recipes through an external shell (`sh` or PowerShell), so the same recipe behaves differently per OS.
- **Task:** YAML; ships an **embedded POSIX shell interpreter** (mvdan/sh), so one recipe runs identically on Windows and Linux. A single Go binary.

### Tool version pinning
- **README instructions + manual installs:** drift between machines and CI is guaranteed.
- **asdf:** no native Windows support.
- **mise:** native Windows support, one `mise.toml` for Go, Node, pnpm and the CLIs, and a first-party GitHub Action that reads the same file.

### Git hooks
- **husky:** Node-only, and needs `package.json` scripts.
- **pre-commit (Python):** a heavy runtime for a Go/TS repo.
- **lefthook:** a single Go binary; parallel jobs; `{staged_files}`; `stage_fixed`.

### JS/TS formatter and linter
- **ESLint + Prettier:** the richest plugin ecosystem, but two tools, slower, and lots of config.
- **Biome:** one binary for format + lint + import sorting, and fast. Its React rules cover hooks.

### Repo scripts (hooks, handoff check, doctor)
- **Bash:** fragile on Windows and hard to unit-test.
- **Go:** compiles per change; slower iteration for small scripts.
- **Node ESM with zero dependencies + `node:test`:** Node is already required, logic is unit-testable, and nothing needs installing.

## Decision

Use **Task + mise + lefthook + Biome + golangci-lint v2**, plus **zero-dependency Node scripts** whose pure logic lives in `scripts/lib/` and is tested with `node:test`. Claude Code hooks call the same logic as the git hooks and CI.

## Consequences

- Positive:
  - one pin file;
  - one task file;
  - identical behaviour on Windows and Linux (CI runs both);
  - every rule is unit-tested;
  - agents, git and CI enforce the same policy.
- Negative:
  - mise must be activated in the shell or global installs shadow it (doctor detects this);
  - Biome lacks some ESLint plugins (revisit if a needed rule is missing);
  - Biome 2.6 formats Markdown destructively for frontmatter, so `*.md` is excluded.
- Revisit if: Task's shell can't express a needed recipe, or Biome blocks a required lint rule.

## Verification

- `task doctor` and `task check` green on `ubuntu-latest` and `windows-latest` CI.
- `scripts/test/*.test.mjs` covers the guards, commit-msg, handoff, pins and the configs parsing.
