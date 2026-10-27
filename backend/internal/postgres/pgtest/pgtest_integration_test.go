//go:build integration

package pgtest_test

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/devnadeemashraf/earlii/backend/internal/postgres/pgtest"
)

// The URL handed to a test reaches the throwaway database, and the cleanup
// really drops it.
func TestNewDatabaseIsFreshAndDropped(t *testing.T) {
	var url, name string
	t.Run("inner", func(t *testing.T) {
		url = pgtest.NewDatabase(t)
		conn, err := pgx.Connect(t.Context(), url)
		if err != nil {
			t.Fatalf("connect: %v", err)
		}
		defer func() { _ = conn.Close(t.Context()) }()
		if err := conn.QueryRow(t.Context(), "SELECT current_database()").Scan(&name); err != nil {
			t.Fatalf("current_database: %v", err)
		}
		if !strings.HasPrefix(name, "earlii_test_") {
			t.Fatalf("connected to %q, want a throwaway database", name)
		}
	})

	if _, err := pgx.Connect(t.Context(), url); err == nil {
		t.Fatalf("database %s still accepts connections after cleanup", name)
	}
}
