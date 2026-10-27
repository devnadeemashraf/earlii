package postgres

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/devnadeemashraf/earlii/backend/gen/db"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// MigrateLockID is the session advisory lock that serialises migrators, so
// containers that start together apply each version exactly once. The value
// is arbitrary; it only has to differ from any other advisory lock we take.
const MigrateLockID int64 = 0x6561726c69690001 // "earlii" + 1

// migrationLockTimeout caps how long one DDL statement waits for a table
// lock. An ALTER queued behind a long transaction blocks every query that
// arrives after it, so failing fast and retrying the deploy beats an outage.
const migrationLockTimeout = "5s"

// lockWait caps the wait for another migrator. River's and our migrations
// take seconds; anything longer is a stuck holder.
const lockWait = 2 * time.Minute

// closeTimeout bounds the final Close, which runs after ctx may be done.
const closeTimeout = 5 * time.Second

// MigrateResult lists the versions one Migrate call applied. Both are empty
// when the schema was already current.
type MigrateResult struct {
	River []int
	App   []int64
}

// Migrate brings the schema at url up to date: River's migrations first (our
// tables may reference River's later, never the reverse), then ours.
//
// It holds MigrateLockID on a dedicated connection for the whole run, and the
// lock is released when that connection closes, so a crashed migrator never
// leaves it held. The URL must reach Postgres directly: a transaction-mode
// pooler (PgBouncer) would hand the lock and the DDL different backends.
// Waiting for the lock respects ctx.
func Migrate(ctx context.Context, url string, logger *slog.Logger) (MigrateResult, error) {
	pc, err := parse(url)
	if err != nil {
		return MigrateResult{}, err
	}
	// On a cancelled ctx, pgx (v5.11.0, pgconn asyncClose) sends the server a
	// cancel request before closing the connection, so a statement stops
	// server-side too, not just in this process.

	lockCfg := pc.ConnConfig.Copy()
	// The lock connection sits idle while River and goose run. A role or
	// managed-host idle_session_timeout would end its session and free the
	// lock mid-run, so it is off for this session only.
	lockCfg.RuntimeParams["idle_session_timeout"] = "0"
	lockConn, err := pgx.ConnectConfig(ctx, lockCfg)
	if err != nil {
		return MigrateResult{}, fmt.Errorf("connect: %w", err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), closeTimeout)
		defer cancel()
		_ = lockConn.Close(closeCtx)
	}()

	num, err := db.New(lockConn).ServerVersionNum(ctx)
	if err != nil {
		return MigrateResult{}, fmt.Errorf("read server version: %w", err)
	}
	if err := CheckServerVersion(num); err != nil {
		return MigrateResult{}, err
	}

	logger.InfoContext(ctx, "waiting for the migration lock")
	// A holder that never lets go (a half-open session the server hasn't
	// noticed yet) must fail the deploy, not hang it.
	lockCtx, cancelLock := context.WithTimeout(ctx, lockWait)
	_, err = lockConn.Exec(lockCtx, "SELECT pg_advisory_lock($1)", MigrateLockID)
	if err != nil {
		// After a cancel request the server answers with its own error
		// (SQLSTATE 57014); keep the context's too, so callers can tell a
		// cancelled or timed-out wait from a failure with errors.Is.
		err = errors.Join(context.Cause(lockCtx), err)
	}
	cancelLock()
	if err != nil {
		return MigrateResult{}, fmt.Errorf("take migration lock (waited at most %s): %w", lockWait, err)
	}

	// River and goose need a pool; the lock stays on lockConn. lock_timeout
	// applies to these connections only, never to the advisory-lock wait.
	pc.ConnConfig.RuntimeParams["lock_timeout"] = migrationLockTimeout
	pc.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return MigrateResult{}, fmt.Errorf("create migration pool: %w", err)
	}
	defer pool.Close()

	var res MigrateResult
	if res.River, err = migrateRiver(ctx, pool, logger); err != nil {
		return res, err
	}
	// If the lock's connection died (idle kill, network blip), the lock went
	// with it and another migrator may be running: stop before our DDL.
	if err := lockConn.Ping(ctx); err != nil {
		return res, fmt.Errorf("migration lock lost: %w", err)
	}
	if res.App, err = migrateApp(ctx, pool, logger); err != nil {
		return res, err
	}

	if _, err := lockConn.Exec(ctx, "SELECT pg_advisory_unlock($1)", MigrateLockID); err != nil {
		return res, fmt.Errorf("release migration lock: %w", err)
	}
	return res, nil
}

func migrateRiver(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) ([]int, error) {
	m, err := rivermigrate.New(riverpgxv5.New(pool), &rivermigrate.Config{Logger: logger})
	if err != nil {
		return nil, fmt.Errorf("river migrator: %w", err)
	}
	// Migrate, not the deprecated MigrateTx: some River migrations can't share
	// one transaction. Each version commits on its own.
	out, err := m.Migrate(ctx, rivermigrate.DirectionUp, nil)
	if err != nil {
		return nil, fmt.Errorf("river migrations: %w", err)
	}
	applied := make([]int, 0, len(out.Versions))
	for _, v := range out.Versions {
		applied = append(applied, v.Version)
	}
	return applied, nil
}

func migrateApp(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) ([]int64, error) {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()

	files, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("migration files: %w", err)
	}
	// Out-of-order stays off (the default): a version lower than one already
	// applied is an error, not something silently slotted in.
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, files,
		goose.WithDisableGlobalRegistry(true), goose.WithSlog(logger))
	if err != nil {
		return nil, fmt.Errorf("goose provider: %w", err)
	}
	results, err := p.Up(ctx)
	if err != nil {
		if partial, ok := errors.AsType[*goose.PartialError](err); ok {
			return versions(partial.Applied), fmt.Errorf("app migrations: %w", err)
		}
		return nil, fmt.Errorf("app migrations: %w", err)
	}
	return versions(results), nil
}

func versions(results []*goose.MigrationResult) []int64 {
	out := make([]int64, 0, len(results))
	for _, r := range results {
		out = append(out, r.Source.Version)
	}
	return out
}
