package postgres_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/postgres"
)

// Port 1 on loopback refuses at once, so these run without a database.
const unreachable = "postgres://earlii:Zq9SENTINEL@127.0.0.1:1/earlii?sslmode=disable&connect_timeout=2"

func TestNewPoolIsLazy(t *testing.T) {
	pool, err := postgres.NewPool(t.Context(), unreachable)
	if err != nil {
		t.Fatalf("NewPool: %v (it must not connect at creation)", err)
	}
	pool.Close()
}

func TestNewPoolConnectTimeout(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want time.Duration
	}{
		{"default when unset", "postgres://u@127.0.0.1/db", 5 * time.Second},
		// connect_timeout=0 means "wait forever" to libpq; a blackholed host
		// would hang boot and migrations.
		{"zero means the default", "postgres://u@127.0.0.1/db?connect_timeout=0", 5 * time.Second},
		{"explicit value kept", "postgres://u@127.0.0.1/db?connect_timeout=2", 2 * time.Second},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pool, err := postgres.NewPool(t.Context(), tt.url)
			if err != nil {
				t.Fatalf("NewPool: %v", err)
			}
			defer pool.Close()
			if got := pool.Config().ConnConfig.ConnectTimeout; got != tt.want {
				t.Fatalf("ConnectTimeout = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNewPoolNeverLeaksAMalformedURL(t *testing.T) {
	_, err := postgres.NewPool(t.Context(), "postgres://u:Zq9SENTINEL@h:notaport/db")
	if err == nil {
		t.Fatal("NewPool succeeded, want an error")
	}
	if strings.Contains(err.Error(), "Zq9SENTINEL") {
		t.Fatalf("error leaks the password: %q", err)
	}
}

func TestPingUnreachableFailsWithoutLeaking(t *testing.T) {
	pool, err := postgres.NewPool(t.Context(), unreachable)
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	defer pool.Close()
	err = pool.Ping(t.Context())
	if err == nil {
		t.Fatal("Ping succeeded against a closed port")
	}
	if strings.Contains(err.Error(), "Zq9SENTINEL") {
		t.Fatalf("error leaks the password: %q", err)
	}
}

func TestMigrateUnreachableFailsWithoutLeaking(t *testing.T) {
	var logs bytes.Buffer
	_, err := postgres.Migrate(t.Context(), unreachable, slog.New(slog.NewJSONHandler(&logs, nil)))
	if err == nil {
		t.Fatal("Migrate succeeded against a closed port")
	}
	for name, s := range map[string]string{"error": err.Error(), "logs": logs.String()} {
		if strings.Contains(s, "Zq9SENTINEL") {
			t.Fatalf("%s leaks the password: %q", name, s)
		}
	}
}

func TestCheckServerVersion(t *testing.T) {
	tests := []struct {
		num  int32
		ok   bool
		name string
	}{
		{180000, true, "18.0"},
		{180006, true, "18.6"},
		{190002, true, "19.2"},
		{170009, false, "17.9"},
		{0, false, "zero"},
		{-1, false, "negative"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := postgres.CheckServerVersion(tt.num)
			if (err == nil) != tt.ok {
				t.Fatalf("CheckServerVersion(%d) = %v, want ok=%v", tt.num, err, tt.ok)
			}
		})
	}
}
