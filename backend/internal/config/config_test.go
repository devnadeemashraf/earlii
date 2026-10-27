package config_test

import (
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/config"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := config.Load([]string{"EARLII_ENV=dev", "PATH=/usr/bin"})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := config.Config{
		Env:             config.Dev,
		HTTPAddr:        ":8080",
		LogLevel:        slog.LevelInfo,
		ShutdownTimeout: 8 * time.Second,
	}
	if !equal(cfg, want) {
		t.Fatalf("got %+v, want %+v", cfg, want)
	}
}

func TestLoadAllSet(t *testing.T) {
	cfg, err := config.Load([]string{
		"EARLII_ENV=prod",
		"EARLII_HTTP_ADDR=127.0.0.1:9000",
		"EARLII_LOG_LEVEL=debug",
		"EARLII_SHUTDOWN_TIMEOUT=2500ms",
	})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := config.Config{
		Env:             config.Prod,
		HTTPAddr:        "127.0.0.1:9000",
		LogLevel:        slog.LevelDebug,
		ShutdownTimeout: 2500 * time.Millisecond,
	}
	if !equal(cfg, want) {
		t.Fatalf("got %+v, want %+v", cfg, want)
	}
}

func TestLoadHTTPAddr(t *testing.T) {
	tests := []struct {
		name    string
		environ []string
		want    string
	}{
		{"PORT is the fallback (Render sets it)", []string{"PORT=10000"}, ":10000"},
		{"EARLII_HTTP_ADDR beats PORT", []string{"PORT=10000", "EARLII_HTTP_ADDR=:7000"}, ":7000"},
		{"IPv6 loopback", []string{"EARLII_HTTP_ADDR=[::1]:8080"}, "[::1]:8080"},
		{"localhost", []string{"EARLII_HTTP_ADDR=localhost:8080"}, "localhost:8080"},
		{"port 0 picks a free port in dev", []string{"EARLII_HTTP_ADDR=127.0.0.1:0"}, "127.0.0.1:0"},
		{"empty value means unset", []string{"EARLII_HTTP_ADDR="}, ":8080"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := config.Load(append([]string{"EARLII_ENV=dev"}, tt.environ...))
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if cfg.HTTPAddr != tt.want {
				t.Fatalf("HTTPAddr = %q, want %q", cfg.HTTPAddr, tt.want)
			}
		})
	}
}

func TestLoadRejects(t *testing.T) {
	tests := []struct {
		name    string
		environ []string
		wantKey string
	}{
		{"missing env", nil, "EARLII_ENV"},
		{"empty env", []string{"EARLII_ENV="}, "EARLII_ENV"},
		{"unknown env", []string{"EARLII_ENV=staging"}, "EARLII_ENV"},
		{"upper-case env", []string{"EARLII_ENV=PROD"}, "EARLII_ENV"},
		{"padded env", []string{"EARLII_ENV= prod"}, "EARLII_ENV"},
		{"addr without port", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=localhost"}, "EARLII_HTTP_ADDR"},
		{"addr is a URL", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=http://x:80"}, "EARLII_HTTP_ADDR"},
		{"addr hostname", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=example.com:80"}, "EARLII_HTTP_ADDR"},
		{"port too big", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=:65536"}, "EARLII_HTTP_ADDR"},
		{"negative port", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=:-1"}, "EARLII_HTTP_ADDR"},
		{"signed port", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=:+80"}, "EARLII_HTTP_ADDR"},
		{"leading-zero port", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=:080"}, "EARLII_HTTP_ADDR"},
		{"named port", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=:http"}, "EARLII_HTTP_ADDR"},
		{"random port in prod", []string{"EARLII_ENV=prod", "EARLII_HTTP_ADDR=:0"}, "EARLII_HTTP_ADDR"},
		{"bad PORT", []string{"EARLII_ENV=dev", "PORT=abc"}, "PORT"},
		{"PORT zero", []string{"EARLII_ENV=dev", "PORT=0"}, "PORT"},
		{"unknown log level", []string{"EARLII_ENV=dev", "EARLII_LOG_LEVEL=verbose"}, "EARLII_LOG_LEVEL"},
		{"log level offset", []string{"EARLII_ENV=dev", "EARLII_LOG_LEVEL=info+4"}, "EARLII_LOG_LEVEL"},
		{"duration without unit", []string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=8"}, "EARLII_SHUTDOWN_TIMEOUT"},
		{"zero duration", []string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=0s"}, "EARLII_SHUTDOWN_TIMEOUT"},
		{"negative duration", []string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=-1s"}, "EARLII_SHUTDOWN_TIMEOUT"},
		{"exponent duration", []string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=1e3s"}, "EARLII_SHUTDOWN_TIMEOUT"},
		// Docker sends SIGKILL 10 s after SIGTERM; the drain has to fit inside.
		{"duration past the kill deadline", []string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=9001ms"}, "EARLII_SHUTDOWN_TIMEOUT"},
		{"overflowing duration", []string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=99999999999h"}, "EARLII_SHUTDOWN_TIMEOUT"},
		{"key set twice", []string{"EARLII_ENV=dev", "EARLII_ENV=prod"}, "EARLII_ENV"},
		{"typo in dev", []string{"EARLII_ENV=dev", "EARLII_HTTP_ADRR=:1"}, "EARLII_HTTP_ADRR"},
		{"wrong case in dev", []string{"EARLII_ENV=dev", "earlii_log_level=debug"}, "earlii_log_level"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := config.Load(tt.environ)
			if err == nil {
				t.Fatal("Load succeeded, want an error")
			}
			if !strings.Contains(err.Error(), tt.wantKey) {
				t.Fatalf("error %q does not name %s", err, tt.wantKey)
			}
		})
	}
}

// Every problem is reported at once, so a broken deploy takes one fix, not
// one redeploy per variable.
func TestLoadReportsEveryError(t *testing.T) {
	_, err := config.Load([]string{
		"EARLII_ENV=staging", "EARLII_LOG_LEVEL=loud", "EARLII_SHUTDOWN_TIMEOUT=forever", "EARLII_HTTP_ADRR=:1",
	})
	if err == nil {
		t.Fatal("Load succeeded, want an error")
	}
	// Unknown keys are only tolerated when EARLII_ENV is explicitly prod.
	for _, key := range []string{"EARLII_ENV", "EARLII_LOG_LEVEL", "EARLII_SHUTDOWN_TIMEOUT", "EARLII_HTTP_ADRR"} {
		if !strings.Contains(err.Error(), key) {
			t.Errorf("error %q does not name %s", err, key)
		}
	}
}

// Config values will soon include DSNs and tokens; errors name the key only.
func TestLoadErrorsNeverEchoValues(t *testing.T) {
	const secret = "postgres://u:s3cret@h"
	environ := []string{
		"EARLII_ENV=" + secret,
		"EARLII_HTTP_ADDR=" + secret,
		"EARLII_LOG_LEVEL=" + secret,
		"EARLII_SHUTDOWN_TIMEOUT=" + secret,
		"EARLII_DATABASE_URLL=" + secret,
		"PORT=" + secret,
	}
	_, err := config.Load(environ)
	if err == nil {
		t.Fatal("Load succeeded, want an error")
	}
	if strings.Contains(err.Error(), "s3cret") {
		t.Fatalf("error leaks a value: %q", err)
	}
}

// A rollback to an older image must not crash-loop because the environment
// already has a variable only the newer image knows.
func TestLoadUnknownKeysWarnInProd(t *testing.T) {
	cfg, err := config.Load([]string{"EARLII_ENV=prod", "EARLII_NEW_FEATURE=on", "earlii_typo=x"})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if want := []string{"EARLII_NEW_FEATURE", "earlii_typo"}; !slices.Equal(cfg.UnknownKeys, want) {
		t.Fatalf("UnknownKeys = %v, want %v", cfg.UnknownKeys, want)
	}
}

// os.Environ on Windows includes per-drive entries such as "=C:=C:\work", and
// a hostile parent process can pass entries with no "=" at all.
func TestLoadIgnoresMalformedEntries(t *testing.T) {
	_, err := config.Load([]string{"=C:=C:\\work", "NOEQUALS", "", "=", "EARLII_ENV=dev"})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
}

func TestLoadAcceptsBoundaryTimeout(t *testing.T) {
	cfg, err := config.Load([]string{"EARLII_ENV=dev", "EARLII_SHUTDOWN_TIMEOUT=9s"})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ShutdownTimeout != 9*time.Second {
		t.Fatalf("ShutdownTimeout = %v, want 9s", cfg.ShutdownTimeout)
	}
}

func equal(a, b config.Config) bool {
	return a.Env == b.Env && a.HTTPAddr == b.HTTPAddr && a.LogLevel == b.LogLevel &&
		a.ShutdownTimeout == b.ShutdownTimeout && slices.Equal(a.UnknownKeys, b.UnknownKeys)
}
