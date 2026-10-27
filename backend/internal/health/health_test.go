package health_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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
			rec, b := get(t, health.Readiness(discard(), time.Second, tt.checks...))
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
	rec, b := get(t, health.Readiness(discard(), 50*time.Millisecond, hung))
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
	rec, b := get(t, health.Readiness(discard(), 50*time.Millisecond, stubborn, health.Check{Name: "queue", Fn: ok}))
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("readiness took %v, want it bounded by the check timeout", elapsed)
	}
	if rec.Code != http.StatusServiceUnavailable || b.Checks["db"] != "fail" || b.Checks["queue"] != "ok" {
		t.Fatalf("got %d %+v, want 503 with db=fail queue=ok", rec.Code, b)
	}
}

func TestReadinessPanickingCheck(t *testing.T) {
	boom := health.Check{Name: "db", Fn: func(context.Context) error { panic("boom") }}
	rec, b := get(t, health.Readiness(discard(), time.Second, boom))
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

	rec, _ := get(t, health.Readiness(logger, time.Second, failing))

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
	health.Readiness(discard(), time.Minute, check).
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
