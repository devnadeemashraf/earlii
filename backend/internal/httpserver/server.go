// Package httpserver builds and runs the HTTP server every mode exposes.
package httpserver

import (
	"log/slog"
	"net/http"
	"time"
)

// Limits for every connection. Without them a slow or hostile client holds a
// connection, and its goroutine, for as long as it likes.
const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	// writeTimeout covers unary handlers. Connect server-streaming RPCs will
	// need per-request deadlines via http.ResponseController (P0-05).
	writeTimeout   = 15 * time.Second
	idleTimeout    = 60 * time.Second
	maxHeaderBytes = 64 << 10
)

// New returns a server for h with every timeout and size limit set. Errors
// that net/http logs itself (TLS handshakes, panics in handlers) go to logger.
func New(h http.Handler, logger *slog.Logger) *http.Server {
	return &http.Server{
		Handler:           h,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}
}
