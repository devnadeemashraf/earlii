// Command earlii is the one Earlii binary. Each mode runs as its own
// container from the same image (ADR-0003):
//
//	earlii api        serves the API
//	earlii worker     runs background jobs (River, P0-04)
//	earlii scheduler  enqueues periodic jobs (P1-07)
//
// Configuration comes from the environment only (see internal/config).
package main

import (
	"context"
	"errors"
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
)

const usage = "usage: earlii api|worker|scheduler\n"

// readyTimeout bounds all readiness checks together, well under a typical
// orchestrator probe timeout.
const readyTimeout = 2 * time.Second

var modes = []string{"api", "worker", "scheduler"}

var errShuttingDown = errors.New("shutting down")

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

	if err := serve(ctx, cfg, logger); err != nil {
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

// serve exposes the probes on cfg.HTTPAddr until ctx is done. Every mode
// serves them, so Compose and Render can health-check any container the same
// way.
// TODO(P0-04): start the River client in worker mode and add its checks.
func serve(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
	var lc net.ListenConfig
	ln, err := lc.Listen(ctx, "tcp", cfg.HTTPAddr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	// Fails as soon as shutdown begins, so a load balancer stops routing here
	// while in-flight requests drain.
	shutdown := health.Check{Name: "shutdown", Fn: func(context.Context) error {
		if ctx.Err() != nil {
			return errShuttingDown
		}
		return nil
	}}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Liveness())
	mux.Handle("GET /readyz", health.Readiness(logger, readyTimeout, shutdown))

	logger.InfoContext(ctx, "listening", slog.String("addr", ln.Addr().String()),
		slog.String("env", string(cfg.Env)))
	err = httpserver.Serve(ctx, httpserver.New(mux, logger), ln, cfg.ShutdownTimeout)
	// ctx is done here; log with a fresh context so the line isn't dropped by
	// context-aware handlers (P0-07).
	logger.InfoContext(context.WithoutCancel(ctx), "stopped", slog.Any("cause", context.Cause(ctx)))
	if err != nil {
		return fmt.Errorf("serve: %w", err)
	}
	return nil
}
