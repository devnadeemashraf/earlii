# Versions and verified facts

Every version and external fact the project relies on, with the date it was verified and its source. **Pins** are what `mise.toml`, `package.json` and (later) `go.mod` actually use. **Candidates** are verified-latest versions for upcoming items: re-verify when the item starts. **UNVERIFIED** entries must be checked before anything relies on them.

## Pinned tools (enforced by `task doctor`)

| Tool | Version | Verified | Source |
| :-- | :-- | :-- | :-- |
| Go | 1.27.3 | 2026-10-27 | https://go.dev/dl/?mode=json (latest stable) |
| Node.js | 24.22.1 (LTS "Krypton") | 2026-10-27 | https://nodejs.org/dist/index.json (latest LTS) |
| pnpm | 12.15.0 | 2026-10-27 | `npm view pnpm version` |
| Task | 3.54.0 | 2026-10-27 | https://github.com/go-task/task/releases (v3.54.0, 2026-10-01) |
| lefthook | 2.2.2 | 2026-10-27 | https://github.com/evilmartians/lefthook/releases (v2.2.2, 2026-10-13) |
| golangci-lint | 2.15.0 | 2026-10-27 | https://github.com/golangci/golangci-lint/releases (v2.15.0, 2026-10-16) |
| gitleaks | 8.30.1 | 2026-10-27 | https://github.com/gitleaks/gitleaks/releases (v8.30.1) |
| actionlint | 1.7.12 | 2026-10-27 | https://github.com/rhysd/actionlint/releases (v1.7.12) |
| zizmor | 1.31.1 | 2026-10-27 | https://github.com/zizmorcore/zizmor/releases (v1.31.1, 2026-10-15) |
| gopls | 0.24.0 | 2026-10-27 | https://github.com/golang/tools/releases (gopls/v0.24.0); `gopls mcp` subcommand confirmed via `gopls mcp -h` |
| Biome | 2.6.3 | 2026-10-27 | `npm view @biomejs/biome version` |
| TypeScript | 7.0.2 | 2026-10-27 | `npm view typescript version`. Native compiler; `tsc` works with `paths` without `baseUrl` (verified on the alias fixture) |
| Vite | 8.3.5 | 2026-10-27 | `npm view vite version` |
| Vitest | 5.0.5 | 2026-10-27 | `npm view vitest version`. Runs on Vite 8 config; verified on the alias fixture |
| mise (installer, not pinned) | 2026.10.20 latest; 2026.10.19 installed locally | 2026-10-27 | https://github.com/jdx/mise/releases |

## Pinned GitHub Actions (by commit SHA)

| Action | Tag | SHA | Verified |
| :-- | :-- | :-- | :-- |
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-10-27 via `gh api repos/actions/checkout/git/ref/tags/v7.0.1` |
| jdx/mise-action | v5.2.3 | `82a612c5ab8bcda7cc5db6b7e81a8e7584c3dc6e` | 2026-10-27 via `gh api repos/jdx/mise-action/git/ref/tags/v5.2.3` |

## Pinned Go modules (`backend/go.mod`)

| Module | Version | Verified | Source |
| :-- | :-- | :-- | :-- |
| Go directive | 1.27.3 (matches `mise.toml`) | 2026-10-27 | `go mod init` with the pinned toolchain |
| _(no third-party modules yet: the standard library covers P0-02)_ | | | |

## Candidate versions (verified latest; pin when the item starts)

| Package | Latest | For | Verified | Source |
| :-- | :-- | :-- | :-- | :-- |
| golang.org/x/sync (errgroup) | v0.24.0 | P0-02-1 exercise (the owner adds it with `go get`) | 2026-10-27 | `go list -m -json golang.org/x/sync@latest` (published 2026-09-23); verified against the exercise tests |
| buf | 1.75.0 | P0-05 | 2026-10-27 | `mise latest buf`; GitHub releases |
| connect-go | v2.0.2 (`connectrpc.com/connect/v2`) | P0-05 | 2026-10-27 | `go list -m connectrpc.com/connect/v2@latest`. Note: v1 is still `connectrpc.com/connect` v1.21.1. Pick deliberately |
| google.golang.org/protobuf | v1.36.12 | P0-05 | 2026-10-27 | Go module proxy |
| @connectrpc/connect, connect-web | 2.2.0 | P0-05 | 2026-10-27 | npm registry |
| @bufbuild/protobuf, protoc-gen-es | 2.16.0 | P0-05 | 2026-10-27 | npm registry |
| sqlc | 1.31.1 | P0-04 | 2026-10-27 | GitHub releases; Go module proxy |
| River | v0.50.0 | P0-04 | 2026-10-27 | Go module proxy; released 2026-10-27 (same day: let it settle) |
| pgx | v5.11.0 | P0-04 | 2026-10-27 | Go module proxy |
| goose | v3.29.0 | P0-04 (D-07) | 2026-10-27 | Go module proxy |
| PostgreSQL image | 18.6 (`postgres:18-alpine`) | P0-04 | 2026-10-27 | Docker Hub tags API |
| grafana/otel-lgtm | v0.38.1 | P0-04 | 2026-10-27 | GitHub releases |
| OpenTelemetry Go | v1.47.0 | P0-07 | 2026-10-27 | Go module proxy |
| React | 19.3.1 | P0-03 | 2026-10-27 | npm registry |
| @tanstack/react-router | 1.170.46 | P0-03 | 2026-10-27 | npm registry |
| @tanstack/react-query | 5.105.0 | P0-03 | 2026-10-27 | npm registry |
| Tailwind CSS | 4.3.3 | P0-03 | 2026-10-27 | npm registry |
| motion | 14.6.0 | P2-02 | 2026-10-27 | npm registry |
| Expo | 58.0.19 | E-07 | 2026-10-27 | npm registry |
| React Native | 0.88.0 | E-07 | 2026-10-27 | npm registry |
| react-native-reanimated | 4.7.1 | E-07 | 2026-10-27 | npm registry |
| NativeWind | 4.2.7 | E-07 | 2026-10-27 | npm registry |
| Gemini Go SDK (`google.golang.org/genai`) | v1.76.0 | E-01 | 2026-10-27 | Go module proxy |
| @playwright/mcp | 0.0.83 | `.mcp.json` | 2026-10-27 | npm registry (pinned in `.mcp.json`) |

## Verified facts

| Fact | Verified | Source |
| :-- | :-- | :-- |
| GitHub rulesets work on **public** repos on GitHub Free; private repos need Pro/Team/Enterprise | 2026-10-27 | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets |
| This repo (`devnadeemashraf/earlii`) is **public** | 2026-10-27 | `gh repo view --json visibility` |
| Render free Postgres expires **30 days** after creation (14-day grace, then deleted); 1 GB; one free DB per workspace | 2026-10-27 | https://render.com/docs/free |
| Render free web services spin down after 15 min idle (about 1 min to wake); 750 free instance-hours/month per workspace | 2026-10-27 | https://render.com/docs/free |
| Gemini API **free tier** content may be used to improve Google products; the **paid tier** is not | 2026-10-27 | https://ai.google.dev/pricing (pricing table: "Used to improve our products") |
| Claude Code `attribution` setting: `commit: ""` and `pr: ""` hide attribution; `sessionUrl: false` drops session links | 2026-10-27 | https://code.claude.com/docs/en/settings-reference (attribution) |
| Claude Code hooks: JSON on stdin; PreToolUse `hookSpecificOutput.permissionDecision` = allow/deny/ask; SessionStart `additionalContext`; hooks run in Git Bash on Windows when installed | 2026-10-27 | https://code.claude.com/docs/en/hooks |
| `CLAUDE.md` can import files with `@path`; if a CLAUDE.md exists, AGENTS.md is only read through such an import | 2026-10-27 | https://code.claude.com/docs/en/memory |
| `.mcp.json` supports `${VAR}` and `${VAR:-default}` expansion | 2026-10-27 | https://code.claude.com/docs/en/mcp |
| Context7 remote MCP: `https://mcp.context7.com/mcp`, API key via `Authorization: Bearer` | 2026-10-27 | https://github.com/upstash/context7 README |
| `golangci-lint fmt <file>` formats only the named files | 2026-10-27 | Local test with v2.15.0 |
| Biome 2.6 formats Markdown and inserts a blank line after the opening `---` of frontmatter (breaks skills/agents) | 2026-10-27 | Observed locally; `*.md` excluded in `biome.json` |
| Biome 2.6: `linter.rules.recommended` is deprecated in favour of `linter.rules.preset` | 2026-10-27 | Biome deprecation diagnostic; `configuration_schema.json` |
| Vite 8 resolves tsconfig `paths` natively with `resolve.tsconfigPaths: true` (default `false`); no plugin needed | 2026-10-27 | `node_modules/vite/dist/node/index.d.ts` (`ResolveOptions.tsconfigPaths`); proven by `scripts/test/ts-alias.test.mjs` |
| Biome 2.6 `style/noRestrictedImports` supports gitignore-style `patterns` (used to ban `../` imports) | 2026-10-27 | `configuration_schema.json` (`PatternOptions.group`); proven by `scripts/test/ts-alias.test.mjs` |
| `docker stop` waits **10 s** after SIGTERM before SIGKILL on Linux containers (the daemon sets the default); hence `EARLII_SHUTDOWN_TIMEOUT` is at most 9 s | 2026-10-27 | https://docs.docker.com/reference/cli/docker/container/stop/ |
| Render web services: `PORT` defaults to **10000**; the server must bind host `0.0.0.0` | 2026-10-27 | https://render.com/docs/web-services |
| Render deploys send SIGTERM and wait **30 s** by default (up to 300 s, `maxShutdownDelaySeconds`; not customisable with a persistent disk) before SIGKILL | 2026-10-27 | https://render.com/docs/deploys |
| Go on Windows: with `signal.Notify`, CTRL_CLOSE_EVENT, CTRL_LOGOFF_EVENT and CTRL_SHUTDOWN_EVENT arrive as `syscall.SIGTERM`; Ctrl-C arrives as `os.Interrupt` | 2026-10-27 | `go doc os/signal` (Go 1.27.3) |
| `signal.NotifyContext`: `context.Cause` on the returned context describes the signal | 2026-10-27 | `go doc os/signal.NotifyContext` (Go 1.27.3) |
| `http.Server.Shutdown` closes listeners, then idle connections, then waits for active ones until its ctx expires; `Close` cuts all non-hijacked connections at once | 2026-10-27 | `go doc net/http.Server.Shutdown`, `go doc net/http.Server.Close` (Go 1.27.3) |
| The Go race detector needs cgo; this Windows dev box has `CGO_ENABLED=0` (no gcc), so `task test:go` adds `-race` only when cgo is on. Both CI runners (`ubuntu-latest`, `windows-latest`) have cgo on and run with `-race` | 2026-10-27 | `go env CGO_ENABLED` locally; PR #2 CI logs (no "cgo is off" note on either job) |
| gitleaks 8.30.1 `generic-api-key` flags a line holding the word `api` and a `KEY=value` string literal on the same line. Split the line rather than allow-listing | 2026-10-27 | `gitleaks git --staged -v` locally |

## UNVERIFIED (check before relying on them)

| Claim | How to check |
| :-- | :-- |
| Grafana Cloud free tier: ~10k active metric series, 50 GB logs/traces, 14-day retention (secondary sources only) | https://grafana.com/pricing, at P0-07 / P2-17 |
| India commercial SMS requires TRAI DLT sender/template registration (affects SCP-01 phone OTP) | TRAI / SMS-provider documentation, before any phone-OTP work |
| Dependabot supports pnpm 12 lockfiles | Watch the first monthly Dependabot run; see the Insights → Dependency graph → Dependabot tab |
| Greenhouse Job Board API and Lever Postings API: public access and terms allow polling | The official API docs and terms, recorded in LEGAL.md at P1-04 / P1-05 |
| Keka, Darwinbox, Zoho Recruit public careers feeds and terms (SPEC section 8) | Provider docs and terms (D-08) |
