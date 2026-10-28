// Package health serves the liveness and readiness probes, and runs the
// readiness checks that both /readyz and the Health RPC report.
package health

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"sync"
	"time"
)

// Check is one named readiness dependency. Fn must respect ctx; one that
// doesn't is reported as failed at the timeout and its goroutine is abandoned.
type Check struct {
	Name string
	Fn   func(context.Context) error
}

// Result is one check's outcome. The error stays in the logs: callers are
// unauthenticated, and error text can carry hostnames or DSNs.
type Result struct {
	Name string
	OK   bool
}

// Report is the outcome of one run of every check, sorted by name.
type Report struct {
	Results []Result
}

// clone copies r, so callers can't share (and race on) one Results slice.
func (r Report) clone() Report {
	return Report{Results: slices.Clone(r.Results)}
}

// OK reports whether every check passed. No checks means ready.
func (r Report) OK() bool {
	for _, res := range r.Results {
		if !res.OK {
			return false
		}
	}
	return true
}

// Config tunes a Checker.
type Config struct {
	// Timeout bounds one run of all the checks together.
	Timeout time.Duration
	// TTL is how long a finished report is reused. Zero runs the checks for
	// every caller that doesn't share an in-flight run.
	TTL time.Duration
	// Now is the clock for the TTL; nil means time.Now.
	Now func() time.Time
}

// Checker runs the checks for any number of callers. Concurrent callers share
// one run, and a finished report is reused for Config.TTL, so a flood of
// probes or Health RPCs costs one round of dependency pings, not one each.
type Checker struct {
	logger *slog.Logger
	cfg    Config
	checks []Check

	mu       sync.Mutex // guards cur, cached and cachedAt
	cur      *flight    // the in-flight run, if any
	cached   *Report    // the last completed, unabandoned report
	cachedAt time.Time
}

// flight is one shared run. Its waiters are counted so the run is canceled
// only when every caller has gone away.
type flight struct {
	done    chan struct{} // closed once report is set
	report  Report
	cancel  context.CancelFunc
	waiters int // guarded by Checker.mu
}

// NewChecker returns a Checker over checks. Failures are logged to logger
// once per run, with their error text.
func NewChecker(logger *slog.Logger, cfg Config, checks ...Check) *Checker {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Checker{logger: logger, cfg: cfg, checks: slices.Clone(checks)}
}

// Check returns a current report: cached, shared with an in-flight run, or
// from a new run. It returns ctx's error if ctx is done first.
func (c *Checker) Check(ctx context.Context) (Report, error) {
	c.mu.Lock()
	if c.cached != nil && c.cfg.Now().Sub(c.cachedAt) < c.cfg.TTL {
		rep := c.cached.clone()
		c.mu.Unlock()
		return rep, nil
	}
	f := c.cur
	if f == nil {
		// The run outlives any one caller (others may join it), so it doesn't
		// inherit ctx's cancellation, and stops when its last waiter leaves. It
		// keeps the first caller's values, so its log lines (and, from P0-07,
		// its trace) belong to that caller's request, not to every joiner.
		runCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
		f = &flight{done: make(chan struct{}), cancel: cancel}
		c.cur = f
		go c.fly(runCtx, f)
	}
	f.waiters++
	c.mu.Unlock()

	select {
	case <-f.done:
		return f.report.clone(), nil
	case <-ctx.Done():
		// Both may be ready at once, and select picks at random: prefer the
		// finished report.
		select {
		case <-f.done:
			return f.report.clone(), nil
		default:
		}
		c.mu.Lock()
		f.waiters--
		if f.waiters == 0 {
			f.cancel()
			// New callers must not join a canceled run.
			if c.cur == f {
				c.cur = nil
			}
		}
		c.mu.Unlock()
		return Report{}, fmt.Errorf("health check: %w", context.Cause(ctx))
	}
}

func (c *Checker) fly(ctx context.Context, f *flight) {
	defer f.cancel()
	rep := c.run(ctx)

	c.mu.Lock()
	if c.cur == f {
		c.cur = nil
	}
	// An abandoned run's failures say nothing about the dependencies.
	if ctx.Err() == nil {
		c.cached = &rep
		c.cachedAt = c.cfg.Now()
	}
	f.report = rep
	c.mu.Unlock()
	close(f.done)
}

// run calls every check concurrently, so one slow dependency doesn't eat the
// others' budget. A check unfinished at the timeout counts as failed.
func (c *Checker) run(ctx context.Context) Report {
	ctx, cancel := context.WithTimeout(ctx, c.cfg.Timeout)
	defer cancel()
	// Logs are written after ctx may be done; context-aware handlers (P0-07)
	// must not drop them.
	logCtx := context.WithoutCancel(ctx)

	type result struct {
		i   int
		err error
	}
	// Buffered so an abandoned check can still send and exit.
	results := make(chan result, len(c.checks))
	for i, ch := range c.checks {
		go func() {
			results <- result{i: i, err: call(ctx, ch.Fn)}
		}()
	}

	rep := Report{Results: make([]Result, len(c.checks))}
	for i, ch := range c.checks {
		rep.Results[i] = Result{Name: ch.Name}
	}
collect:
	for range c.checks {
		select {
		case got := <-results:
			if got.err == nil {
				rep.Results[got.i].OK = true
				continue
			}
			c.logger.WarnContext(logCtx, "readiness check failed",
				slog.String("check", c.checks[got.i].Name), slog.String("error", got.err.Error()))
		case <-ctx.Done():
			c.logger.WarnContext(logCtx, "readiness checks unfinished",
				slog.Duration("timeout", c.cfg.Timeout), slog.String("cause", context.Cause(ctx).Error()))
			break collect
		}
	}
	slices.SortFunc(rep.Results, func(a, b Result) int { return cmp.Compare(a.Name, b.Name) })
	return rep
}

// call calls fn and turns a panic into an error, so a buggy check fails the
// probe instead of crashing the process from a goroutine.
func call(ctx context.Context, fn func(context.Context) error) (err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("check panicked: %v", p)
		}
	}()
	return fn(ctx)
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

// Readiness reports 200 if every check in c passes, else 503 with each
// check's ok/fail. A client that hangs up gets a 503 nobody reads.
func Readiness(c *Checker) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rep, err := c.Check(r.Context())
		res := response{Status: "ok", Checks: make(map[string]string, len(rep.Results))}
		for _, x := range rep.Results {
			res.Checks[x.Name] = "ok"
			if !x.OK {
				res.Checks[x.Name] = "fail"
			}
		}
		code := http.StatusOK
		if err != nil || !rep.OK() {
			res.Status = "unavailable"
			code = http.StatusServiceUnavailable
		}
		write(w, code, res)
	})
}

func write(w http.ResponseWriter, code int, res response) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	// The client may have gone away; there's no one left to tell.
	_ = json.NewEncoder(w).Encode(res)
}
