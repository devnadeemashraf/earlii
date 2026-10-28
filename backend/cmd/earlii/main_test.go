package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"
)

const (
	// sentinel is the password in every test database URL; no output may
	// contain it.
	sentinel = "Zq9SENTINEL"
	// Port 1 on loopback refuses at once: these tests need no database.
	unreachableDB     = "EARLII_DATABASE_URL=postgres://earlii:" + sentinel + "@127.0.0.1:1/earlii?sslmode=disable&connect_timeout=2"
	unreachableProdDB = "EARLII_DATABASE_URL=postgres://earlii:" + sentinel + "@127.0.0.1:1/earlii?sslmode=verify-full&connect_timeout=2"
)

func TestRunRejectsBadArgs(t *testing.T) {
	for _, args := range [][]string{nil, {"ap"}, {"API"}, {"api", "--x"}, {""}, {"migrate", "down"}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := run(t.Context(), args, []string{"EARLII_ENV=dev", unreachableDB}, &stdout, &stderr)
			if code != 2 {
				t.Fatalf("exit code = %d, want 2", code)
			}
			if !strings.Contains(stderr.String(), "usage: earlii api|worker|scheduler|migrate") {
				t.Fatalf("stderr = %q, want the usage line", stderr.String())
			}
		})
	}
}

func TestRunFailsFastOnInvalidConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run(t.Context(), []string{"api"}, []string{"EARLII_LOG_LEVEL=loud"}, &stdout, &stderr)
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	line := firstLine(t, stdout.String())
	msg, _ := line["error"].(string)
	if line["level"] != "ERROR" || !strings.Contains(msg, "EARLII_ENV") || !strings.Contains(msg, "EARLII_LOG_LEVEL") {
		t.Fatalf("log line = %v, want one ERROR naming both bad variables", line)
	}
}

// Log timestamps are UTC whatever the host's zone, so lines from different
// machines sort and compare correctly.
func TestUTCTimestamps(t *testing.T) {
	ist := time.FixedZone("IST", 5*60*60+30*60)
	at := time.Date(2026, 1, 1, 5, 30, 0, 0, ist)

	got := utc(nil, slog.Time(slog.TimeKey, at))
	if got.Value.Time().Location() != time.UTC || !got.Value.Time().Equal(at) {
		t.Fatalf("time = %v, want %v in UTC", got.Value.Time(), at.UTC())
	}
	// Only the record's own timestamp is rewritten, not a user attribute.
	other := utc(nil, slog.Time("posted_at", at))
	if other.Value.Time().Location() != ist {
		t.Fatalf("posted_at was rewritten to %v", other.Value.Time().Location())
	}
}

// Sad path: the port is taken. The process must exit non-zero rather than
// sit there looking healthy to nobody.
func TestRunFailsWhenAddressInUse(t *testing.T) {
	taken := listen(t)

	var stdout, stderr bytes.Buffer
	env := []string{"EARLII_ENV=dev", unreachableDB, "EARLII_HTTP_ADDR=" + taken.Addr().String()}
	if code := run(t.Context(), []string{"api"}, env, &stdout, &stderr); code != 1 {
		t.Fatalf("exit code = %d, want 1; logs: %s", code, stdout.String())
	}
}

func TestRunServesProbesInEveryMode(t *testing.T) {
	for _, mode := range []string{"api", "worker", "scheduler"} {
		t.Run(mode, func(t *testing.T) {
			p := startRun(t, mode, "EARLII_ENV=dev", unreachableDB, "EARLII_HTTP_ADDR=127.0.0.1:0")
			base := "http://" + p.addr

			for _, tc := range []struct {
				method, path string
				want         int
			}{
				// Booting doesn't need the database; liveness never checks it.
				{http.MethodGet, "/healthz", http.StatusOK},
				// The database is down: not ready, but still running. The
				// ready path is in main_integration_test.go.
				{http.MethodGet, "/readyz", http.StatusServiceUnavailable},
				{http.MethodHead, "/healthz", http.StatusOK},
				{http.MethodPost, "/healthz", http.StatusMethodNotAllowed},
				{http.MethodGet, "/HEALTHZ", http.StatusNotFound},
				{http.MethodGet, "/healthz/", http.StatusNotFound},
			} {
				if got := status(t, tc.method, base+tc.path); got != tc.want {
					t.Errorf("%s %s = %d, want %d", tc.method, tc.path, got, tc.want)
				}
			}

			p.cancel() // what SIGINT/SIGTERM does via signal.NotifyContext
			if code := p.wait(t); code != 0 {
				t.Fatalf("exit code = %d, want 0", code)
			}
			p.expectLog(t, "stopped")
			p.expectNoSecret(t)
		})
	}
}

// Only api mode serves the Connect API; the other modes expose probes only.
func TestRunServesHealthRPCInAPIModeOnly(t *testing.T) {
	const check = "/earlii.v1.HealthService/Check?connect=v1&encoding=json&message=%7B%7D"
	for mode, want := range map[string]int{
		"api":       http.StatusOK,
		"worker":    http.StatusNotFound,
		"scheduler": http.StatusNotFound,
	} {
		t.Run(mode, func(t *testing.T) {
			p := startRun(t, mode, "EARLII_ENV=dev", unreachableDB, "EARLII_HTTP_ADDR=127.0.0.1:0")
			code, body := get(t, "http://"+p.addr+check)
			if code != want {
				t.Fatalf("GET Check = %d %s, want %d", code, body, want)
			}
			// The database is down: the API answers, and says it isn't serving.
			if mode == "api" && !strings.Contains(body, `"STATUS_NOT_SERVING"`) {
				t.Fatalf("Check body = %s, want STATUS_NOT_SERVING", body)
			}
			p.cancel()
			if code := p.wait(t); code != 0 {
				t.Fatalf("exit code = %d, want 0", code)
			}
			p.expectNoSecret(t)
		})
	}
}

// The readiness body names the failing check and nothing else: no host, no
// user, no error text. Details go to the logs, which must not hold the
// password either.
func TestRunReadinessHidesDatabaseDetails(t *testing.T) {
	env := []string{"EARLII_ENV=dev", unreachableDB, "EARLII_HTTP_ADDR=127.0.0.1:0"}
	p := startRun(t, "api", env...)
	code, body := get(t, "http://"+p.addr+"/readyz")
	if code != http.StatusServiceUnavailable {
		t.Fatalf("/readyz = %d, want 503", code)
	}
	if want := `{"status":"unavailable","checks":{"postgres":"fail"}}`; strings.TrimSpace(body) != want {
		t.Fatalf("/readyz body = %s, want %s", body, want)
	}
	line := p.expectLog(t, "readiness check failed")
	if line["check"] != "postgres" {
		t.Fatalf("log line = %v, want the postgres check", line)
	}
	p.cancel()
	p.wait(t)
	p.expectNoSecret(t)
}

// migrate is a one-shot: it never serves probes (Compose waits for it to
// exit), and an unreachable database fails it, without leaking the password.
func TestRunMigrateFailsWhenTheDatabaseIsUnreachable(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run(t.Context(), []string{"migrate"}, []string{"EARLII_ENV=dev", unreachableDB}, &stdout, &stderr)
	if code != 1 {
		t.Fatalf("exit code = %d, want 1; logs: %s", code, stdout.String())
	}
	if strings.Contains(stdout.String(), `"listening"`) {
		t.Fatalf("migrate opened a listener: %s", stdout.String())
	}
	if strings.Contains(stdout.String()+stderr.String(), sentinel) {
		t.Fatalf("output leaks the password: %s %s", stdout.String(), stderr.String())
	}
}

// A rollback must not crash-loop on a variable added for a newer release.
func TestRunWarnsOnUnknownKeysInProd(t *testing.T) {
	// Prod rejects port 0, so this test needs a concrete port.
	env := []string{"EARLII_ENV=prod", unreachableProdDB, "EARLII_ADDED_LATER=1", "EARLII_HTTP_ADDR=127.0.0.1:" + freePort(t)}
	p := startRun(t, "api", env...)
	p.cancel()
	if code := p.wait(t); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	// Logged at boot, before "listening", so it was read by startRun.
	i := slices.IndexFunc(p.seen, func(l map[string]any) bool { return l["msg"] == "unknown config variable" })
	if i < 0 {
		t.Fatalf("no unknown-key warning in %v", p.seen)
	}
	line := p.seen[i]
	if line["level"] != "WARN" || line["key"] != "EARLII_ADDED_LATER" {
		t.Fatalf("log line = %v, want a WARN naming the key", line)
	}
}

type process struct {
	cancel context.CancelFunc
	addr   string
	code   chan int
	done   chan struct{} // closed once run and the log reader have both returned
	lines  chan map[string]any
	seen   []map[string]any // every line read so far, in order
}

// startRun starts run in the background and waits until it logs that it is
// listening. env must set EARLII_HTTP_ADDR.
func startRun(t *testing.T, mode string, env ...string) *process {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	pr, pw := io.Pipe()
	p := &process{
		cancel: cancel, code: make(chan int, 1), done: make(chan struct{}),
		lines: make(chan map[string]any, 100),
	}
	readerDone := make(chan struct{})
	go func() {
		defer close(p.done)
		defer func() { <-readerDone }()
		p.code <- run(ctx, []string{mode}, env, pw, io.Discard)
		_ = pw.Close()
	}()
	go func() {
		defer close(readerDone)
		defer close(p.lines)
		sc := bufio.NewScanner(pr)
		for sc.Scan() {
			var line map[string]any
			if err := json.Unmarshal(sc.Bytes(), &line); err != nil {
				t.Errorf("log line is not JSON: %q", sc.Text())
				continue
			}
			select {
			case p.lines <- line:
			default:
				t.Errorf("log buffer full; dropped %v", line)
			}
		}
		if err := sc.Err(); err != nil {
			t.Errorf("reading logs: %v", err)
		}
	}()
	// Wait for run to return, so no goroutine, port or signal registration
	// outlives the test, even when it fails half-way.
	t.Cleanup(func() {
		cancel()
		select {
		case <-p.done:
		case <-time.After(15 * time.Second):
			t.Error("run did not return after the test ended")
		}
	})

	line := p.expectLog(t, "listening")
	if line["mode"] != mode {
		t.Fatalf("listening line = %v, want mode %q", line, mode)
	}
	p.addr, _ = line["addr"].(string)
	return p
}

// expectLog returns the next log line with message msg, skipping others.
func (p *process) expectLog(t *testing.T, msg string) map[string]any {
	t.Helper()
	timeout := time.After(10 * time.Second)
	for {
		select {
		case line, ok := <-p.lines:
			if !ok {
				t.Fatalf("logs ended before %q", msg)
			}
			p.seen = append(p.seen, line)
			if line["msg"] == msg {
				return line
			}
		case <-timeout:
			t.Fatalf("no %q log line within 10s", msg)
		}
	}
}

func (p *process) wait(t *testing.T) int {
	t.Helper()
	select {
	case code := <-p.code:
		return code
	case <-time.After(15 * time.Second):
		t.Fatal("run did not return after cancel")
		return -1
	}
}

// expectNoSecret reads the rest of the logs (run must have returned) and
// fails if any line, read now or earlier, contains the database password.
func (p *process) expectNoSecret(t *testing.T) {
	t.Helper()
	for line := range p.lines {
		p.seen = append(p.seen, line)
	}
	for _, line := range p.seen {
		b, _ := json.Marshal(line)
		if strings.Contains(string(b), sentinel) {
			t.Fatalf("log line leaks the database password: %s", b)
		}
	}
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, url, http.NoBody)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return resp.StatusCode, string(body)
}

func status(t *testing.T, method, url string) int {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, url, http.NoBody)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode
}

// freePort finds a free port up front, because config rejects port 0 in prod.
// The port is released before run binds it, so another process could take it
// in between; dev-mode tests use port 0 instead.
func freePort(t *testing.T) string {
	t.Helper()
	ln := listen(t)
	defer func() { _ = ln.Close() }()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	return port
}

func firstLine(t *testing.T, s string) map[string]any {
	t.Helper()
	var line map[string]any
	first, _, _ := strings.Cut(s, "\n")
	if err := json.Unmarshal([]byte(first), &line); err != nil {
		t.Fatalf("log line is not JSON: %q", first)
	}
	return line
}

// listen opens a loopback listener on a free port.
func listen(t *testing.T) net.Listener {
	t.Helper()
	var lc net.ListenConfig
	ln, err := lc.Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	return ln
}
