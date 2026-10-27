package pgtest_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/devnadeemashraf/earlii/backend/internal/postgres/pgtest"
)

// The tests create and force-drop databases, so the admin URL must never
// point anywhere real.
func TestCheckAdminURL(t *testing.T) {
	tests := []struct {
		name string
		url  string
		ok   bool
	}{
		{"IPv4 loopback", "postgres://u:p@127.0.0.1:5432/postgres?sslmode=disable", true},
		{"localhost", "postgres://u:p@localhost:5432/postgres?sslmode=disable", true},
		{"IPv6 loopback", "postgres://u:p@[::1]:5432/postgres?sslmode=disable", true},
		{"empty", "", false},
		{"remote host", "postgres://u:p@db.example.com:5432/postgres", false},
		{"LAN address", "postgres://u:p@192.168.1.20:5432/postgres", false},
		{"loopback-looking hostname", "postgres://u:p@127.0.0.1.example.com/postgres", false},
		{"a loopback and a remote host", "postgres://u:p@127.0.0.1,db.example.com/postgres", false},
		{"keyword/value remote", "host=db.example.com user=u", false},
		{"unix socket", "host=/var/run/postgresql user=u", false},
		{"malformed", "postgres://u:p@h:notaport/x", false},
		{"connect_timeout is fine", "postgres://u:p@127.0.0.1/postgres?sslmode=disable&connect_timeout=5", true},
		// pgx lets query parameters override the path and host, so a test
		// database URL built by replacing the path could still point at a
		// real database.
		{"dbname in the query", "postgres://u:p@127.0.0.1/postgres?dbname=earlii", false},
		{"database in the query", "postgres://u:p@127.0.0.1/postgres?database=earlii", false},
		{"host in the query", "postgres://u:p@127.0.0.1/postgres?host=db.example.com", false},
		{"service in the query", "postgres://u:p@127.0.0.1/postgres?service=prod", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := pgtest.CheckAdminURL(tt.url)
			if (err == nil) != tt.ok {
				t.Fatalf("CheckAdminURL = %v, want ok=%v", err, tt.ok)
			}
			if err != nil && strings.Contains(err.Error(), "u:p@") {
				t.Fatalf("error leaks the URL: %q", err)
			}
		})
	}
}

// CREATE DATABASE can't take a bind parameter, so names are generated, never
// derived from test names (which hold spaces, quotes and slashes, and which
// Postgres would silently truncate at 63 bytes into collisions).
func TestNewNameIsSafeAndUnique(t *testing.T) {
	valid := regexp.MustCompile(`^earlii_test_[0-9a-f]{16}$`)
	seen := make(map[string]bool, 10000)
	for range 10000 {
		n := pgtest.NewName()
		if !valid.MatchString(n) {
			t.Fatalf("name %q does not match %s", n, valid)
		}
		if seen[n] {
			t.Fatalf("duplicate name %q", n)
		}
		seen[n] = true
	}
}
