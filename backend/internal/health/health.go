// Package health serves the liveness and readiness probes.
package health

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// Check is one named readiness dependency. Fn must respect ctx; one that
// doesn't is reported as failed at the timeout and its goroutine is abandoned.
type Check struct {
	Name string
	Fn   func(context.Context) error
}

type response struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks,omitempty"`
}

// Liveness reports that the process is up. It never checks dependencies: a
// database outage must not make the orchestrator restart healthy processes.
func Liveness() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		write(w, http.StatusOK, response{Status: "ok"})
	})
}

// Readiness reports whether every check passes within timeout. The checks run
// concurrently, so one slow dependency doesn't eat the others' budget. Failure
// details go to logger only: the response must not leak hostnames or DSNs.
func Readiness(logger *slog.Logger, timeout time.Duration, checks ...Check) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()

		type result struct {
			name string
			err  error
		}
		// Buffered so an abandoned check can still send and exit.
		results := make(chan result, len(checks))
		for _, c := range checks {
			go func() {
				results <- result{name: c.Name, err: run(ctx, c.Fn)}
			}()
		}

		res := response{Status: "ok", Checks: make(map[string]string, len(checks))}
		for _, c := range checks {
			res.Checks[c.Name] = "fail"
		}
		for range checks {
			select {
			case got := <-results:
				if got.err == nil {
					res.Checks[got.name] = "ok"
					continue
				}
				logger.WarnContext(ctx, "readiness check failed",
					slog.String("check", got.name), slog.String("error", got.err.Error()))
			case <-ctx.Done():
				logger.WarnContext(ctx, "readiness checks timed out", slog.Duration("timeout", timeout))
				res.Status = "unavailable"
				write(w, http.StatusServiceUnavailable, res)
				return
			}
		}

		code := http.StatusOK
		for _, v := range res.Checks {
			if v != "ok" {
				res.Status = "unavailable"
				code = http.StatusServiceUnavailable
			}
		}
		write(w, code, res)
	})
}

// run calls fn and turns a panic into an error, so a buggy check fails the
// probe instead of crashing the process from a goroutine.
func run(ctx context.Context, fn func(context.Context) error) (err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("check panicked: %v", p)
		}
	}()
	return fn(ctx)
}

func write(w http.ResponseWriter, code int, res response) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	// The client may have gone away; there's no one left to tell.
	_ = json.NewEncoder(w).Encode(res)
}
