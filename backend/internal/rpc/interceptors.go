package rpc

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"runtime/debug"
	"time"

	"connectrpc.com/connect/v2"
)

// RequestIDHeader carries the server's request ID back to the client, which
// can quote it in a bug report.
const RequestIDHeader = "X-Request-Id"

// maxProcedureLog caps the procedure in logs: for an unknown method it is the
// request path, which the client chooses.
const maxProcedureLog = 128

// unknownProcedure is logged in place of a procedure that isn't a plain
// /package.Service/Method name.
const unknownProcedure = "unknown"

type requestIDKey struct{}

// RequestID returns the request ID requestID stored in ctx, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// requestID gives every RPC a fresh random ID, puts it in ctx and the response
// header. An inbound X-Request-Id is never adopted: a client could otherwise
// reuse someone else's ID and plant misleading lines in their trail. The
// access log records a well-formed inbound ID separately, for correlation.
func requestID(next connect.ServerFunc) connect.ServerFunc {
	return func(ctx context.Context, spec connect.Spec, stream connect.ServerStream) error {
		id := newRequestID()
		ctx = context.WithValue(ctx, requestIDKey{}, id)
		if info, ok := connect.CallInfoForServerContext(ctx); ok {
			info.ResponseHeader().Set(RequestIDHeader, id)
		}
		return next(ctx, spec, stream)
	}
}

// newRequestID returns 128 random bits as 32 hex characters.
func newRequestID() string {
	var b [16]byte
	// crypto/rand.Read never returns an error (it crashes the program
	// instead, Go 1.24+).
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// accessLog writes one line per RPC: what was called, how it ended and how
// long it took. Lines carry no request or response content (no PII).
func accessLog(logger *slog.Logger) connect.ServerInterceptor {
	return func(next connect.ServerFunc) connect.ServerFunc {
		return func(ctx context.Context, spec connect.Spec, stream connect.ServerStream) error {
			start := time.Now()
			err := next(ctx, spec, stream)

			code := "ok"
			level := slog.LevelInfo
			if err != nil {
				c := connect.CodeOf(err)
				code = c.String()
				if serverFault(c) {
					level = slog.LevelError
				}
			}
			attrs := []slog.Attr{
				slog.String("procedure", loggableProcedure(spec.Procedure)),
				slog.String("code", code),
				slog.Duration("duration", time.Since(start)),
				slog.String("request_id", RequestID(ctx)),
			}
			if info, ok := connect.CallInfoForServerContext(ctx); ok {
				attrs = append(attrs,
					slog.String("protocol", info.Protocol),
					slog.String("codec", info.Codec),
					slog.Int("bytes_in", info.ReceiveStats.Size),
					slog.Int("bytes_out", info.SendStats.Size),
				)
				if v := info.RequestHeader().Get(RequestIDHeader); validClientRequestID(v) {
					attrs = append(attrs, slog.String("client_request_id", v))
				}
			}
			// Logged after ctx may be done; context-aware handlers (P0-07) must
			// not drop the line.
			logger.LogAttrs(context.WithoutCancel(ctx), level, "rpc", attrs...)
			return err
		}
	}
}

// serverFault reports codes that mean the server, not the caller, went wrong.
func serverFault(c connect.Code) bool {
	return c == connect.CodeUnknown || c == connect.CodeInternal || c == connect.CodeDataLoss
}

// validClientRequestID accepts 1 to 64 characters of [A-Za-z0-9._-]: enough
// for UUIDs and trace IDs, nothing that could mislead a reader of the logs.
func validClientRequestID(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	for i := range len(s) {
		c := s[i]
		if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') && c != '.' && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

// loggableProcedure returns p if it is a plain procedure name: at most
// maxProcedureLog bytes of the form /package.Service/Method in
// [A-Za-z0-9_.]. Anything else (an unknown method's path, with bidi controls,
// zero-width characters or sheer length) is logged as "unknown".
func loggableProcedure(p string) string {
	if len(p) > maxProcedureLog || len(p) < 4 || p[0] != '/' {
		return unknownProcedure
	}
	slashes := 0
	for i := 1; i < len(p); i++ {
		c := p[i]
		switch {
		case c == '/':
			slashes++
			if slashes > 1 || i == 1 || i == len(p)-1 {
				return unknownProcedure
			}
		case c == '.' || c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'):
		default:
			return unknownProcedure
		}
	}
	if slashes != 1 {
		return unknownProcedure
	}
	return p
}

// recoverPanics turns a handler panic into an "internal" error with fixed
// text. The panic value and stack go to the logs only: they can hold secrets.
func recoverPanics(logger *slog.Logger) connect.ServerInterceptor {
	return func(next connect.ServerFunc) connect.ServerFunc {
		return func(ctx context.Context, spec connect.Spec, stream connect.ServerStream) (err error) {
			defer func() {
				if p := recover(); p != nil {
					logger.LogAttrs(context.WithoutCancel(ctx), slog.LevelError, "rpc panicked",
						slog.String("procedure", loggableProcedure(spec.Procedure)),
						slog.String("request_id", RequestID(ctx)),
						slog.String("panic", fmt.Sprint(p)),
						slog.String("stack", string(debug.Stack())),
					)
					err = connect.NewError(connect.CodeInternal, "internal error")
				}
			}()
			return next(ctx, spec, stream)
		}
	}
}
