# Coding standards

These standards are enforced by tooling wherever possible (`task check`). Where tooling can't enforce them, the reviewer subagent checks against this file.

## Universal rules

- **Small, boring, obvious.** Write the smallest change that meets the acceptance criteria, and prefer standard-library solutions.
- **No TODO without an ID:** `// TODO(P1-07): …` or `// TODO(BP-003): …`.
- **Generated code lives in `gen/` directories** (or `*.gen.ts`, `*.pb.go`, `*_pb.ts`) and is never edited by hand. Change the source and run `task gen`.
- **Comments explain *why*, not *what*.** Never add AI attribution in comments.
- **Never use the section sign (U+00A7)**, in any file, commit or PR. Write "section 4" or "SPEC A2". `task lint:text` and the hooks enforce this.
- **Time:** store UTC and present in the user's zone (IST default). Never call the wall clock directly in logic: inject a clock.
- **No PII in logs or traces**: no emails, names, resume text or tokens.

## Go

| Topic | Rule |
| :-- | :-- |
| Version | `go` directive matches `mise.toml` |
| Formatter | gofumpt + goimports (local prefix `github.com/devnadeemashraf/earlii`), via `golangci-lint fmt` |
| Linter | golangci-lint v2, `.golangci.yml` (standard set plus errorlint, gosec, noctx, sloglint, wrapcheck, …) |
| Layout | `backend/cmd/earlii` (the one binary), `backend/internal/<module>/` (no `pkg/` unless something is truly shared), `backend/gen/` (generated) |
| Naming | Packages are short, lower-case and singular (`feed`, `registry`). No stutter (`feed.Service`, not `feed.FeedService`). Interfaces are named by behaviour (`Fetcher`) and defined where they're **consumed** |
| Errors | Return errors, never panic in library code. Wrap with context: `fmt.Errorf("fetch board %s: %w", id, err)`. Sentinel errors via `errors.New`, checked with `errors.Is` / `errors.As`. Map to Connect codes only at the handler edge |
| Context | `ctx context.Context` is the first parameter of anything that does I/O. Never store a context in a struct. Respect cancellation in loops |
| Logging | `log/slog`, JSON handler, attrs only (`slog.String("board", id)`). Logger comes from context or a dependency, never a global. Levels: Debug (dev), Info (lifecycle), Warn (degraded), Error (needs action) |
| Concurrency | Prefer `errgroup` for fan-out with cancellation. Every goroutine has an owner and a way to stop. Shared state gets a mutex with a comment on what it guards. `go test -race` in CI |
| Dependencies | Standard library first. A new module needs a reason in the PR and an entry in VERSIONS. No ORMs (use sqlc), no global DI frameworks |
| Config | From env only, parsed into a typed struct at boot, validated, fail fast. Secrets are never logged |
| Hot paths | No allocations in tight loops when avoidable; preallocate slices; batch DB writes; bounded worker pools; `pprof` before optimising |
| Security | SQL only via sqlc or parameters; `http.Client` always has timeouts; size-cap every external body; validate all input at the edge; outbound URLs SSRF-checked (P1-11) |

## TypeScript / React

| Topic | Rule |
| :-- | :-- |
| Formatter and linter | Biome (`biome.json`): 2-space indent, double quotes, trailing commas, 100 columns, recommended rules |
| Types | `strict` TS. No `any` (use `unknown` and narrow). Types come from the generated Connect client, never hand-copied |
| Naming | Components `PascalCase.tsx`; hooks `useThing`; files are kebab- or Pascal-case, used consistently within a folder |
| Config | Every app or package has a `tsconfig.json` that extends `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) and declares `"paths": { "@/*": ["./src/*"] }`, plus a `vite.config.ts` with `resolve.tsconfigPaths: true`. Copy `scripts/test/fixtures/ts-alias/` (ADR-0004) |
| Imports | `@/…` for anything outside the current folder; `./x` for siblings; **never `../`** (Biome `noRestrictedImports` rejects it). Other workspace packages are imported by name (`@earlii/tokens`), never through `@/` or relative paths. Type-only imports use `import type` |
| Data | Server state in TanStack Query only; URL state in the router; local UI state in components. No global stores until one is needed |
| UX rules (SPEC section 4) | Optimistic updates with rollback; skeletons, never spinners; every destructive action gets a 5-second undo; 44 px targets; respect `prefers-reduced-motion` |
| Errors | Typed `ConnectError` handling at the query layer; user-facing copy from one place; never swallow errors |
| Dependencies | Check bundle impact before adding. shadcn components are copied in and owned. No UI kit on top |
| Security | Never `dangerouslySetInnerHTML` except through the sanitiser (P2-09); no tokens in localStorage (sessions are httpOnly cookies, P2-10) |

## SQL (Postgres, sqlc)

- Migrations are **forward-only** and follow expand → migrate → contract for breaking changes. One concern per migration.
- `snake_case`, plural tables, `id` primary keys (UUIDv7 or bigint per ADR in P1-01), and `created_at`/`updated_at` as `timestamptz`.
- Every foreign key and every `WHERE`/`ORDER BY` column on a hot path has an index, justified by `EXPLAIN (ANALYZE, BUFFERS)` in the PR.
- Use keyset pagination, never `OFFSET`, on user-facing lists.
- Idempotency is enforced with unique constraints and `ON CONFLICT`, not by application checks alone.

## Protobuf (buf)

- Package `earlii.<area>.v1`. Never break a published field: add new fields, deprecate old ones. `buf breaking` gates CI.
- Request/response message per RPC (`GetFeedRequest` / `GetFeedResponse`). Enums have an `_UNSPECIFIED = 0` value.

## Repo scripts (Node)

- ESM `.mjs`, zero runtime dependencies, Node built-ins only.
- Pure logic in `scripts/lib/`, thin CLIs that read input and call the logic, tests in `scripts/test/` with `node:test`.

## Tests

- **Layout:**
  - Go: `_test.go` next to the code, with integration tests in `*_integration_test.go` behind the `integration` build tag, using `pgtest.NewDatabase` (P0-04, ADR-0005);
  - web: `*.test.tsx` next to the component, plus e2e in `apps/web/e2e/`;
  - scripts: `scripts/test/`.
- **Every change covers four paths:**
  - **happy**: the normal case;
  - **sad**: expected failures such as a 404, invalid input or a timeout;
  - **edge**: empty, one item, the maximum, Unicode, time-zone boundaries;
  - **abuser**: hostile input such as injection, oversized payloads, replays or SSRF.
- **Deterministic:**
  - no `time.Sleep` for synchronisation; inject clocks;
  - seed any randomness;
  - no live network: use `httptest` and recorded fixtures under `testdata/`.
- **Fixtures** are real responses recorded once, scrubbed of PII, with a README noting the source and date.
- **Assertions** check behaviour, not implementation. Never weaken a test to get green.
- **Coverage** is a smell detector, not a goal. Mutation testing (gremlins, Stryker) checks the suites that guard critical logic (P1-05, P2-02).

## Git

- **Branches:** `<type>/<ID>-<slug>`, e.g. `feat/P1-04-greenhouse-connector`, `fix/BP-003-dup-postings`, `chore/R-01-deps-2026-11`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/). The types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` and `test`. Headers are at most 72 characters with no trailing period. The commit-msg hook enforces this.
- **No AI attribution:** no AI `Co-Authored-By` trailers or "generated with" footers. The hook rejects them.
- **PRs:** one roadmap item each, using the template, and **squash merge** by the owner only. The PR title becomes the squash commit, so it must be a Conventional Commit header.
