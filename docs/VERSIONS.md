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
| buf | 1.75.0 | 2026-10-28 | `mise latest buf` (aqua `bufbuild/buf`, native Windows build). `buf lint`, `buf generate` with local plugins, and `buf breaking --against .git#ref=<sha>` verified on the Windows dev box. An against input with no `.proto` files fails ("had no .proto files"), hence the skip in `scripts/check-proto-breaking.mjs` (ADR-0006) |
| hadolint | 2.15.1 | 2026-10-28 | `mise latest hadolint` (aqua `hadolint/hadolint`); https://github.com/hadolint/hadolint/releases (v2.15.1, 2026-07-31). Native Windows build; `hadolint Dockerfile` verified on the dev box (P0-06) |
| Trivy | 0.76.1 | 2026-10-28 | `mise latest trivy` (aqua `aquasecurity/trivy`); https://github.com/aquasecurity/trivy/releases (v0.76.1, 2026-10-21; checksums and sigstore bundles published). Used through mise, not `trivy-action`. It downloads its vulnerability database at scan time |
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
| connectrpc.com/connect/v2 | v2.0.2 | 2026-10-28 | Module proxy (v2.0.0 on 2026-10-07, v2.0.2 on 2026-10-21). Chosen over v1 (`connectrpc.com/connect` v1.21.1) in ADR-0006. Its `cmd/protoc-gen-connect-go` is a `tool` directive, so the generator matches the runtime |
| google.golang.org/protobuf | v1.36.12 | 2026-10-28 | Module proxy. Its `cmd/protoc-gen-go` is a `tool` directive (`go tool protoc-gen-go`, Go 1.24+) |
| github.com/pressly/goose/v3 | v3.29.0 | 2026-10-27 | Module proxy (published 2026-10-11). Migrations as a library (ADR-0005) |

## Pinned container images (`compose.yaml`, CI service)

| Image | Tag | Verified | Source |
| :-- | :-- | :-- | :-- |
| postgres | `18.6-alpine` (digest `sha256:10a5c69a…`) | 2026-10-27 | `docker pull`; image env `PG_VERSION=18.6`, `PGDATA=/var/lib/postgresql/18/docker`, volume `/var/lib/postgresql` |
| grafana/otel-lgtm | `0.38.1` (digest `sha256:0df9bc14…`) | 2026-10-27 | `docker pull`; exposes 3000, 4317, 4318 |
| golang (Dockerfile builder) | `1.27.3-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb` | 2026-10-28 | `docker pull`; env `GOLANG_VERSION=1.27.3`, `GOTOOLCHAIN=local` (matches `mise.toml`, a test checks it) |
| gcr.io/distroless/static-debian13 (Dockerfile runtime) | `nonroot@sha256:18f4cc26c9ffa7f20a359298be7deadac5c607c8e03a02b8119f1a5fc2f82c99` | 2026-10-28 | `docker pull`; user `65532`, `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`, no shell (P0-06 smoke test) |

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
| @connectrpc/connect, @connectrpc/connect-web | 2.2.0 | Generated-client runtime and the browser transport (P0-05). 2.3.0 (2026-10-27) exists, but pnpm 12's default minimum release age rejects packages under a day old; 2.2.0 (2026-09-07) is used rather than adding an exclusion. connect-web has no response size limit or redirect option: `createGuardedFetch` adds both |
| @bufbuild/protobuf | 2.16.0 | Protobuf runtime (also a dependency of `packages/api`). With Connect, adds 31.99 kB gzip to the initial JS (112.93 to 144.92 kB, `task build:web`, 2026-10-28); the binary codec changes it by 0.01 kB |
| @bufbuild/protoc-gen-es | 2.16.0 | Code generator, a devDependency of `packages/api` (same version as the runtime) |
| @earlii/api | workspace | Generated contracts (`packages/api`, source-only) |
| shadcn (CLI, not a dependency) | 4.23.0 | Run pinned: `pnpm dlx shadcn@4.23.0 add <component>` from `apps/web` |

## Candidate versions (verified latest; pin when the item starts)

| Package | Latest | For | Verified | Source |
| :-- | :-- | :-- | :-- | :-- |
| OpenTelemetry Go (`otel`, `sdk`, `sdk/metric`, `sdk/log`, `otel/log`, `otlptracehttp`, `otlpmetrichttp`) | v1.47.0 (2026-10-02); ships semconv v1.43.0 | P0-07a | 2026-10-28 | Go module proxy; `semconv/v1.43.0` in the module |
| `otlploghttp` | v0.23.0 | P0-07a | 2026-10-28 | Go module proxy |
| `go.opentelemetry.io/contrib/bridges/otelslog` | v0.21.0 | P0-07a | 2026-10-28 | Go module proxy |
| `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp` | v0.72.0 | P0-07a | 2026-10-28 | Go module proxy |
| `github.com/riverqueue/rivercontrib/otelriver` (reference only, not planned) | v0.12.0 (2026-07-24, built against River v0.41) | P0-07b | 2026-10-28 | Go module proxy |
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
| connect-go v2.0.2: `connecthttp.WithReadMaxBytes` applies after decompression (a gzip bomb fails with `resource_exhausted`); the default is 4 MiB | 2026-10-28 | `connecthttp/compression.go` (`Decompress`); proven by `TestGzipBombIsRejected` |
| connect-go v2.0.2: wrong HTTP method (405), unsupported content type (415), unknown compression and a bad timeout header are rejected in `connecthttp` before the interceptor chain, so they get no access log line | 2026-10-28 | `connecthttp/handler.go` (`ServeHTTP`) |
| connect-go v2.0.2: `WithRequireConnectProtocolHeader` makes a Connect GET carry `connect=v1` and a unary POST carry `Connect-Protocol-Version`; gRPC and gRPC-Web are unaffected and can't be turned off server-side | 2026-10-28 | `go doc connectrpc.com/connect/v2/connecthttp.WithRequireConnectProtocolHeader`; `connecthttp/protocol_connect.go`; proven by `TestRequiresConnectProtocolMarker` |
| connect-go v2.0.2: only an authored `*connect.Error` is serialised; any other error reaches the client as a bare code | 2026-10-28 | `go doc connectrpc.com/connect/v2.Error`; proven by `TestPlainErrorTextNeverReachesClient` |
| connect-go v2: **`connectrpc.com/otelconnect/v2` does not exist** (corrected 2026-10-28: this row said v2.0.0 existed; the proxy answers 404 and `connectrpc.com/otelconnect` stops at v0.7.x, for connect v1). `validate/v2`, `authn/v2` and `grpchealth/v2` don't exist either. P0-07a writes its own interceptor | 2026-10-28 | `curl https://proxy.golang.org/connectrpc.com/otelconnect/v2/@v/list`; `go list -m connectrpc.com/otelconnect/v2@latest` |
| connect-web 2.2.0 `ConnectTransportOptions`: `baseUrl`, `useBinaryFormat` (JSON by default), `useHttpGet`, `fetch`, `defaultTimeoutMs`; no `readMaxBytes` and no redirect option | 2026-10-28 | `@connectrpc/connect-web/dist/esm/connect-transport.d.ts` |
| pnpm 12.15.0 applies a default minimum release age (about one day) and, on `pnpm add` of a newer package, writes a `minimumReleaseAgeExclude` entry into `pnpm-workspace.yaml`; a lockfile holding such a package then fails verification | 2026-10-28 | `pnpm add @connectrpc/connect@2.3.0` output |
| Go 1.24+ `tool` directives: `go tool <name>` runs from the repo root under `go.work`, so buf can call `go tool protoc-gen-go` as a local plugin | 2026-10-28 | `go tool protoc-gen-go --version` (v1.36.12) on the Windows dev box |
| Docker 29.9.1 with the containerd image store: `docker image inspect`'s `Size` counts the unpacked layers **plus** the compressed blobs (earlii:local: 26.13 MB, with `docker images` showing 6.13 MB content size); the classic store reports the uncompressed size. Hence the image budget is measured on the bytes of `docker export` (17.56 MB) | 2026-10-28 | `docker image inspect`, `docker images`, `docker export \| wc -c` on the dev box |
| `-ldflags="-s -w"` shrinks the linux/amd64 `earlii` binary from 20,668,076 to 14,205,088 bytes (31%) | 2026-10-28 | `go build -trimpath -buildvcs=false` with and without the flags, `ls -l` |
| The engine's built-in Dockerfile frontend (Docker 29.9.1) supports `RUN --mount=type=cache` and `FROM --platform=$BUILDPLATFORM` with no `# syntax=` line | 2026-10-28 | `docker build` of the P0-06 Dockerfile |
| A Go binary running as PID 1 with `signal.NotifyContext` gets SIGTERM from `docker stop` and drains (exit 0 in about 0.5 s, every serving mode); it starts no children, so no init (tini) is needed | 2026-10-28 | `task test:image` |
| Every official OTLP exporter (HTTP or gRPC) links gRPC and grpc-gateway through `go.opentelemetry.io/proto/otlp/collector`. Stripped linux/amd64 probe binaries: base 12,116,128 B; SDK only 13,320,352 B; plus `otlptracehttp` 21,471,392 B; plus all three `otlp*http` and otelhttp 23,519,392 B; the gRPC exporters 23,621,792 B; hand-marshalled `proto/slim/otlp` 15,470,752 B. Hence ROADMAP's image budget of 40 MB | 2026-10-28 | `go build -trimpath -ldflags="-s -w"` of probe modules, `ls -l`; the real image is measured in P0-07a |
| River v0.50.0 computes a job's unique key from `EncodedArgs` only, never metadata, so trace context goes in metadata (P0-07b) | 2026-10-28 | `client.go` (`dbunique.UniqueKey`), `internal/dbunique/db_unique.go` |
| otelriver v0.12.0 `EnableTracePropagation` writes `traceparent` into job metadata and gives the work span a **link** to the enqueuing span, not a parent | 2026-10-28 | `otelriver/middleware.go` (`injectTraceContext`, `extractSpanContext`) |
| The Playwright MCP launches the `chrome` channel, which isn't installed on the dev box (`npx playwright install chrome` would fix it) | 2026-10-27 | MCP error on `browser_navigate` |

## UNVERIFIED (check before relying on them)

| Claim | How to check |
| :-- | :-- |
| Grafana Cloud free tier: ~10k active metric series, 50 GB logs/traces, 14-day retention (secondary sources only) | https://grafana.com/pricing, at P0-07a / P2-17 |
| India commercial SMS requires TRAI DLT sender/template registration (affects SCP-01 phone OTP) | TRAI / SMS-provider documentation, before any phone-OTP work |
| Chrome installs the PWA from `manifest.webmanifest` (installability needs HTTPS or localhost, so the LAN phone test can't check it) | Lighthouse or Chrome DevTools, Application, Manifest, on a deployed HTTPS build (P2-17) |
| Render's internal Postgres URL supports `sslmode=verify-full` (prod config requires verify-full or verify-ca) and allows direct, non-pooled connections for `earlii migrate` | Render docs, at D-04 / P2-17 |
| Dependabot's `docker` ecosystem updates digest-pinned `FROM name:tag@sha256:...` lines in the Dockerfile (the supported-ecosystems page, read 2026-10-28, lists `docker` and `docker-compose` but doesn't say whether digests are updated); until verified, R-01 bumps the base images by hand | GitHub Dependabot docs, before adding it to `dependabot.yml` |
| Dependabot's `docker-compose` ecosystem updates image tags in `compose.yaml` | GitHub Dependabot docs, before adding it to `dependabot.yml` |
| Dependabot supports pnpm 12 lockfiles | Watch the first monthly Dependabot run; see the Insights → Dependency graph → Dependabot tab |
| Greenhouse Job Board API and Lever Postings API: public access and terms allow polling | The official API docs and terms, recorded in LEGAL.md at P1-04 / P1-05 |
| Keka, Darwinbox, Zoho Recruit public careers feeds and terms (SPEC section 8) | Provider docs and terms (D-08) |
