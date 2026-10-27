// Package pgtest gives integration tests (build tag integration) their own
// throwaway Postgres databases on the server at EARLII_TEST_DATABASE_URL.
//
// Every test gets a fresh, empty database, created from a random name and
// force-dropped when the test ends, so tests can run in parallel and never
// see each other's rows. Only databases created in this process are dropped.
package pgtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// EnvURL names the variable holding the admin URL: a role allowed to CREATE
// DATABASE, on a loopback server. `task test:integration` sets it.
const EnvURL = "EARLII_TEST_DATABASE_URL"

const namePrefix = "earlii_test_"

const execTimeout = 15 * time.Second

// NewDatabase creates an empty database and returns its URL. It fails the
// test (never skips it) when EnvURL is unset: the integration build tag is
// the opt-in, and a silent skip would turn CI green for nothing.
func NewDatabase(t testing.TB) string {
	t.Helper()
	admin := os.Getenv(EnvURL)
	if err := CheckAdminURL(admin); err != nil {
		t.Fatalf("%s: %v", EnvURL, err)
	}

	name := NewName()
	u, err := url.Parse(admin)
	if err != nil {
		t.Fatalf("%s: not a URL", EnvURL)
	}
	u.Path = "/" + name
	// Belt and braces on CheckAdminURL: the URL must resolve to this name.
	if pc, err := pgconn.ParseConfig(u.String()); err != nil || pc.Database != name {
		t.Fatalf("%s: the test database URL doesn't resolve to %s", EnvURL, name)
	}

	exec(t, admin, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize())
	t.Cleanup(func() {
		// WITH (FORCE) ends sessions a failed test left open (Postgres 13+).
		exec(t, admin, "DROP DATABASE IF EXISTS "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)")
	})
	return u.String()
}

// adminQueryKeys are the only query parameters an admin URL may carry. pgx
// lets query parameters override the path and host (dbname, host, service,
// ...), which would point a "throwaway" database URL somewhere real.
var adminQueryKeys = []string{"sslmode", "connect_timeout"}

// CheckAdminURL accepts only postgres:// URLs whose every host is loopback,
// because the tests create and force-drop databases on that server.
func CheckAdminURL(raw string) error {
	if raw == "" {
		return errors.New("unset: point it at a local server, such as the compose one (see docs/HANDBOOK.md)")
	}
	if !strings.HasPrefix(raw, "postgres://") && !strings.HasPrefix(raw, "postgresql://") {
		return errors.New("must be a postgres:// URL")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("invalid URL (not shown, it may hold a password)")
	}
	for k := range u.Query() {
		if !slices.Contains(adminQueryKeys, k) {
			return fmt.Errorf("query parameter %q not allowed (only %s)", k, strings.Join(adminQueryKeys, ", "))
		}
	}
	pc, err := pgconn.ParseConfig(raw)
	if err != nil {
		return errors.New("invalid URL (not shown, it may hold a password)")
	}
	hosts := []string{pc.Host}
	for _, f := range pc.Fallbacks {
		hosts = append(hosts, f.Host)
	}
	for _, h := range hosts {
		if h != "localhost" && !isLoopback(h) {
			return errors.New("every host must be loopback: tests drop databases on this server")
		}
	}
	return nil
}

func isLoopback(host string) bool {
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// NewName returns a fresh database name: the prefix and 64 random bits, safe
// as an identifier and far below Postgres's 63-byte limit.
func NewName() string {
	var b [8]byte
	_, _ = rand.Read(b[:]) // crypto/rand.Read never fails (Go 1.24+)
	return namePrefix + hex.EncodeToString(b[:])
}

// exec runs one statement on its own admin connection. It ignores the test's
// cancellation (cleanup must still drop the database) but not a stalled
// server: everything is bounded by execTimeout.
func exec(t testing.TB, admin, sql string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.WithoutCancel(t.Context()), execTimeout)
	defer cancel()
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatalf("connect to the test server: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()
	if _, err := conn.Exec(ctx, sql); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}
