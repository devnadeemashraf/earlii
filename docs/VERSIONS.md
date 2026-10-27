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
| sqlc | 1.31.1 | 2026-10-27 | `mise ls-remote sqlc` (aqua `sqlc-dev/sqlc`); GitHub releases ship a native windows_amd64 build. `sqlc generate` verified on the Windows dev box (no cgo) |
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
| golang.org/x/sync (errgroup) | v0.24.0 | 2026-10-27 | `go list -m -json golang.org/x/sync@latest` (published 2026-09-23); used by `httpserver.Serve` (P0-02) |
| github.com/jackc/pgx/v5 | v5.11.0 | 2026-10-27 | `go list -m -json ...@latest` (published 2026-09-07). Pool, connections, `stdlib` adapter for goose (P0-04) |
| github.com/riverqueue/river (+ riverdriver/riverpgxv5) | v0.50.0 | 2026-10-27 | Module proxy (published 2026-10-27). Chosen over v0.49.0 for its fixes (durable periodic jobs, notifier backoff); its breaking change (nested resumable steps) doesn't touch us. Only `rivermigrate` is used until P1-07 |
| github.com/pressly/goose/v3 | v3.29.0 | 2026-10-27 | Module proxy (published 2026-10-11). Migrations as a library (ADR-0005) |

## Pinned container images (`compose.yaml`, CI service)

| Image | Tag | Verified | Source |
| :-- | :-- | :-- | :-- |
| postgres | `18.6-alpine` (digest `sha256:10a5c69a…`) | 2026-10-27 | `docker pull`; image env `PG_VERSION=18.6`, `PGDATA=/var/lib/postgresql/18/docker`, volume `/var/lib/postgresql` |
| grafana/otel-lgtm | `0.38.1` (digest `sha256:0df9bc14…`) | 2026-10-27 | `docker pull`; exposes 3000, 4317, 4318 |

## Pinned npm packages (`apps/web/package.json`, exact pins)

Verified 2026-10-27 with `npm view <pkg> version` and their `peerDependencies` (all accept Vite 8 and React 19). Vite 8.3.5, Vitest 5.0.5 and TypeScript 7.0.2 are pinned at the root (above) and repeated in the app.

| Package | Version | Why |
| :-- | :-- | :-- |
| react, react-dom | 19.3.1 | UI |
| @types/react, @types/react-dom | 19.3.0 | Types |
| @tanstack/react-router | 1.170.46 | File-based routing, loaders, pending/error states |
| @tanstack/router-plugin | 1.168.48 | Vite plugin: generates `src/routeTree.gen.ts`, code-splits route components. It also runs under Vitest and `vite build` |
| @tanstack/react-query | 5.105.0 | Server state (published 2026-10-26) |
| tailwindcss, @tailwindcss/vite | 4.3.3 | Styling (CSS-first config in `src/index.css`) |
| clsx, tailwind-merge | 2.1.1, 3.7.0 | shadcn/ui's `cn()` helper, owned in `src/lib/utils.ts` |
| @vitejs/plugin-react | 6.1.2 | Fast Refresh; peer `vite ^8.0.0` |
| vitest | 5.0.5 | Tests; jsdom by default, `// @vitest-environment node` per file |
| jsdom | 30.1.3 | DOM for component and route tests |
| @testing-library/react, /dom, /jest-dom | 16.3.3, 10.4.2, 7.0.1 | Rendering, queries, DOM matchers (`@testing-library/jest-dom/vitest`) |
| @types/node | 24.19.2 | Node types for `vite.config.ts` and node-environment tests (Node 24 LTS) |
| shadcn (CLI, not a dependency) | 4.23.0 | Run pinned: `pnpm dlx shadcn@4.23.0 add <component>` from `apps/web` |

## Candidate versions (verified latest; pin when the item starts)

| Package | Latest | For | Verified | Source |
| :-- | :-- | :-- | :-- | :-- |
| buf | 1.75.0 | P0-05 | 2026-10-27 | `mise latest buf`; GitHub releases |
| connect-go | v2.0.2 (`connectrpc.com/connect/v2`) | P0-05 | 2026-10-27 | `go list -m connectrpc.com/connect/v2@latest`. Note: v1 is still `connectrpc.com/connect` v1.21.1. Pick deliberately |
| google.golang.org/protobuf | v1.36.12 | P0-05 | 2026-10-27 | Go module proxy |
| @connectrpc/connect, connect-web | 2.2.0 | P0-05 | 2026-10-27 | npm registry |
| @bufbuild/protobuf, protoc-gen-es | 2.16.0 | P0-05 | 2026-10-27 | npm registry |
| OpenTelemetry Go | v1.47.0 | P0-07 | 2026-10-27 | Go module proxy |
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
| Vite 8 `server.fs.deny` defaults are `.env`, `.env.*`, `*.{crt,pem,key,p12,pfx,cer,der}`, `.npmrc`, `.yarnrc.yml`, `**/.git/**`; setting `deny` replaces them. `fs.allow` defaults to the workspace root (the repo root here), so without an override `/@fs/` serves any repo file, `docs/SPEC.md` included | 2026-10-27 | `node_modules/vite/dist/node/index.d.ts` (`FileSystemServeOptions`); proven by `apps/web/src/dev-server.test.ts` failing without the override |
| Vite 8 `server.allowedHosts`: localhost, `*.localhost` and any IP are allowed by default; `true` allows any host (DNS rebinding) | 2026-10-27 | `node_modules/vite/dist/node/index.d.ts` (`allowedHosts`) |
| TanStack Router 1.170: `defaultPendingMs` 1000, `defaultPendingMinMs` 500, `defaultStaleTime` 0, `defaultPreload` false | 2026-10-27 | `@tanstack/router-core/dist/esm/router.d.ts` |
| TanStack Router 1.170: router state starts with `matches: []`, and `RouterProvider` renders nothing until the first match exists, so a bare mount blanks `#root`. After `await router.load()`, the provider's mount reuses that load instead of repeating it | 2026-10-27 | `router-core/dist/esm/router.js` (`getInitialRouterState`), `react-router/dist/esm/Matches.js`, `Transitioner.js`; proven by `apps/web/src/app.test.tsx` (first paint) |
| TanStack router-plugin's default `codeSplitGroupings` split `component`, `errorComponent` and `notFoundComponent`; `loader` and `pendingComponent` stay in the main chunk | 2026-10-27 | `@tanstack/router-plugin/dist/esm/core/constants.js` |
| Vite 8's default build target is `chrome111`, `edge111`, `firefox114`, `safari16.4`, `ios16.4` (baseline widely available); it transpiles syntax but doesn't polyfill APIs | 2026-10-27 | `node_modules/vite/dist/node/chunks/node.js` (`ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET`) |
| `AbortSignal.any` needs Chrome 116, Safari/iOS 17.4, Firefox 124, so `src/lib/signals.ts` falls back below that. `AbortSignal.timeout` is in Safari/iOS 16 and Firefox 100; Chrome has it since 103 (before 124 it aborts with `AbortError`, not `TimeoutError`, which our code doesn't depend on) | 2026-10-27 | `@mdn/browser-compat-data` 8.1.7 (`api.AbortSignal.any_static`, `timeout_static`) |
| Biome 2.6 needs `css.parser.tailwindDirectives: true` to parse Tailwind 4's `@theme` and `@apply` | 2026-10-27 | `configuration_schema.json`; Biome parse error without it |
| shadcn CLI 4.23.0 `init` prompts for a preset even with `--yes` (pass `--preset`), and its radix-nova preset rewrites `cn()` to the third-party `cn` package and adds Geist, radix-ui, lucide-react and `shadcn` as dependencies. We keep our own `cn()` and add those only when a component needs them | 2026-10-27 | Ran in a scratch copy |
| `zlib.crc32` is built into Node 24 (used by the zero-dependency PNG encoder in `scripts/lib/png.mjs`) | 2026-10-27 | `node -e "require('zlib').crc32"` on Node 24.22 |
| pgx v5.11.0 `ParseConfigError.Error()` quotes the connection string with the password redacted on a **best-effort** basis only, so config never wraps it | 2026-10-28 | `pgconn/errors.go` (`redactPW`) in the module cache |
| pgx v5.11.0 `pgconn.ParseConfigOptions.ConnStringAllowedKeys` rejects unlisted keys (including every repeated `ssl`/`sslmode`) before reading files; env vars such as `PGSSLMODE` still apply | 2026-10-28 | `go doc github.com/jackc/pgx/v5/pgconn.ParseConfigOptions` |
| pgx v5.11.0 `sslmode=require` sets `InsecureSkipVerify` (no certificate check); `verify-ca` uses a custom `VerifyPeerCertificate`; `prefer` adds a plaintext fallback | 2026-10-28 | `pgconn/config.go` (`configTLS`); proven by `config_test.go` |
| pgx v5.11.0 applies `ConnectTimeout` as a context deadline on the whole connect, so setting the field after parsing works; `connect_timeout=0` means no timeout | 2026-10-28 | `pgconn/pgconn.go` (`ConnectConfig`) |
| `pgxpool.NewWithConfig` doesn't connect when `MinConns` is 0; the first acquire does | 2026-10-28 | `pgxpool/pool.go`; proven by `TestNewPoolIsLazy` |
| River v0.50.0: `rivermigrate` takes no advisory lock; `MigrateTx` is deprecated because some migrations can't share one transaction; 8 migrations on the main line | 2026-10-28 | `go doc github.com/riverqueue/river/rivermigrate`; `rivermigrate/river_migrate.go`; `task migrate` output |
| goose v3.29.0 `Provider` takes no lock unless given `WithSessionLocker`/`WithLocker`, and logs with a plain-text default logger unless given `WithSlog` | 2026-10-28 | `provider.go`, `provider_options.go` |
| slog's JSON handler encodes a nested struct with `encoding/json`, ignoring `String` and `LogValue` on its fields; `MarshalText` is honoured | 2026-10-28 | Go 1.27.3; proven by `TestSecretNeverPrints` (failed before `Secret.MarshalText`) |
| grafana/otel-lgtm 0.38.1 enables anonymous **Admin** by default (`GF_AUTH_ANONYMOUS_ENABLED=true`, role Admin); `GF_SERVER_ENFORCE_DOMAIN=true` with domain `localhost` makes Grafana 301 any other Host | 2026-10-28 | `/otel-lgtm/run-grafana.sh` in the image; `curl -H 'Host: evil.example.com' 127.0.0.1:3000/api/org` returned 301 |
| sqlc 1.31.1 reads goose files from the migrations directory as its schema | 2026-10-28 | `sqlc generate` on `backend/sqlc.yaml` |
| The Playwright MCP launches the `chrome` channel, which isn't installed on the dev box (`npx playwright install chrome` would fix it) | 2026-10-27 | MCP error on `browser_navigate` |

## UNVERIFIED (check before relying on them)

| Claim | How to check |
| :-- | :-- |
| Grafana Cloud free tier: ~10k active metric series, 50 GB logs/traces, 14-day retention (secondary sources only) | https://grafana.com/pricing, at P0-07 / P2-17 |
| India commercial SMS requires TRAI DLT sender/template registration (affects SCP-01 phone OTP) | TRAI / SMS-provider documentation, before any phone-OTP work |
| Chrome installs the PWA from `manifest.webmanifest` (installability needs HTTPS or localhost, so the LAN phone test can't check it) | Lighthouse or Chrome DevTools, Application, Manifest, on a deployed HTTPS build (P2-17) |
| Render's internal Postgres URL supports `sslmode=verify-full` (prod config requires verify-full or verify-ca) and allows direct, non-pooled connections for `earlii migrate` | Render docs, at D-04 / P2-17 |
| Dependabot's `docker-compose` ecosystem updates image tags in `compose.yaml` | GitHub Dependabot docs, before adding it to `dependabot.yml` |
| Dependabot supports pnpm 12 lockfiles | Watch the first monthly Dependabot run; see the Insights → Dependency graph → Dependabot tab |
| Greenhouse Job Board API and Lever Postings API: public access and terms allow polling | The official API docs and terms, recorded in LEGAL.md at P1-04 / P1-05 |
| Keka, Darwinbox, Zoho Recruit public careers feeds and terms (SPEC section 8) | Provider docs and terms (D-08) |
