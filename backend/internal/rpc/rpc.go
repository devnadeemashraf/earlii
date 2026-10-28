// Package rpc serves the Connect API (ADR-0002, ADR-0006): the service
// implementations, the interceptor chain every RPC runs through, and the
// transport limits.
package rpc

import (
	"context"
	"log/slog"
	"net/http"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"

	"github.com/devnadeemashraf/earlii/backend/gen/api/earlii/v1/earliiv1connect"
	"github.com/devnadeemashraf/earlii/backend/internal/health"
)

const (
	// readMaxBytes caps one request message, after decompression. Today's
	// requests are empty; an RPC that needs more raises its own limit with
	// connecthttp.WithConditionalOptions rather than lifting this one.
	readMaxBytes = 64 << 10
	// compressMinBytes skips gzip for small responses, where it costs more
	// CPU than it saves bytes.
	compressMinBytes = 1 << 10
)

// NewServer returns the API's Connect server with every service registered.
func NewServer(logger *slog.Logger, checker *health.Checker) *connect.Server {
	return newServer(logger, healthService{checker: checker})
}

func newServer(logger *slog.Logger, h earliiv1connect.HealthServiceHandler) *connect.Server {
	// The first interceptor is the outermost. Recovery is innermost, so the
	// access log sees a panic as the "internal" error the client got.
	server := connect.NewServer(
		requestID,
		accessLog(logger),
		recoverPanics(logger),
	)
	earliiv1connect.RegisterHealthServiceHandler(server, h)
	// An unknown method of a known service goes through the chain like any
	// call, so probing is logged, and the reply doesn't echo the requested
	// path back (connect's default message quotes it).
	server.SetUnknownHandler(func(context.Context, connect.Spec, connect.ServerStream) error {
		return connect.NewError(connect.CodeUnimplemented, "unknown procedure")
	})
	return server
}

// Mount installs one route per procedure on mux, beside the plain HTTP probes.
//
// Requests rejected before the interceptor chain (wrong HTTP method, an
// unsupported content type or compression) get a status code and no access
// log line; HTTP-level telemetry arrives with P0-07a.
func Mount(mux *http.ServeMux, server *connect.Server) {
	connecthttp.Mount(mux, server,
		connecthttp.WithReadMaxBytes(readMaxBytes),
		connecthttp.WithCompressMinBytes(compressMinBytes),
		// A Connect POST must carry Connect-Protocol-Version and a GET must carry
		// connect=v1, so a cross-site form, <img> or text/plain "simple
		// request" can't make a valid call without a CORS preflight.
		connecthttp.WithRequireConnectProtocolHeader(),
	)
}
