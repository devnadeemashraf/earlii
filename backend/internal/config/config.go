// Package config loads and validates the process configuration from the
// environment, once, at boot. Anything invalid fails the boot with every
// problem listed.
package config

import (
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Env is the deployment environment. It is required so that production can
// never silently run on development defaults.
type Env string

// The supported environments.
const (
	Dev  Env = "dev"
	Prod Env = "prod"
)

const (
	keyEnv             = "EARLII_ENV"
	keyHTTPAddr        = "EARLII_HTTP_ADDR"
	keyLogLevel        = "EARLII_LOG_LEVEL"
	keyShutdownTimeout = "EARLII_SHUTDOWN_TIMEOUT"
	keyDatabaseURL     = "EARLII_DATABASE_URL"
	// keyTestDatabaseURL is read by the integration tests only. It is
	// recognised here so that having it exported in a shell doesn't fail a
	// dev boot as an unknown variable.
	keyTestDatabaseURL = "EARLII_TEST_DATABASE_URL"
	// keyPort is set by Render (and other PaaS hosts) to the port to bind.
	keyPort = "PORT"

	prefix = "EARLII_"

	defaultHTTPAddr        = ":8080"
	defaultShutdownTimeout = 8 * time.Second
	// Docker sends SIGKILL 10 s after SIGTERM by default. The drain, the forced
	// close and the exit must all fit inside that.
	maxShutdownTimeout = 9 * time.Second
)

var known = []string{keyEnv, keyHTTPAddr, keyLogLevel, keyShutdownTimeout, keyDatabaseURL, keyTestDatabaseURL}

// databaseURLKeys are the only parameters EARLII_DATABASE_URL may carry.
// Anything else (service, servicefile, passfile, options, target_session_attrs,
// ...) is rejected before pgx reads files or resolves hosts, so a pasted URL
// can't redirect the connection or change session settings behind our back.
var databaseURLKeys = []string{
	"host", "port", "user", "password", "dbname",
	"sslmode", "sslrootcert", "connect_timeout", "application_name",
	"pool_max_conns", "pool_min_conns", "pool_max_conn_lifetime", "pool_max_conn_idle_time",
}

// pgxEnv lists the variables pgx v5.11.0 reads in pgconn.ParseConfig
// (parseEnvSettings). Re-check it when upgrading pgx.
var pgxEnv = []string{
	"PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGPASSFILE", "PGAPPNAME",
	"PGCONNECT_TIMEOUT", "PGSSLMODE", "PGSSLKEY", "PGSSLCERT", "PGSSLSNI", "PGSSLROOTCERT",
	"PGSSLPASSWORD", "PGSSLNEGOTIATION", "PGTARGETSESSIONATTRS", "PGSERVICE", "PGSERVICEFILE",
	"PGTZ", "PGOPTIONS", "PGMINPROTOCOLVERSION", "PGMAXPROTOCOLVERSION", "PGCHANNELBINDING",
	"PGREQUIREAUTH",
}

// Secret is a configuration value that must never be printed. Every fmt verb
// and slog show a placeholder; Reveal returns the value for the one place that
// needs it.
type Secret string

const redacted = "[redacted]"

// Reveal returns the secret value.
func (s Secret) Reveal() string { return string(s) }

// String implements fmt.Stringer, which also covers %v, %+v, %s and %q.
func (Secret) String() string { return redacted }

// GoString implements fmt.GoStringer, which covers %#v.
func (Secret) GoString() string { return redacted }

// LogValue implements slog.LogValuer.
func (Secret) LogValue() slog.Value { return slog.StringValue(redacted) }

// MarshalText implements encoding.TextMarshaler. slog's JSON handler encodes a
// whole Config with encoding/json, which ignores String and LogValue on
// fields but honours this.
func (Secret) MarshalText() ([]byte, error) { return []byte(redacted), nil }

// Config is the validated process configuration.
type Config struct {
	Env Env
	// DatabaseURL is the Postgres connection URL (pgx syntax, URL or
	// keyword/value form). In prod it must verify the server's certificate.
	DatabaseURL Secret
	HTTPAddr    string
	LogLevel    slog.Level
	// ShutdownTimeout bounds the whole graceful drain after SIGINT/SIGTERM.
	ShutdownTimeout time.Duration
	// UnknownKeys are EARLII_* variables this build doesn't recognise. Outside
	// prod they fail the boot (likely typos). In prod they are only warned
	// about, so rolling back to an older image never crash-loops on a variable
	// added for a newer one.
	UnknownKeys []string
}

// Load parses environ (as from os.Environ). Errors name the variable and the
// expected form but never echo its value, which may be a secret.
func Load(environ []string) (Config, error) {
	vars, errs := parse(environ)
	cfg := Config{
		HTTPAddr:        defaultHTTPAddr,
		LogLevel:        slog.LevelInfo,
		ShutdownTimeout: defaultShutdownTimeout,
	}

	switch v := vars[keyEnv]; Env(v) {
	case Dev, Prod:
		cfg.Env = Env(v)
	case "":
		errs = append(errs, fmt.Errorf("%s: required (dev or prod)", keyEnv))
	default:
		errs = append(errs, fmt.Errorf("%s: must be dev or prod", keyEnv))
	}

	if v := vars[keyDatabaseURL]; v != "" {
		if err := validateDatabaseURL(v, cfg.Env == Prod); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", keyDatabaseURL, err))
		}
		cfg.DatabaseURL = Secret(v)
	} else {
		errs = append(errs, fmt.Errorf("%s: required (a postgres:// URL)", keyDatabaseURL))
	}

	if v := vars[keyHTTPAddr]; v != "" {
		if err := validateAddr(v, cfg.Env == Prod); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", keyHTTPAddr, err))
		}
		cfg.HTTPAddr = v
	} else if v := vars[keyPort]; v != "" {
		if p, ok := parsePort(v); !ok || p == 0 {
			errs = append(errs, fmt.Errorf("%s: must be a port number from 1 to 65535", keyPort))
		}
		cfg.HTTPAddr = ":" + v
	}

	if v := vars[keyLogLevel]; v != "" {
		level, ok := map[string]slog.Level{
			"debug": slog.LevelDebug, "info": slog.LevelInfo,
			"warn": slog.LevelWarn, "error": slog.LevelError,
		}[v]
		if !ok {
			errs = append(errs, fmt.Errorf("%s: must be debug, info, warn or error", keyLogLevel))
		}
		cfg.LogLevel = level
	}

	if v := vars[keyShutdownTimeout]; v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 || d > maxShutdownTimeout {
			errs = append(errs, fmt.Errorf("%s: must be a duration such as 8s, above 0 and at most %s",
				keyShutdownTimeout, maxShutdownTimeout))
		}
		cfg.ShutdownTimeout = d
	}

	// pgx reads these from the process environment for anything the URL
	// leaves out, past the key allowlist. Windows treats env names
	// case-insensitively, hence ToUpper.
	for _, kv := range environ {
		if k, _, ok := strings.Cut(kv, "="); ok && slices.Contains(pgxEnv, strings.ToUpper(k)) {
			errs = append(errs, fmt.Errorf("%s: not supported; put every connection setting in %s", k, keyDatabaseURL))
		}
	}

	for k := range vars {
		if strings.HasPrefix(strings.ToUpper(k), prefix) && !slices.Contains(known, k) {
			cfg.UnknownKeys = append(cfg.UnknownKeys, k)
		}
	}
	slices.Sort(cfg.UnknownKeys)
	if cfg.Env != Prod {
		for _, k := range cfg.UnknownKeys {
			errs = append(errs, fmt.Errorf("%s: unknown variable (typo?)", k))
		}
	}

	if len(errs) > 0 {
		return Config{}, fmt.Errorf("invalid config: %w", errors.Join(errs...))
	}
	return cfg, nil
}

// parse keeps only the variables Earlii owns (EARLII_* in any case, and PORT)
// and rejects duplicates, where which value wins would be ambiguous.
func parse(environ []string) (map[string]string, []error) {
	vars := make(map[string]string)
	var errs []error
	for _, kv := range environ {
		k, v, ok := strings.Cut(kv, "=")
		// Skips entries without "=" and Windows' per-drive "=C:=C:\dir" entries.
		if !ok || k == "" {
			continue
		}
		if k != keyPort && !strings.HasPrefix(strings.ToUpper(k), prefix) {
			continue
		}
		if _, dup := vars[k]; dup {
			errs = append(errs, fmt.Errorf("%s: set more than once", k))
			continue
		}
		vars[k] = v
	}
	return vars, errs
}

// validateAddr accepts host:port where host is empty (all interfaces),
// localhost or an IP literal. Hostnames are rejected: binding should not
// depend on DNS.
func validateAddr(addr string, prod bool) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return errors.New("must be host:port, such as :8080 or 127.0.0.1:8080")
	}
	if host != "" && host != "localhost" && net.ParseIP(host) == nil {
		return errors.New("host must be empty, localhost or an IP address")
	}
	p, ok := parsePort(port)
	if !ok {
		return errors.New("port must be a number from 0 to 65535")
	}
	if p == 0 && prod {
		return errors.New("port 0 (a random port) is not allowed in prod")
	}
	return nil
}

// validateDatabaseURL checks the URL the way pgx will read it. The parser's
// own error is dropped, not wrapped: it quotes the input and redacts the
// password only on a best-effort basis.
//
// In prod the parsed result must use TLS that verifies the server on every
// host it may try. Checking the parsed config rather than the string also
// catches the ssl=true alias, a repeated sslmode, a missing sslmode (libpq's
// default, prefer, falls back to plaintext) and PGSSLMODE in the environment.
func validateDatabaseURL(url string, prod bool) error {
	pc, err := pgconn.ParseConfigWithOptions(url, pgconn.ParseConfigOptions{ConnStringAllowedKeys: databaseURLKeys})
	if err != nil {
		return errors.New("must be a valid Postgres URL using only host, port, user, password, dbname, " +
			"sslmode, sslrootcert, connect_timeout, application_name and pool_* parameters")
	}
	if !prod {
		return nil
	}
	if !verifiesServer(pc.TLSConfig) || slices.ContainsFunc(pc.Fallbacks, func(f *pgconn.FallbackConfig) bool {
		return !verifiesServer(f.TLSConfig)
	}) {
		return errors.New("must use sslmode=verify-full (or verify-ca with sslrootcert) in prod")
	}
	return nil
}

// verifiesServer reports whether c is TLS that authenticates the server.
// verify-full checks the chain and the host name (InsecureSkipVerify unset).
// pgx implements verify-ca with InsecureSkipVerify and a custom
// VerifyPeerCertificate that checks the chain only, so it counts only with a
// pinned CA (sslrootcert, which sets RootCAs): against the system roots, any
// public certificate for any host would pass. Plain require checks nothing.
func verifiesServer(c *tls.Config) bool {
	return c != nil && (!c.InsecureSkipVerify || (c.VerifyPeerCertificate != nil && c.RootCAs != nil))
}

// parsePort accepts plain decimal digits only: no sign, no leading zeros and
// no service names such as "http".
func parsePort(s string) (uint64, bool) {
	if s == "" || (len(s) > 1 && s[0] == '0') || strings.TrimLeft(s, "0123456789") != "" {
		return 0, false
	}
	p, err := strconv.ParseUint(s, 10, 16)
	return p, err == nil
}
