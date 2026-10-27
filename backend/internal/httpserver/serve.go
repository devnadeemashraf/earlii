package httpserver

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"
)

// Serve serves srv on ln until ctx is done, then shuts down gracefully:
//
//   - it stops accepting connections and closes idle ones at once;
//   - it waits up to drain for in-flight requests to finish;
//   - if drain runs out, it force-closes the remaining connections.
//
// It returns nil after a clean drain, an error wrapping
// context.DeadlineExceeded after a forced close, and any serving error
// (other than http.ErrServerClosed) as soon as it happens, without waiting
// for ctx.
func Serve(ctx context.Context, srv *http.Server, ln net.Listener, drain time.Duration) error {
	// EXERCISE P0-02-1: replace this hard stop with a graceful drain (errgroup + srv.Shutdown).
	// Today every in-flight request is cut off the moment ctx is done.
	_ = drain
	go func() {
		<-ctx.Done()
		_ = srv.Close()
	}()
	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		return err //nolint:wrapcheck // EXERCISE P0-02-1 stub; the owner's version wraps it.
	}
	return nil
}
