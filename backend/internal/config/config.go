// Package config loads and validates the process configuration from the
// environment, once, at boot. Anything invalid fails the boot with every
// problem listed.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"slices"
	"strconv"
	"strings"
	"time"
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
	// keyPort is set by Render (and other PaaS hosts) to the port to bind.
	keyPort = "PORT"

	prefix = "EARLII_"

	defaultHTTPAddr        = ":8080"
	defaultShutdownTimeout = 8 * time.Second
	// Docker sends SIGKILL 10 s after SIGTERM by default. The drain, the forced
	// close and the exit must all fit inside that.
	maxShutdownTimeout = 9 * time.Second
)

var known = []string{keyEnv, keyHTTPAddr, keyLogLevel, keyShutdownTimeout}

// Config is the validated process configuration.
type Config struct {
	Env      Env
	HTTPAddr string
	LogLevel slog.Level
	// ShutdownTimeout bounds the whole graceful drain after SIGINT/SIGTERM.
	ShutdownTimeout time.Duration
	// UnknownKeys are EARLII_* variables this build doesn't recognise. They fail
	// the boot unless EARLII_ENV is prod (typos), and are only reported in prod, so rolling back to
	// an older image never crash-loops on a variable added for a newer one.
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

// parsePort accepts plain decimal digits only: no sign, no leading zeros and
// no service names such as "http".
func parsePort(s string) (uint64, bool) {
	if s == "" || (len(s) > 1 && s[0] == '0') || strings.TrimLeft(s, "0123456789") != "" {
		return 0, false
	}
	p, err := strconv.ParseUint(s, 10, 16)
	return p, err == nil
}
