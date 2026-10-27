package config_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/config"
)

const (
	devURL  = "postgres://earlii:pw@127.0.0.1:5432/earlii?sslmode=disable"
	prodURL = "postgres://earlii:pw@db.example.com:5432/earlii?sslmode=verify-full"
	devDB   = "EARLII_DATABASE_URL=" + devURL
	prodDB  = "EARLII_DATABASE_URL=" + prodURL
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := config.Load([]string{"EARLII_ENV=dev", devDB, "PATH=/usr/bin"})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := config.Config{
		Env:             config.Dev,
		DatabaseURL:     config.Secret(devURL),
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
		prodDB,
		"EARLII_HTTP_ADDR=127.0.0.1:9000",
		"EARLII_LOG_LEVEL=debug",
		"EARLII_SHUTDOWN_TIMEOUT=2500ms",
	})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := config.Config{
		Env:             config.Prod,
		DatabaseURL:     config.Secret(prodURL),
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
			cfg, err := config.Load(append([]string{"EARLII_ENV=dev", devDB}, tt.environ...))
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
		// Unparseable, so a parser error that quotes its input would leak.
		"EARLII_DATABASE_URL=" + secret + ":99999/db?sslmode=bogus",
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
	cfg, err := config.Load([]string{"EARLII_ENV=prod", prodDB, "EARLII_NEW_FEATURE=on", "earlii_typo=x"})
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
	_, err := config.Load([]string{"=C:=C:\\work", "NOEQUALS", "", "=", "EARLII_ENV=dev", devDB})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
}

func TestLoadAcceptsBoundaryTimeout(t *testing.T) {
	cfg, err := config.Load([]string{"EARLII_ENV=dev", devDB, "EARLII_SHUTDOWN_TIMEOUT=9s"})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ShutdownTimeout != 9*time.Second {
		t.Fatalf("ShutdownTimeout = %v, want 9s", cfg.ShutdownTimeout)
	}
}

func TestLoadDatabaseURL(t *testing.T) {
	tests := []struct {
		name string
		env  string
		url  string
	}{
		{"dev may skip TLS", "dev", "postgres://u:p@127.0.0.1:5432/earlii?sslmode=disable"},
		{"dev keyword/value form", "dev", "host=127.0.0.1 port=5432 user=u dbname=earlii sslmode=disable"},
		{"prod with verify-full", "prod", "postgres://u:p@db.example.com/earlii?sslmode=verify-full"},
		{"prod with two hosts, both verified", "prod", "postgres://u:p@a.example.com,b.example.com/earlii?sslmode=verify-full"},
		{"pool size", "dev", "postgres://u:p@h/db?sslmode=disable&pool_max_conns=5"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := config.Load([]string{"EARLII_ENV=" + tt.env, "EARLII_DATABASE_URL=" + tt.url})
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if cfg.DatabaseURL.Reveal() != tt.url {
				t.Fatalf("DatabaseURL = %q, want %q", cfg.DatabaseURL.Reveal(), tt.url)
			}
		})
	}
}

func TestLoadRejectsDatabaseURL(t *testing.T) {
	tests := []struct {
		name string
		env  string
		url  string
	}{
		{"missing", "dev", ""},
		{"not a URL", "dev", "postgres://u:p@h:notaport/db"},
		{"unknown sslmode", "dev", "postgres://u:p@h/db?sslmode=sometimes"},
		{"wrong scheme", "dev", "mysql://u:p@h/db"},
		// libpq's default (prefer) silently falls back to plaintext.
		{"prod without sslmode", "prod", "postgres://u:p@db.example.com/earlii"},
		{"prod with disable", "prod", "postgres://u:p@db.example.com/earlii?sslmode=disable"},
		{"prod with allow", "prod", "postgres://u:p@db.example.com/earlii?sslmode=allow"},
		{"prod with prefer", "prod", "postgres://u:p@db.example.com/earlii?sslmode=prefer"},
		// require encrypts but accepts any certificate: an on-path attacker
		// reads the password.
		{"prod with require", "prod", "postgres://u:p@db.example.com/earlii?sslmode=require"},
		{"prod with the ssl=true alias", "prod", "postgres://u:p@db.example.com/earlii?ssl=true"},
		// verify-ca without a CA file trusts any public certificate for any
		// host name.
		{"prod with verify-ca and no sslrootcert", "prod", "postgres://u:p@db.example.com/earlii?sslmode=verify-ca"},
		{"prod with a later sslmode downgrade", "prod", "postgres://u:p@db.example.com/earlii?sslmode=verify-full&sslmode=disable"},
		// Keys that read files or change the session are not allowed anywhere.
		{"servicefile", "dev", "postgres://u:p@h/db?sslmode=disable&servicefile=/tmp/x"},
		{"service", "dev", "postgres://u:p@h/db?sslmode=disable&service=evil"},
		{"passfile", "dev", "postgres://u:p@h/db?sslmode=disable&passfile=/etc/passwd"},
		{"options", "dev", "postgres://u:p@h/db?sslmode=disable&options=-c%20search_path%3Devil"},
		{"keyword/value servicefile", "dev", "host=h user=u password=p servicefile=/tmp/x sslmode=disable"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			environ := []string{"EARLII_ENV=" + tt.env}
			if tt.url != "" {
				environ = append(environ, "EARLII_DATABASE_URL="+tt.url)
			}
			_, err := config.Load(environ)
			if err == nil {
				t.Fatal("Load succeeded, want an error")
			}
			if !strings.Contains(err.Error(), "EARLII_DATABASE_URL") {
				t.Fatalf("error %q does not name EARLII_DATABASE_URL", err)
			}
			if strings.Contains(err.Error(), "u:p@") {
				t.Fatalf("error leaks the URL: %q", err)
			}
		})
	}
}

// pgx fills a missing sslmode from PGSSLMODE, which config.Load can't keep out
// of the process. Validating the parsed result catches the downgrade anyway.
func TestLoadRejectsPGSSLMODEDowngradeInProd(t *testing.T) {
	t.Setenv("PGSSLMODE", "disable")
	_, err := config.Load([]string{"EARLII_ENV=prod", "EARLII_DATABASE_URL=postgres://u:p@db.example.com/earlii"})
	if err == nil || !strings.Contains(err.Error(), "EARLII_DATABASE_URL") {
		t.Fatalf("Load error = %v, want one naming EARLII_DATABASE_URL", err)
	}
}

// pgx quotes the input in parse errors and redacts passwords only on a
// best-effort basis. None of these shapes may leak the sentinel.
func TestLoadNeverLeaksAMalformedDatabaseURL(t *testing.T) {
	const sentinel = "Zq9SENTINEL"
	for _, url := range []string{
		"postgres://u:" + sentinel + "@h:notaport/db",
		"postgres://u:" + sentinel + ":x@h/db?sslmode=bogus",
		"postgres://u:" + sentinel + "@@h/db?connect_timeout=x",
		"postgres://u:p%ZZ" + sentinel + "@h/db",
		"host=h password = " + sentinel + " sslmode=bogus",
		"host=h password='" + sentinel + "' port=x",
		"host=h password=" + sentinel + " servicefile=/x",
		"user=u password=" + sentinel + "@h:#/% port=99999",
	} {
		t.Run(url, func(t *testing.T) {
			_, err := config.Load([]string{"EARLII_ENV=dev", "EARLII_DATABASE_URL=" + url})
			if err == nil {
				t.Fatal("Load succeeded, want an error")
			}
			if strings.Contains(err.Error(), sentinel) {
				t.Fatalf("error leaks the password: %q", err)
			}
		})
	}
}

// verify-ca is fine with a pinned CA: the chain must lead to that CA.
func TestLoadAcceptsVerifyCAWithARootCertInProd(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(path, selfSignedPEM(t), 0o600); err != nil {
		t.Fatal(err)
	}
	url := "postgres://u:p@db.example.com/earlii?sslmode=verify-ca&sslrootcert=" + filepath.ToSlash(path)
	if _, err := config.Load([]string{"EARLII_ENV=prod", "EARLII_DATABASE_URL=" + url}); err != nil {
		t.Fatalf("Load: %v", err)
	}
}

// pgx fills anything the URL leaves out from PG* variables, which the key
// allowlist can't see (PGOPTIONS, PGSERVICEFILE, PGTARGETSESSIONATTRS, ...).
// Their presence fails the boot, so the URL is the whole story.
func TestLoadRejectsPGVariables(t *testing.T) {
	for _, kv := range []string{"PGOPTIONS=-c search_path=evil", "PGSERVICEFILE=/tmp/x", "PGHOST=evil", "pgsslmode=disable"} {
		t.Run(kv, func(t *testing.T) {
			_, err := config.Load([]string{"EARLII_ENV=dev", devDB, kv})
			key, _, _ := strings.Cut(kv, "=")
			if err == nil || !strings.Contains(err.Error(), key) {
				t.Fatalf("Load error = %v, want one naming %s", err, key)
			}
			if strings.Contains(err.Error(), "evil") {
				t.Fatalf("error echoes the value: %q", err)
			}
		})
	}
	// Variables pgx doesn't read are none of our business.
	if _, err := config.Load([]string{"EARLII_ENV=dev", devDB, "PGID=1000", "PAGER=less"}); err != nil {
		t.Fatalf("Load: %v", err)
	}
}

func selfSignedPEM(t *testing.T) []byte {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "test CA"},
		NotBefore: time.Unix(0, 0), NotAfter: time.Unix(1<<32, 0), IsCA: true, BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

func TestLoadToleratesTheTestDatabaseURL(t *testing.T) {
	if _, err := config.Load([]string{"EARLII_ENV=dev", devDB, "EARLII_TEST_DATABASE_URL=" + devURL}); err != nil {
		t.Fatalf("Load: %v", err)
	}
}

// A Secret printed by accident (a %v of the whole Config, a log attribute)
// shows a placeholder, never the value.
func TestSecretNeverPrints(t *testing.T) {
	cfg, err := config.Load([]string{"EARLII_ENV=dev", devDB})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	var logged strings.Builder
	slog.New(slog.NewJSONHandler(&logged, nil)).Info("boot", slog.Any("cfg", cfg), slog.Any("url", cfg.DatabaseURL))
	for name, got := range map[string]string{
		"%v":   fmt.Sprintf("%v", cfg),
		"%+v":  fmt.Sprintf("%+v", cfg),
		"%#v":  fmt.Sprintf("%#v", cfg),
		"%q":   fmt.Sprintf("%q", cfg.DatabaseURL),
		"slog": logged.String(),
	} {
		if strings.Contains(got, "pw@") {
			t.Errorf("%s leaks the URL: %s", name, got)
		}
	}
}

func equal(a, b config.Config) bool {
	return a.Env == b.Env && a.DatabaseURL == b.DatabaseURL && a.HTTPAddr == b.HTTPAddr && a.LogLevel == b.LogLevel &&
		a.ShutdownTimeout == b.ShutdownTimeout && slices.Equal(a.UnknownKeys, b.UnknownKeys)
}
