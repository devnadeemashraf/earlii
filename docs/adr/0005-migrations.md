# ADR-0005: Migrations: goose in the binary, River first, an explicit migrate mode

- **Status:** Accepted
- **Date:** 2026-10-28
- **Roadmap item:** P0-04 (closes D-07 and D-10)
- **Deciders:** owner (+ architect / red-team subagents)

## Context

SPEC X asks for "safe forward-only migrations", and SPEC Z for one-command local setup. The constraints:

- **One binary, several modes** (ADR-0003). Render (D-04) and Compose start every container from the same image, often at the same moment.
- **Two schemas.** River ships its own versioned migrations (8 at v0.50.0). Ours start with P1-01.
- **Forward-only.** A deployed migration is never edited or rolled back. Breaking changes follow expand, migrate, contract: add the new shape, backfill and switch the code over, then drop the old shape in a later release.
- **Locks.** DDL such as `ALTER TABLE` takes an ACCESS EXCLUSIVE lock. It waits behind any long transaction, and every query that arrives after it queues behind the DDL. One migration can stall the whole API.
- **Free tiers.** No paid migration service. CI runs on GitHub's Linux and Windows runners, and only Linux can run Linux containers.
- **Verified at the pinned versions** (`go doc`, module source):
  - `rivermigrate.MigrateTx` is deprecated, because some River migrations can't share one transaction;
  - rivermigrate takes no lock of its own;
  - goose's `Provider` locks only when given a locker.

## Options considered

### D-07 A: goose v3 as a library, SQL files embedded with `embed.FS`
- **Pros:** plain SQL, one transaction per file, a `Provider` API with an `Up` that returns what it applied, Go migrations if ever needed, and an MIT licence. sqlc reads goose files directly.
- **Cons:** it works through `database/sql`, which needs pgx's `stdlib.OpenDBFromPool` adapter. It keeps no checksums, so editing an applied file goes unnoticed (we add our own check).

### D-07 B: tern
- **Pros:** native pgx, small.
- **Cons:** a smaller community, and sqlc doesn't know its file format.

### D-07 C: Atlas
- **Pros:** declarative diffs and migration linting.
- **Cons:** a heavy CLI, some features paid, and a different model (desired state rather than reviewed SQL steps). Too much for one person.

### Running River's migrations
- **R1:** a goose Go migration that calls `MigrateTx` inside goose's transaction. Rejected: the API is deprecated for exactly this use.
- **R2 (chosen):** `rivermigrate.Migrate` then goose `Up`, in one process, under one advisory lock we take ourselves.

### Who runs migrations
- **W1:** auto-migrate when `api` boots. Every replica races for the lock, boot gets slower, and a bad migration crash-loops the whole fleet.
- **W2 (chosen):** an explicit `earlii migrate` mode: a one-shot that exits 0 when done. Compose and the deploy run it before the long-running modes.

### D-10: DB integration tests
- **T1 (chosen):** a GitHub Actions service container (`postgres:18.6-alpine`) in a separate ubuntu `integration` job.
- **T2:** testcontainers-go. It needs a Docker API on every runner (windows-latest can't run Linux containers) and adds a large dependency tree.

## Decision

1. **goose v3, embedded.** Files live in `backend/internal/postgres/migrations/`, named `NNNNN_snake_case.sql`, and contain only an Up section.
2. **`earlii migrate`** (`postgres.Migrate`) runs the following steps:
   - open a dedicated connection;
   - refuse servers older than Postgres 18;
   - take `pg_advisory_lock(MigrateLockID)` with `idle_session_timeout` off for that session. The wait is capped at 2 minutes and respects Ctrl-C and SIGTERM. when pgx closes a cancelled connection it sends the server a cancel request first, so a cancelled statement also stops server-side;
   - apply River's migrations, then ours, on a two-connection pool with `lock_timeout = 5s`;
   - check that the lock connection is still alive before our DDL;
   - unlock.
   
   The session lock dies with its connection, so a crashed migrator never leaves it held. River goes first because our tables may reference River's, never the reverse.
3. **Forward-only is enforced, not just written down.** `task lint:migrations` (`scripts/lib/migrations.mjs`, tested) fails on any of:
   - an edited or deleted file that is already on main;
   - a new version not above main's highest;
   - a duplicate version;
   - a bad name;
   - a missing Up annotation;
   - any Down section.
4. **Integration tests** sit behind `//go:build integration`, against `EARLII_TEST_DATABASE_URL`. That URL must be loopback (`pgtest.CheckAdminURL`). Each test gets a fresh database with a random `earlii_test_<16 hex>` name, force-dropped afterwards. An unset URL fails the tests rather than skipping them. `task test:integration` falls back to the running compose database, and otherwise prints `skip:`.
5. **One migration, one concern.** Each SQL file runs in one transaction. `-- +goose NO TRANSACTION` is only for `CREATE INDEX CONCURRENTLY`, alone in its file and with `IF NOT EXISTS`. If such a file fails it can leave an INVALID index: drop it, then rerun.

## Consequences

- **Positive:**
  - one command migrates everything;
  - containers that start together apply each version exactly once (`TestMigrateConcurrently`);
  - a stuck lock can't hang a deploy forever;
  - DDL fails fast rather than freezing the API behind a long transaction;
  - schema history is reviewed SQL.
- **Negative / accepted trade-offs:**
  - **Two version tables.** `river_migration` and `goose_db_version` both exist; River's migrations are not in goose's history.
  - **A direct connection for migrate.** A transaction-mode pooler (PgBouncer) would hand the lock and the DDL different backends. The prod migrate URL must therefore reach Postgres directly; decide this with D-04.
  - **One role.** The app and the migrations share one database role, so the runtime role owns the schema. A separate migrate role with DML-only app access is a follow-up for P2-17.
  - **Retries.** A `lock_timeout` failure, or a lock wait past 2 minutes, means retrying the deploy.
  - **Readiness doesn't check the schema version.** `/readyz` only pings. Deploy order is the gate: Compose runs `api` after `migrate` succeeds (P0-06), and Render runs migrate as a pre-deploy step (P2-17).
  - **Pool size isn't capped by config.** A per-process `pool_max_conns` that fits the host's connection limit is set at deploy (D-04).
- **Revisit if:**
  - River needs a migration that can't run through `Migrate`;
  - the prod host forbids advisory locks or direct connections;
  - we want declarative drift detection (Atlas).

## Prod database TLS (config, decided with this ADR)

In prod, `EARLII_DATABASE_URL` must authenticate the server on every host it may try. That means `verify-full`, or `verify-ca` with a pinned `sslrootcert`. pgx's `verify-ca` against the system roots accepts any public certificate for any host name. `require` checks nothing, `prefer` falls back to plaintext, and so does a missing `sslmode` (libpq's default is `prefer`). The check runs on the parsed pgx config, so the `ssl=true` alias, a repeated `sslmode` and `PGSSLMODE` can't slip past. `PG*` variables that pgx reads fail the boot, so the URL is the whole story. Whether Render supports `verify-full` is UNVERIFIED (VERSIONS); check at D-04.

## Verification

- `backend/internal/postgres/migrate_integration_test.go`:
  - up from empty;
  - a second run is a no-op with an identical schema snapshot;
  - four concurrent migrators apply each version once;
  - a held lock makes `Migrate` wait and then honour cancellation;
  - the sqlc round-trip.
- `backend/cmd/earlii/main_integration_test.go`: migrate, then `/readyz` is 200.
- `scripts/test/migrations.test.mjs`: the forward-only rules.
- The `integration` CI job runs all of the above on every PR.
