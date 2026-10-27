package rpc

import (
	"log/slog"

	"connectrpc.com/connect/v2"

	"github.com/devnadeemashraf/earlii/backend/gen/api/earlii/v1/earliiv1connect"
)

// NewServerWith builds the production interceptor chain around any Health
// implementation, so tests can plant a panicking or failing one.
func NewServerWith(logger *slog.Logger, h earliiv1connect.HealthServiceHandler) *connect.Server {
	return newServer(logger, h)
}

// LoggableProcedure exposes the access log's procedure filter to tests.
var LoggableProcedure = loggableProcedure
