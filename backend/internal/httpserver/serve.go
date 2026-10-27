package httpserver

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	"golang.org/x/sync/errgroup"
)

// Serve serves srv on ln until ctx is done, then shuts down gracefully:
//
//   - it stops accepting connections and closes idle ones at once;
//   - it waits up to drain for in-flight requests to finish;
//   - if drain runs out, it force-closes the remaining connections.
//
// It returns nil after a clean drain (or if ctx is already done when it
// starts), an error wrapping context.DeadlineExceeded after a forced close, and
// any serving error (other than http.ErrServerClosed) as soon as it happens,
// without waiting for ctx.
//
// Serve owns ln and closes it before returning. srv can't be reused afterwards.
func Serve(ctx context.Context, srv *http.Server, ln net.Listener, drain time.Duration) error {
	// gctx is done when ctx is (the signal) or when serving fails, so the
	// shutdown goroutine below wakes up in both cases.
	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		// srv.Serve closes ln on return, including when Shutdown ran first.
		if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve: %w", err)
		}
		return nil
	})

	g.Go(func() error {
		<-gctx.Done()
		// ctx is already done, so the drain needs a clock of its own:
		// WithoutCancel keeps ctx's values but not its cancellation.
		sctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), drain)
		defer cancel()
		if err := srv.Shutdown(sctx); err != nil {
			// The drain ran out. Cut off what is left so the process exits
			// before the platform's SIGKILL; Close's own error adds nothing.
			_ = srv.Close()
			return fmt.Errorf("drain: %w", err)
		}
		return nil
	})

	return g.Wait() //nolint:wrapcheck // Both goroutines already wrap their errors.
}
