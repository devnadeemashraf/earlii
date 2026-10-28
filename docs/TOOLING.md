# Open-source tooling for an AI-assisted workflow

Research for how Earlii's code is written, checked and shipped when an AI agent writes most of it. Every licence and version below was verified on **2026-10-27**: licences from each repository's licence file (GitHub API), versions from the latest GitHub release or package registry. Re-verify before adopting anything listed as *planned* (AGENTS.md section 3).

## Why AI-assisted code needs more tooling, not less

Agents produce plausible code quickly. The failure modes shift from "slow to write" to "confidently wrong":

| AI failure mode | What catches it | Where in Earlii |
| :-- | :-- | :-- |
| Invented or outdated APIs and flags | Local, version-pinned API lookup; language servers | `/api-lookup`, gopls MCP, `go doc`, `.d.ts`, `--help` |
| Drifting tool versions between agent, human and CI | A single pin file used everywhere | mise + `task doctor` |
| Style churn and noisy diffs | Formatters on every edit and every commit | Biome, golangci-lint fmt, PostToolUse hook, lefthook |
| Subtle bugs and unsafe patterns | Strict linters with security rules; SAST | golangci-lint (gosec, errorlint, noctx…), Semgrep (planned) |
| Tests that pass but don't test | Mutation testing; seeded-bug grading | gremlins, Stryker (planned, P1-05 / P2-02) |
| Secrets pasted into code or configs | Secret scanning before commit and in CI | gitleaks |
| Vulnerable or bloated dependencies | Vulnerability and unused-code scanners | govulncheck, OSV-Scanner, knip (planned) |
| Contract and schema breaks | Breaking-change checks | `buf breaking` (P0-05) |
| Performance regressions nobody measured | Benchmarks, size and Lighthouse budgets in CI | benchstat, size-limit, Lighthouse CI (planned) |
| CI and supply-chain mistakes in workflows | Workflow linting and security auditing; SHA pinning | actionlint, zizmor |
| Rule-breaking actions (push to main, AI trailers) | Executable policy at agent, git and CI layers | `scripts/lib/guards.mjs` + Claude hooks + lefthook + ruleset |
| LLM features that silently degrade | Eval suites gating CI | Go-native evals or promptfoo (E-01) |

## Adopted now (in this repository)

| Tool | What it does here | Licence | Version | Where |
| :-- | :-- | :-- | :-- | :-- |
| [mise](https://github.com/jdx/mise) | Pins and installs Go, Node, pnpm and every CLI from one `mise.toml`; the same file drives CI via `jdx/mise-action` | MIT | 2026.10.20 | `mise.toml`, CI |
| [Task](https://github.com/go-task/task) | Cross-platform task runner with an embedded POSIX shell, so one `task check` works on Windows and Linux | MIT | v3.54.0 | `Taskfile.yml` |
| [lefthook](https://github.com/evilmartians/lefthook) | Fast git hooks: format staged files, scan secrets, check commit messages, refuse pushes to main | MIT | v2.2.2 | `lefthook.yml` |
| [Biome](https://github.com/biomejs/biome) | One binary for TS/JS/JSON/CSS formatting, linting and import sorting. It's fast enough to run after every agent edit | Apache-2.0 (dual MIT) | 2.6.3 | `biome.json` |
| [golangci-lint](https://github.com/golangci/golangci-lint) | Go meta-linter plus formatters (gofumpt, goimports); security and error-handling linters tuned for agent-written Go | GPL-3.0 (dev tool only) | v2.15.0 | `.golangci.yml` |
| [gitleaks](https://github.com/gitleaks/gitleaks) | Secret scanning on staged changes (pre-commit) and the full history (CI) | MIT | v8.30.1 | lefthook, `task lint:secrets` |
| [actionlint](https://github.com/rhysd/actionlint) | Static checks for GitHub Actions workflows | MIT | v1.7.12 | `task lint:actions` |
| [zizmor](https://github.com/zizmorcore/zizmor) | Security audit of workflows: template injection, credential persistence, unpinned actions | MIT | v1.31.1 | `task lint:actions` |
| [gopls](https://github.com/golang/tools) (MCP mode) | `gopls mcp` gives the agent workspace symbols, references and diagnostics, so it reads real code instead of guessing | BSD-3-Clause | v0.24.0 | `.mcp.json` |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Lets the agent open the PWA, take accessibility snapshots and screenshots, and verify UI rules (44 px targets, no blank screens) | Apache-2.0 | v0.0.83 | `.mcp.json`, `/snapshot` |
| [Dependabot](https://github.com/dependabot/dependabot-core) | Monthly grouped update PRs for npm and Actions. Needs no third-party app with repo write access | MIT (core) | v0.401.0 (core) | `.github/dependabot.yml` |
| Node `node:test` | A zero-dependency test runner for repo scripts and hook logic | MIT (Node.js) | Node 24.22.1 | `scripts/test/` |
| [TypeScript](https://github.com/microsoft/TypeScript) | Strict typecheck; `paths` is the single source for the `@/*` alias (ADR-0004) | Apache-2.0 | 7.0.2 | `tsconfig.base.json` |
| [Vite](https://github.com/vitejs/vite) | Dev server and production bundler; resolves tsconfig `paths` natively (`resolve.tsconfigPaths`) | MIT | 8.3.5 | alias fixture; apps from P0-03 |
| [Vitest](https://github.com/vitest-dev/vitest) | Test runner that inherits Vite config, aliases included | MIT | 5.0.5 | alias fixture; apps from P0-03 |

## Adopt at the roadmap item (planned)

| Tool | Why it's worth it | Licence | Latest | Adopt in |
| :-- | :-- | :-- | :-- | :-- |
| [buf](https://github.com/bufbuild/buf) | Protobuf lint, `buf breaking` against main, codegen | Apache-2.0 | v1.75.0 | P0-05 |
| [sqlc](https://github.com/sqlc-dev/sqlc) | Typed Go from SQL; `sqlc vet` catches query problems before runtime | MIT | v1.31.1 | P0-04 |
| [goose](https://github.com/pressly/goose) | Forward-only SQL migrations (D-07 candidate) | MIT | v3.29.0 | P0-04 |
| [testcontainers-go](https://github.com/testcontainers/testcontainers-go) | Real Postgres in integration tests (D-10 candidate) | MIT | v0.44.0 | P0-04 |
| [grafana/otel-lgtm](https://github.com/grafana/docker-otel-lgtm) | A one-container local OpenTelemetry backend (Loki, Grafana, Tempo, Mimir) | Apache-2.0 | v0.38.1 | P0-04 / P0-07a |
| [govulncheck](https://github.com/golang/vuln) | Reports only vulnerabilities in code paths you actually call | BSD-3-Clause | v1.9.0 (tag) | P0-02 |
| [OSV-Scanner](https://github.com/google/osv-scanner) | Vulnerability scan for npm and Go lockfiles against the OSV database | Apache-2.0 | v2.7.0 | P0-03 |
| [Trivy](https://github.com/aquasecurity/trivy) | Container image vulnerability and misconfiguration scan | Apache-2.0 | v0.76.1 | P0-06 |
| [hadolint](https://github.com/hadolint/hadolint) | Dockerfile linting | GPL-3.0 (dev tool only) | v2.15.1 | P0-06 |
| [benchstat](https://github.com/golang/perf) | Statistically sound before/after comparison of Go benchmarks, so decisions carry real numbers | BSD-3-Clause | module `golang.org/x/perf` | P1-12 |
| [gremlins](https://github.com/go-gremlins/gremlins) | Mutation testing for Go: proves tests catch bugs, not just run lines | Apache-2.0 | v0.6.0 | P1-05 |
| [Stryker](https://github.com/stryker-mutator/stryker-js) | Mutation testing for TS/React | Apache-2.0 | v10.1.1 | P2-02 |
| [knip](https://github.com/webpro-nl/knip) | Finds unused files, exports and dependencies: agents often leave dead code behind | ISC | v6.43.0 | P0-03 |
| [size-limit](https://github.com/ai/size-limit) | Fails CI when the JS bundle exceeds budget (≤ 170 KB) | MIT | 14.3.0 | P2-05 |
| [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) | Performance and accessibility budgets for the PWA in CI | Apache-2.0 | v0.15.1 | P2-05 |
| [k6](https://github.com/grafana/k6) | Load tests to check the p95 RPC budgets | AGPL-3.0 (separate tool, not linked) | v2.3.0 | P2-03 |
| [Semgrep CE](https://github.com/semgrep/semgrep) | SAST with custom rules (e.g. "no raw SQL strings", "every RPC calls authz") | LGPL-2.1 | v1.182.0 | P2-10 |
| [promptfoo](https://github.com/promptfoo/promptfoo) | Declarative LLM eval and red-team suites; an alternative to Go-native evals for E-01 | MIT | 0.125.1 | E-01 (decide vs Go-native) |
| [ast-grep](https://github.com/ast-grep/ast-grep) | Structural search and custom lint rules over the AST; good for encoding project-specific bans that linters lack | MIT | 0.51.0 | when a repeated review finding appears |
| [typos](https://github.com/crate-ci/typos) | Fast spell-checker for code and docs with a low false-positive rate | Apache-2.0 / MIT | v1.51.1 | optional, any time |
| [lychee](https://github.com/lycheeverse/lychee) | Dead-link checker for the many cross-linked docs | Apache-2.0 / MIT | v0.24.2 | optional, any time |
| [git-cliff](https://github.com/orhun/git-cliff) | Changelog from Conventional Commits | Apache-2.0 / MIT | v2.14.2 | Phase 3 (public beta release notes) |

## AI-workflow tools evaluated

| Tool | What it is | Licence | Latest | Verdict |
| :-- | :-- | :-- | :-- | :-- |
| [Context7](https://github.com/upstash/context7) | MCP server for up-to-date, version-specific library docs | MIT (client); the docs index is a hosted service | MCP 4.4.4 (npm) | **Optional, configured.** Useful for fast-moving JS libraries. Local `.d.ts` / `go doc` stay the source of truth, because a hosted index can lag the pinned version |
| [Serena](https://github.com/oraios/serena) | Coding-agent toolkit: semantic, LSP-backed symbol search and editing across many languages | GPL-3.0-or-later (app), MIT (SolidLSP) | v2.1.0 | **Not now.** gopls MCP covers Go; revisit when the TS codebase grows past what grep and the repo map handle |
| [GitHub MCP server](https://github.com/github/github-mcp-server) | MCP access to issues, PRs and Actions | MIT | v2.0.3 | **Not adopted.** The `gh` CLI already does this, and needs no extra token with broad scopes |
| [PR-Agent (Qodo)](https://github.com/qodo-ai/pr-agent) | Open-source AI PR reviewer that runs in Actions with your own LLM key | MIT | v0.49.0 | **Not now.** The local `reviewer` subagent runs before the PR exists; a second AI reviewer adds cost and noise for one maintainer. Revisit at the public beta |
| [Spec Kit](https://github.com/github/spec-kit) | Spec-driven development toolkit for AI agents | MIT | v1.2.3 | **Not adopted.** It overlaps the SPEC → ROADMAP → POINTER loop already in place; two systems would compete |
| [Repomix](https://github.com/yamadashy/repomix) | Packs a repo into one AI-friendly file | MIT | v1.18.1 | **Use ad hoc** for a second-opinion review in an external model; not part of the loop |
| [ccusage](https://github.com/ryoppippi/ccusage) | Reports Claude Code token usage and cost from local logs | MIT | v20.0.45 | **Recommended, personal.** Run `npx ccusage@latest` occasionally to see what the AI workflow costs; it's a talking point for the LLM-cost story |

## Considered and rejected

| Tool | Licence | Why not |
| :-- | :-- | :-- |
| [Renovate](https://github.com/renovatebot/renovate) | AGPL-3.0 | Stronger than Dependabot (it understands `mise.toml`, with richer grouping), but needs a GitHub App installed with write access. Dependabot works with no setup. **Revisit** if monthly `mise outdated` bumps become a chore (R-01) |
| ESLint + Prettier | MIT | Two tools, slower, more config. Biome covers the needed rules. Revisit if a must-have ESLint plugin appears |
| husky / pre-commit | MIT | husky is Node-only; pre-commit needs a Python runtime. lefthook is a single binary |
| Make / just | GPL / CC0 | Shell differences on Windows (see ADR-0001) |
| markdownlint / Prettier for Markdown | MIT | Not needed yet. Biome's Markdown formatting was **disabled** after it broke frontmatter (see the Biome gotcha in VERSIONS) |

## How the pieces run

| When | What runs | Command |
| :-- | :-- | :-- |
| After every agent edit | Biome / golangci-lint fmt on the touched file | PostToolUse hook |
| Before every agent shell command | Git/gh policy guard | PreToolUse hook |
| `git commit` | Biome on staged files, Go fmt, gitleaks, commit message rules | lefthook |
| `git push` | Refuse `main` | lefthook |
| Every PR (Linux + Windows) | doctor, Biome, golangci-lint, actionlint, zizmor, gitleaks, tests; handoff rule | `task doctor`, `task check`, `scripts/handoff-check.mjs` |
| Monthly | Dependabot PRs; `mise outdated` (R-01) | — |

## Re-evaluation

Review this document at every milestone (R-02):

- promote *planned* tools when their item starts;
- re-verify licences, since some projects relicense;
- drop anything that isn't earning its keep.
