package httpserver_test

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/devnadeemashraf/earlii/backend/internal/httpserver"
)

func TestNewSetsEveryTimeout(t *testing.T) {
	srv := httpserver.New(http.NotFoundHandler(), slog.New(slog.DiscardHandler))
	// A zero value here means "no limit": one slow client could hold a
	// connection, and a goroutine, forever.
	for name, d := range map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout,
		"ReadTimeout":       srv.ReadTimeout,
		"WriteTimeout":      srv.WriteTimeout,
		"IdleTimeout":       srv.IdleTimeout,
	} {
		if d <= 0 {
			t.Errorf("%s = %v, want a positive limit", name, d)
		}
	}
	if srv.ReadHeaderTimeout > srv.ReadTimeout {
		t.Errorf("ReadHeaderTimeout %v exceeds ReadTimeout %v", srv.ReadHeaderTimeout, srv.ReadTimeout)
	}
	if srv.ErrorLog == nil {
		t.Error("ErrorLog is nil: net/http's own errors would bypass the JSON logger")
	}
}

// Abuser: a client sending megabytes of headers is refused before the handler
// runs.
func TestNewRejectsOversizedHeaders(t *testing.T) {
	var reached atomic.Bool
	srv := httpserver.New(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached.Store(true) }),
		slog.New(slog.DiscardHandler))
	ln := listen(t)
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })

	req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+ln.Addr().String(), http.NoBody)
	req.Header.Set("X-Junk", strings.Repeat("a", 2<<20))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusRequestHeaderFieldsTooLarge {
		t.Fatalf("status = %d, want 431", resp.StatusCode)
	}
	if reached.Load() {
		t.Fatal("the handler ran for an oversized request")
	}
}
