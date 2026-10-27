package httpserver_test

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/httpserver"
)

// EXERCISE P0-02-1: set this to true when you start, so these tests run.
// It must be true before the exercise is graded.
const exerciseStarted = false

func requireExercise(t *testing.T) {
	t.Helper()
	if !exerciseStarted {
		t.Skip("EXERCISE P0-02-1 not started: set exerciseStarted = true in serve_test.go")
	}
}

// slack is how long past its deadline Serve may take to return. It is generous
// because CI machines are slow; the tests fail on hangs, not on milliseconds.
const slack = 2 * time.Second

type running struct {
	cancel context.CancelFunc
	addr   string
	done   chan error
}

// start runs Serve on a free loopback port in the background.
func start(t *testing.T, h http.Handler, drain time.Duration) *running {
	t.Helper()
	ln := listen(t)
	ctx, cancel := context.WithCancel(t.Context())
	r := &running{cancel: cancel, addr: ln.Addr().String(), done: make(chan error, 1)}
	srv := &http.Server{Handler: h, ReadHeaderTimeout: time.Minute}
	go func() { r.done <- httpserver.Serve(ctx, srv, ln, drain) }()
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-r.done:
			_ = err // the test body checked it, or the test already failed
		case <-time.After(drain + slack):
			t.Error("Serve did not return after the test ended")
		}
	})
	return r
}

// wait returns Serve's result, failing the test if it takes longer than within.
func (r *running) wait(t *testing.T, within time.Duration) error {
	t.Helper()
	select {
	case err := <-r.done:
		r.done <- err // let Cleanup see it too
		return err
	case <-time.After(within):
		t.Fatalf("Serve did not return within %v", within)
		return nil
	}
}

// Happy path: a request that is running when the signal arrives finishes
// normally, and Serve then returns nil.
func TestServeDrainsInFlightRequest(t *testing.T) {
	requireExercise(t)
	started, release := make(chan struct{}), make(chan struct{})
	r := start(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		_, _ = io.WriteString(w, "finished")
	}), 5*time.Second)

	type result struct {
		body string
		err  error
	}
	got := make(chan result, 1)
	go func() {
		req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+r.addr, http.NoBody)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			got <- result{err: err}
			return
		}
		defer func() { _ = resp.Body.Close() }()
		b, err := io.ReadAll(resp.Body)
		got <- result{body: string(b), err: err}
	}()

	<-started
	r.cancel() // the signal arrives mid-request
	select {
	case err := <-r.done:
		r.done <- err // let Cleanup see it
		close(release)
		t.Fatalf("Serve returned (%v) while a request was still in flight", err)
	case <-time.After(100 * time.Millisecond):
		// Not synchronisation: a window in which an early return would show up.
	}
	close(release)

	res := <-got
	if res.err != nil || res.body != "finished" {
		t.Fatalf("in-flight request got %q, %v; want it to finish normally", res.body, res.err)
	}
	if err := r.wait(t, slack); err != nil {
		t.Fatalf("Serve = %v, want nil after a clean drain", err)
	}
}

// Edge: a handler that never finishes is cut off at the drain deadline, so a
// stuck request can't stop the process from exiting before SIGKILL.
func TestServeForcesCloseAfterDrainTimeout(t *testing.T) {
	requireExercise(t)
	started, exited := make(chan struct{}), make(chan struct{})
	const drain = 200 * time.Millisecond
	r := start(t, http.HandlerFunc(func(_ http.ResponseWriter, req *http.Request) {
		defer close(exited)
		close(started)
		<-req.Context().Done() // hangs until its connection is closed
	}), drain)

	go func() {
		req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+r.addr, http.NoBody)
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			_ = resp.Body.Close()
		}
	}()

	<-started
	begin := time.Now()
	r.cancel()
	err := r.wait(t, drain+slack)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Serve = %v, want an error wrapping context.DeadlineExceeded", err)
	}
	if elapsed := time.Since(begin); elapsed < drain {
		t.Fatalf("Serve returned after %v, before the %v drain window ended", elapsed, drain)
	}
	select {
	case <-exited:
	case <-time.After(slack):
		t.Fatal("the hung handler was never released: its connection is still open")
	}
}

// Sad path: if serving fails (here, a closed listener), Serve reports it at
// once instead of waiting for a signal that may never come.
func TestServeReturnsListenerError(t *testing.T) {
	requireExercise(t)
	ln := listen(t)
	_ = ln.Close()

	done := make(chan error, 1)
	go func() {
		done <- httpserver.Serve(t.Context(), &http.Server{ReadHeaderTimeout: time.Second}, ln, time.Second)
	}()
	select {
	case err := <-done:
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("Serve = %v, want the listener's error", err)
		}
	case <-time.After(slack):
		t.Fatal("Serve hung on a broken listener")
	}
}

// Edge: the signal arrives before Serve even starts.
func TestServeAlreadyCanceled(t *testing.T) {
	requireExercise(t)
	ln := listen(t)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	done := make(chan error, 1)
	go func() { done <- httpserver.Serve(ctx, &http.Server{ReadHeaderTimeout: time.Second}, ln, time.Second) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Serve = %v, want nil", err)
		}
	case <-time.After(slack):
		t.Fatal("Serve hung with an already-canceled context")
	}
	d := net.Dialer{Timeout: time.Second}
	if c, err := d.DialContext(t.Context(), "tcp", ln.Addr().String()); err == nil {
		_ = c.Close()
		t.Fatal("the listener still accepts connections after Serve returned")
	}
}

// Edge: idle keep-alive connections don't count as in flight. Shutdown closes
// them straight away instead of waiting out the drain window.
func TestServeIdleKeepAliveDoesNotDelayShutdown(t *testing.T) {
	requireExercise(t)
	const drain = 5 * time.Second
	r := start(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}), drain)

	conn := dial(t, r.addr)
	if _, err := io.WriteString(conn, "GET / HTTP/1.1\r\nHost: x\r\n\r\n"); err != nil {
		t.Fatalf("write: %v", err)
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	_ = resp.Body.Close()
	// The connection is now idle and kept alive.

	r.cancel()
	if err := r.wait(t, slack); err != nil {
		t.Fatalf("Serve = %v, want nil", err)
	}
}

// Abuser: a slowloris client sends half a request and stalls. It must not hold
// the process past the drain deadline.
func TestServeSlowlorisCannotBlockShutdown(t *testing.T) {
	requireExercise(t)
	const drain = 200 * time.Millisecond
	r := start(t, http.NotFoundHandler(), drain)

	conn := dial(t, r.addr)
	if _, err := io.WriteString(conn, "GET / HTTP/1.1\r\nHost: x\r\n"); err != nil {
		t.Fatalf("write: %v", err)
	}

	r.cancel()
	_ = r.wait(t, drain+slack) // nil or DeadlineExceeded are both fine; hanging is not
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

// dial opens a raw TCP connection, for clients net/http won't simulate.
func dial(t *testing.T, addr string) net.Conn {
	t.Helper()
	var d net.Dialer
	conn, err := d.DialContext(t.Context(), "tcp", addr)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}
