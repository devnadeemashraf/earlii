// Command earlii is the one Earlii binary. Each mode runs as its own
// container from the same image (ADR-0003):
//
//	earlii api        serves the API
//	earlii worker     runs background jobs (River, P0-07b)
//	earlii scheduler  enqueues periodic jobs (P1-07)
//	earlii migrate    applies the schema, then exits (ADR-0005)
//
// Configuration comes from the environment only (see internal/config).
package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"syscall"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/config"
	"github.com/devnadeemashraf/earlii/backend/internal/health"
	"github.com/devnadeemashraf/earlii/backend/internal/httpserver"
	"github.com/devnadeemashraf/earlii/backend/internal/postgres"
	"github.com/devnadeemashraf/earlii/backend/internal/rpc"
)

const usage = "usage: earlii api|worker|scheduler|migrate\n"

// readyTimeout bounds all readiness checks together, well under a typical
// orchestrator probe timeout.
const readyTimeout = 2 * time.Second

// readyTTL is how long a readiness report is reused. Browsers call the Health
// RPC, so without it every call (or a flood of them) would ping Postgres.
const readyTTL = time.Second

var modes = []string{"api", "worker", "scheduler", "migrate"}

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Environ(), os.Stdout, os.Stderr))
}

// run is main without the process globals, so tests can drive it. Exit codes:
// 0 clean stop, 1 runtime or config failure, 2 bad usage.
func run(ctx context.Context, args, environ []string, stdout, stderr io.Writer) int {
	if len(args) != 1 || !slices.Contains(modes, args[0]) {
		_, _ = io.WriteString(stderr, usage)
		return 2
	}
	mode := args[0]

	// The logger exists before config does, so config errors are JSON too.
	// The level is set once config has loaded.
	level := new(slog.LevelVar)
	logger := slog.New(slog.NewJSONHandler(stdout, &slog.HandlerOptions{Level: level, ReplaceAttr: utc})).
		With(slog.String("mode", mode))

	cfg, err := config.Load(environ)
	if err != nil {
		logger.ErrorContext(ctx, "config invalid", slog.String("error", err.Error()))
		return 1
	}
	level.Set(cfg.LogLevel)
	for _, k := range cfg.UnknownKeys {
		logger.WarnContext(ctx, "unknown config variable", slog.String("key", k))
	}

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		// Restore the default handlers so a second Ctrl-C kills the process
		// instead of waiting out the drain.
		stop()
	}()

	if mode == "migrate" {
		if err := migrate(ctx, cfg, logger); err != nil {
			logger.ErrorContext(ctx, "migrate failed", slog.String("error", err.Error()))
			return 1
		}
		return 0
	}

	if err := serve(ctx, mode, cfg, logger); err != nil {
		logger.ErrorContext(ctx, "stopped with error", slog.String("error", err.Error()))
		return 1
	}
	return 0
}

// utc writes log timestamps in UTC, so lines from hosts in different zones
// sort and compare correctly.
func utc(groups []string, a slog.Attr) slog.Attr {
	if len(groups) == 0 && a.Key == slog.TimeKey && a.Value.Kind() == slog.KindTime {
		a.Value = slog.TimeValue(a.Value.Time().UTC())
	}
	return a
}

// migrate applies River's and our migrations. It is a one-shot: a deploy runs
// it before the long-running modes, which never migrate themselves.
func migrate(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
	res, err := postgres.Migrate(ctx, cfg.DatabaseURL.Reveal(), logger)
	if err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	logger.InfoContext(ctx, "migrated", slog.Any("river_versions", res.River), slog.Any("app_versions", res.App))
	return nil
}

// serve exposes the probes on cfg.HTTPAddr until ctx is done, plus the Connect
// API in api mode. Every long-running mode serves the probes, so Compose and
// Render can health-check any container the same way.
// TODO(P0-07b): start the River client in worker mode and add its check.
func serve(ctx context.Context, mode string, cfg config.Config, logger *slog.Logger) error {
	// The pool connects on first use, so the process boots while Postgres is
	// down and /readyz says so.
	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL.Reveal())
	if err != nil {
		return fmt.Errorf("database: %w", err)
	}
	// Deferred first, so it runs last: after the drain, when no handler can
	// still be using a connection.
	defer pool.Close()

	var lc net.ListenConfig
	ln, err := lc.Listen(ctx, "tcp", cfg.HTTPAddr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	checker := health.NewChecker(logger, health.Config{Timeout: readyTimeout, TTL: readyTTL},
		health.Check{Name: "postgres", Fn: pool.Ping})
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Liveness())
	mux.Handle("GET /readyz", health.Readiness(checker))
	if mode == "api" {
		rpc.Mount(mux, rpc.NewServer(logger, checker))
	}

	logger.InfoContext(ctx, "listening", slog.String("addr", ln.Addr().String()),
		slog.String("env", string(cfg.Env)))
	err = httpserver.Serve(ctx, httpserver.New(mux, logger), ln, cfg.ShutdownTimeout)
	// ctx is done here; log with a fresh context so the line isn't dropped by
	// context-aware handlers (P0-07a).
	logger.InfoContext(context.WithoutCancel(ctx), "stopped", slog.Any("cause", context.Cause(ctx)))
	if err != nil {
		return fmt.Errorf("serve: %w", err)
	}
	return nil
}
