package health_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/health"
)

type body struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

func get(t *testing.T, h http.Handler) (*httptest.ResponseRecorder, body) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", http.NoBody))
	var b body
	if err := json.Unmarshal(rec.Body.Bytes(), &b); err != nil {
		t.Fatalf("response is not JSON: %v: %q", err, rec.Body.String())
	}
	return rec, b
}

func assertHeaders(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

func discard() *slog.Logger { return slog.New(slog.DiscardHandler) }

func ok(context.Context) error { return nil }

// readiness builds the /readyz handler over a checker with no cache, so every
// request runs the checks.
func readiness(logger *slog.Logger, timeout time.Duration, checks ...health.Check) http.Handler {
	return health.Readiness(health.NewChecker(logger, health.Config{Timeout: timeout}, checks...))
}

// fakeClock is a manually advanced clock for the report cache.
type fakeClock struct {
	mu  sync.Mutex // guards now
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

// waitFor polls cond until it holds. It waits for a state, never for a fixed
// time, so a slow machine only makes the test slower, not flaky.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Error("condition not reached within 5s")
			return
		}
		runtime.Gosched()
	}
}

func TestLiveness(t *testing.T) {
	rec, b := get(t, health.Liveness())
	if rec.Code != http.StatusOK || b.Status != "ok" {
		t.Fatalf("got %d %+v, want 200 ok", rec.Code, b)
	}
	assertHeaders(t, rec)
}

func TestReadiness(t *testing.T) {
	tests := []struct {
		name       string
		checks     []health.Check
		wantCode   int
		wantStatus string
		wantChecks map[string]string
	}{
		{
			name:       "no checks is ready",
			wantCode:   http.StatusOK,
			wantStatus: "ok",
			wantChecks: map[string]string{},
		},
		{
			name:       "all checks pass",
			checks:     []health.Check{{Name: "db", Fn: ok}, {Name: "queue", Fn: ok}},
			wantCode:   http.StatusOK,
			wantStatus: "ok",
			wantChecks: map[string]string{"db": "ok", "queue": "ok"},
		},
		{
			name: "one failing check makes the whole service unavailable",
			checks: []health.Check{
				{Name: "db", Fn: func(context.Context) error { return errors.New("down") }},
				{Name: "queue", Fn: ok},
			},
			wantCode:   http.StatusServiceUnavailable,
			wantStatus: "unavailable",
			wantChecks: map[string]string{"db": "fail", "queue": "ok"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec, b := get(t, readiness(discard(), time.Second, tt.checks...))
			if rec.Code != tt.wantCode || b.Status != tt.wantStatus {
				t.Fatalf("got %d %q, want %d %q", rec.Code, b.Status, tt.wantCode, tt.wantStatus)
			}
			if len(b.Checks) != len(tt.wantChecks) {
				t.Fatalf("checks = %v, want %v", b.Checks, tt.wantChecks)
			}
			for k, v := range tt.wantChecks {
				if b.Checks[k] != v {
					t.Errorf("checks[%q] = %q, want %q", k, b.Checks[k], v)
				}
			}
			assertHeaders(t, rec)
		})
	}
}

// A hung dependency must not hang the probe: the orchestrator would see a
// timeout instead of a clear 503.
func TestReadinessTimesOutHungCheck(t *testing.T) {
	hung := health.Check{Name: "db", Fn: func(ctx context.Context) error {
		<-ctx.Done()
		return ctx.Err()
	}}
	start := time.Now()
	rec, b := get(t, readiness(discard(), 50*time.Millisecond, hung))
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("readiness took %v, want it bounded by the check timeout", elapsed)
	}
	if rec.Code != http.StatusServiceUnavailable || b.Checks["db"] != "fail" {
		t.Fatalf("got %d %+v, want 503 with db=fail", rec.Code, b)
	}
}

// A buggy check that ignores its context must not hold the probe past the
// timeout.
func TestReadinessCheckIgnoringContext(t *testing.T) {
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	stubborn := health.Check{Name: "db", Fn: func(context.Context) error {
		<-release
		return nil
	}}
	start := time.Now()
	rec, b := get(t, readiness(discard(), 50*time.Millisecond, stubborn, health.Check{Name: "queue", Fn: ok}))
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("readiness took %v, want it bounded by the check timeout", elapsed)
	}
	if rec.Code != http.StatusServiceUnavailable || b.Checks["db"] != "fail" || b.Checks["queue"] != "ok" {
		t.Fatalf("got %d %+v, want 503 with db=fail queue=ok", rec.Code, b)
	}
}

func TestReadinessPanickingCheck(t *testing.T) {
	boom := health.Check{Name: "db", Fn: func(context.Context) error { panic("boom") }}
	rec, b := get(t, readiness(discard(), time.Second, boom))
	if rec.Code != http.StatusServiceUnavailable || b.Checks["db"] != "fail" {
		t.Fatalf("got %d %+v, want 503 with db=fail", rec.Code, b)
	}
}

// Error text can carry hostnames, DSNs or credentials. It goes to the logs,
// never to an unauthenticated client.
func TestReadinessDoesNotLeakErrorText(t *testing.T) {
	const secret = "postgres://admin:hunter2@10.0.0.5/earlii"
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	failing := health.Check{Name: "db", Fn: func(context.Context) error {
		return errors.New("dial " + secret + ": refused")
	}}

	rec, _ := get(t, readiness(logger, time.Second, failing))

	if strings.Contains(rec.Body.String(), "hunter2") || strings.Contains(rec.Body.String(), "refused") {
		t.Fatalf("response leaks the error: %s", rec.Body.String())
	}
	if !strings.Contains(logs.String(), `"check":"db"`) {
		t.Fatalf("the failure was not logged with the check name: %s", logs.String())
	}
}

// A client that hangs up mid-probe cancels the checks too, so a slow dependency
// isn't kept busy answering nobody.
func TestReadinessCanceledRequest(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	started, canceled := make(chan struct{}), make(chan struct{})
	check := health.Check{Name: "db", Fn: func(ctx context.Context) error {
		close(started)
		<-ctx.Done()
		close(canceled)
		return ctx.Err()
	}}
	go func() {
		<-started
		cancel() // the client hangs up
	}()
	rec := httptest.NewRecorder()
	readiness(discard(), time.Minute, check).
		ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/", http.NoBody))
	select {
	case <-canceled:
	case <-time.After(2 * time.Second):
		t.Fatal("the check did not inherit the request's cancellation")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, want 503", rec.Code)
	}
}

func TestCheckerReportIsSortedAndHidesErrors(t *testing.T) {
	c := health.NewChecker(discard(), health.Config{Timeout: time.Second},
		health.Check{Name: "queue", Fn: ok},
		health.Check{Name: "db", Fn: func(context.Context) error { return errors.New("down") }},
	)
	rep, err := c.Check(t.Context())
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	want := []health.Result{{Name: "db", OK: false}, {Name: "queue", OK: true}}
	if len(rep.Results) != len(want) {
		t.Fatalf("results = %+v, want %+v", rep.Results, want)
	}
	for i := range want {
		if rep.Results[i] != want[i] {
			t.Errorf("results[%d] = %+v, want %+v", i, rep.Results[i], want[i])
		}
	}
	if rep.OK() {
		t.Error("OK() = true with a failing check")
	}
}

func TestCheckerNoChecksIsOK(t *testing.T) {
	rep, err := health.NewChecker(discard(), health.Config{Timeout: time.Second}).Check(t.Context())
	if err != nil || !rep.OK() || len(rep.Results) != 0 {
		t.Fatalf("got %+v, %v; want an empty OK report", rep, err)
	}
}

// Browsers call the Health RPC, so a flood of callers must not become a flood
// of database pings: concurrent callers share one run.
func TestCheckerCoalescesConcurrentCallers(t *testing.T) {
	var runs atomic.Int32
	release := make(chan struct{})
	slow := health.Check{Name: "db", Fn: func(context.Context) error {
		runs.Add(1)
		<-release
		return nil
	}}
	c := health.NewChecker(discard(), health.Config{Timeout: time.Minute}, slow)

	const callers = 200
	var wg sync.WaitGroup
	errs := make(chan error, callers)
	for range callers {
		wg.Go(func() {
			rep, err := c.Check(t.Context())
			if err == nil && !rep.OK() {
				err = errors.New("report not OK")
			}
			errs <- err
		})
	}
	// Hold the run until every caller has joined it.
	waitFor(t, func() bool { return health.Waiters(c) == callers })
	close(release)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("a caller failed: %v", err)
		}
	}
	if got := runs.Load(); got != 1 {
		t.Fatalf("checks ran %d times for %d concurrent callers, want 1", got, callers)
	}
}

func TestCheckerCachesForTTL(t *testing.T) {
	var runs atomic.Int32
	counting := health.Check{Name: "db", Fn: func(context.Context) error {
		runs.Add(1)
		return nil
	}}
	clock := &fakeClock{now: time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)}
	c := health.NewChecker(discard(), health.Config{Timeout: time.Second, TTL: time.Second, Now: clock.Now}, counting)

	for range 3 {
		if _, err := c.Check(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	if got := runs.Load(); got != 1 {
		t.Fatalf("runs within the TTL = %d, want 1", got)
	}
	clock.Advance(999 * time.Millisecond)
	if _, err := c.Check(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := runs.Load(); got != 1 {
		t.Fatalf("runs just inside the TTL = %d, want 1", got)
	}
	clock.Advance(time.Millisecond)
	if _, err := c.Check(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := runs.Load(); got != 2 {
		t.Fatalf("runs after the TTL = %d, want 2", got)
	}
}

// One caller hanging up must not fail the others sharing its run.
func TestCheckerOneCallerLeavingDoesNotCancelOthers(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	check := health.Check{Name: "db", Fn: func(ctx context.Context) error {
		once.Do(func() { close(started) })
		select {
		case <-release:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}}
	c := health.NewChecker(discard(), health.Config{Timeout: time.Minute}, check)

	leaving, leave := context.WithCancel(t.Context())
	leftErr := make(chan error, 1)
	go func() {
		_, err := c.Check(leaving)
		leftErr <- err
	}()
	<-started
	stayed := make(chan health.Report, 1)
	go func() {
		rep, err := c.Check(t.Context())
		if err != nil {
			t.Errorf("staying caller: %v", err)
		}
		stayed <- rep
	}()
	waitFor(t, func() bool { return health.Waiters(c) == 2 })
	leave()
	if err := <-leftErr; !errors.Is(err, context.Canceled) {
		t.Fatalf("leaving caller err = %v, want context.Canceled", err)
	}
	close(release)
	if rep := <-stayed; !rep.OK() {
		t.Fatalf("staying caller got %+v, want OK: the run was canceled under it", rep)
	}
}

// An abandoned run's failures are not cached: the next caller runs the
// checks again rather than inheriting "fail" from a canceled run.
func TestCheckerDoesNotCacheAbandonedRun(t *testing.T) {
	var runs atomic.Int32
	check := health.Check{Name: "db", Fn: func(ctx context.Context) error {
		if runs.Add(1) == 1 {
			<-ctx.Done()
			return ctx.Err()
		}
		return nil
	}}
	clock := &fakeClock{now: time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)}
	c := health.NewChecker(discard(), health.Config{Timeout: time.Minute, TTL: time.Hour, Now: clock.Now}, check)

	ctx, cancel := context.WithCancel(t.Context())
	go func() {
		waitFor(t, func() bool { return runs.Load() == 1 })
		cancel()
	}()
	if _, err := c.Check(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	rep, err := c.Check(t.Context())
	if err != nil || !rep.OK() {
		t.Fatalf("after an abandoned run got %+v, %v; want a fresh OK run", rep, err)
	}
}

// Callers get their own copy: one sorting or editing its report must not
// change what the next caller (or the cache) sees.
func TestCheckerReportsAreIndependentCopies(t *testing.T) {
	clock := &fakeClock{now: time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC)}
	c := health.NewChecker(discard(), health.Config{Timeout: time.Second, TTL: time.Hour, Now: clock.Now},
		health.Check{Name: "db", Fn: ok})

	first, err := c.Check(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	first.Results[0] = health.Result{Name: "tampered", OK: false}

	second, err := c.Check(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if second.Results[0] != (health.Result{Name: "db", OK: true}) {
		t.Fatalf("cached report = %+v, want it untouched by another caller", second.Results)
	}
}
