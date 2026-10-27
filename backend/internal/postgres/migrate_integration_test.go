//go:build integration

package postgres_test

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/devnadeemashraf/earlii/backend/gen/db"
	"github.com/devnadeemashraf/earlii/backend/internal/postgres"
	"github.com/devnadeemashraf/earlii/backend/internal/postgres/pgtest"
)

var quiet = slog.New(slog.DiscardHandler)

func TestMigrateFromEmpty(t *testing.T) {
	url := pgtest.NewDatabase(t)

	res, err := postgres.Migrate(t.Context(), url, quiet)
	if err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if want := riverVersions(t, url); !slices.Equal(res.River, want) {
		t.Errorf("River applied %v, want every version %v", res.River, want)
	}
	if !slices.Equal(res.App, []int64{1}) {
		t.Errorf("App applied %v, want [1]", res.App)
	}

	conn := connect(t, url)
	var riverJob, gooseMax any
	if err := conn.QueryRow(t.Context(), "SELECT to_regclass('river_job')::text").Scan(&riverJob); err != nil || riverJob == nil {
		t.Errorf("river_job missing after migrate (err %v)", err)
	}
	if err := conn.QueryRow(t.Context(), "SELECT max(version_id) FROM goose_db_version").Scan(&gooseMax); err != nil || gooseMax != int64(1) {
		t.Errorf("goose version = %v (err %v), want 1", gooseMax, err)
	}
}

// Forward-only and idempotent: a second run (every deploy does one) applies
// nothing and changes nothing.
func TestMigrateTwiceIsANoop(t *testing.T) {
	url := pgtest.NewDatabase(t)
	if _, err := postgres.Migrate(t.Context(), url, quiet); err != nil {
		t.Fatalf("first Migrate: %v", err)
	}
	before := schemaSnapshot(t, url)

	res, err := postgres.Migrate(t.Context(), url, quiet)
	if err != nil {
		t.Fatalf("second Migrate: %v", err)
	}
	if len(res.River) != 0 || len(res.App) != 0 {
		t.Fatalf("second run applied %+v, want nothing", res)
	}
	if after := schemaSnapshot(t, url); after != before {
		t.Fatalf("schema changed on a no-op run:\nbefore %s\nafter  %s", before, after)
	}
}

// Containers that start together all run migrate. The advisory lock lets
// exactly one apply each version; the rest wait, then find nothing to do.
func TestMigrateConcurrently(t *testing.T) {
	url := pgtest.NewDatabase(t)
	const n = 4
	results := make([]postgres.MigrateResult, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() { results[i], errs[i] = postgres.Migrate(t.Context(), url, quiet) })
	}
	wg.Wait()

	var river []int
	var app []int64
	for i := range n {
		if errs[i] != nil {
			t.Fatalf("Migrate %d: %v", i, errs[i])
		}
		river = append(river, results[i].River...)
		app = append(app, results[i].App...)
	}
	slices.Sort(river)
	if want := riverVersions(t, url); !slices.Equal(river, want) {
		t.Errorf("River versions applied across runs = %v, want each once: %v", river, want)
	}
	if !slices.Equal(app, []int64{1}) {
		t.Errorf("App versions applied across runs = %v, want [1] once", app)
	}
}

// A stuck migrator must not hang a deploy forever: waiting for the lock
// respects ctx, and the database is untouched.
func TestMigrateWaitsForTheLockAndHonoursCancel(t *testing.T) {
	url := pgtest.NewDatabase(t)
	holder := connect(t, url)
	if _, err := holder.Exec(t.Context(), "SELECT pg_advisory_lock($1)", postgres.MigrateLockID); err != nil {
		t.Fatalf("take lock: %v", err)
	}

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	errCh := make(chan error, 1)
	go func() {
		_, err := postgres.Migrate(ctx, url, quiet)
		errCh <- err
	}()

	// Cancel only once Migrate is provably queued on the lock, so the test
	// covers the wait itself, not connecting, on any runner speed.
	waitForWaiters(t, holder, 1)
	cancel()
	if err := <-errCh; !errors.Is(err, context.Canceled) {
		t.Fatalf("Migrate while locked = %v, want a cancellation error", err)
	}
	// The server dropped the wait too: no leftover waiter grabs the lock later.
	waitForWaiters(t, holder, 0)

	var reg any
	if err := holder.QueryRow(t.Context(), "SELECT to_regclass('river_job')::text").Scan(&reg); err != nil || reg != nil {
		t.Fatalf("river_job exists (%v, err %v): Migrate ran without the lock", reg, err)
	}

	if _, err := holder.Exec(t.Context(), "SELECT pg_advisory_unlock($1)", postgres.MigrateLockID); err != nil {
		t.Fatalf("release lock: %v", err)
	}
	if _, err := postgres.Migrate(t.Context(), url, quiet); err != nil {
		t.Fatalf("Migrate after release: %v", err)
	}
}

// The sqlc round-trip: generated code, pgx and a real server agree on types.
func TestServerVersionRoundTrip(t *testing.T) {
	url := pgtest.NewDatabase(t)
	pool, err := postgres.NewPool(t.Context(), url)
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(t.Context()); err != nil {
		t.Fatalf("Ping: %v", err)
	}

	num, err := db.New(pool).ServerVersionNum(t.Context())
	if err != nil {
		t.Fatalf("ServerVersionNum: %v", err)
	}
	if err := postgres.CheckServerVersion(num); err != nil {
		t.Fatalf("test server: %v", err)
	}
}

func connect(t *testing.T, url string) *pgx.Conn {
	t.Helper()
	conn, err := pgx.Connect(t.Context(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close(context.WithoutCancel(t.Context())) })
	return conn
}

// waitForWaiters polls until exactly want sessions wait on an advisory lock
// in this database, or fails after 10 s. Polling a server-side condition is
// the only way to observe another backend's lock wait.
func waitForWaiters(t *testing.T, conn *pgx.Conn, want int) {
	t.Helper()
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	deadline := time.After(10 * time.Second)
	for {
		var n int
		err := conn.QueryRow(t.Context(), `
			SELECT count(*) FROM pg_locks
			 WHERE locktype = 'advisory' AND NOT granted
			   AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`).Scan(&n)
		if err != nil {
			t.Fatalf("pg_locks: %v", err)
		}
		if n == want {
			return
		}
		select {
		case <-tick.C:
		case <-deadline:
			t.Fatalf("%d advisory-lock waiters, want %d", n, want)
		}
	}
}

// riverVersions lists every River migration version this build knows.
func riverVersions(t *testing.T, url string) []int {
	t.Helper()
	pool, err := postgres.NewPool(t.Context(), url)
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	defer pool.Close()
	m, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		t.Fatalf("rivermigrate.New: %v", err)
	}
	all := m.AllVersions()
	versions := make([]int, 0, len(all))
	for _, v := range all {
		versions = append(versions, v.Version)
	}
	return versions
}

// schemaSnapshot lists every column and index in the public schema, plus the
// version tables' row counts, as one comparable string.
func schemaSnapshot(t *testing.T, url string) string {
	t.Helper()
	var s string
	err := connect(t, url).QueryRow(t.Context(), `
		SELECT concat_ws(' | ',
			(SELECT string_agg(table_name || '.' || column_name || ':' || data_type, ',' ORDER BY table_name, column_name)
			   FROM information_schema.columns WHERE table_schema = 'public'),
			(SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public'),
			(SELECT count(*) FROM goose_db_version)::text,
			(SELECT count(*) FROM river_migration)::text)`).Scan(&s)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	return s
}
