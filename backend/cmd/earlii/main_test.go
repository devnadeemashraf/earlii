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

func TestRunRejectsBadArgs(t *testing.T) {
	for _, args := range [][]string{nil, {"ap"}, {"API"}, {"api", "--x"}, {""}} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := run(t.Context(), args, []string{"EARLII_ENV=dev"}, &stdout, &stderr)
			if code != 2 {
				t.Fatalf("exit code = %d, want 2", code)
			}
			if !strings.Contains(stderr.String(), "usage: earlii api|worker|scheduler") {
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
	env := []string{"EARLII_ENV=dev", "EARLII_HTTP_ADDR=" + taken.Addr().String()}
	if code := run(t.Context(), []string{"api"}, env, &stdout, &stderr); code != 1 {
		t.Fatalf("exit code = %d, want 1; logs: %s", code, stdout.String())
	}
}

func TestRunServesProbesInEveryMode(t *testing.T) {
	for _, mode := range []string{"api", "worker", "scheduler"} {
		t.Run(mode, func(t *testing.T) {
			p := startRun(t, mode, "EARLII_ENV=dev", "EARLII_HTTP_ADDR=127.0.0.1:0")
			base := "http://" + p.addr

			for _, tc := range []struct {
				method, path string
				want         int
			}{
				{http.MethodGet, "/healthz", http.StatusOK},
				{http.MethodGet, "/readyz", http.StatusOK},
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
		})
	}
}

// A rollback must not crash-loop on a variable added for a newer release.
func TestRunWarnsOnUnknownKeysInProd(t *testing.T) {
	// Prod rejects port 0, so this test needs a concrete port.
	env := []string{"EARLII_ENV=prod", "EARLII_ADDED_LATER=1", "EARLII_HTTP_ADDR=127.0.0.1:" + freePort(t)}
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
