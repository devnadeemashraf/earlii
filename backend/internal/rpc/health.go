package rpc

import (
	"context"
	"errors"

	"connectrpc.com/connect/v2"

	earliiv1 "github.com/devnadeemashraf/earlii/backend/gen/api/earlii/v1"
	"github.com/devnadeemashraf/earlii/backend/internal/health"
)

// healthService answers HealthService from the same checker as /readyz, so the
// two can never disagree.
type healthService struct {
	checker *health.Checker
}

func (s healthService) Check(ctx context.Context, _ *earliiv1.CheckRequest) (*earliiv1.CheckResponse, error) {
	if info, ok := connect.CallInfoForServerContext(ctx); ok {
		// Callable with GET, so a shared cache could otherwise keep a stale "ok".
		info.ResponseHeader().Set("Cache-Control", "no-store")
	}

	rep, err := s.checker.Check(ctx)
	if err != nil {
		// The only error is the caller's own context ending.
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, connect.NewError(connect.CodeDeadlineExceeded, "deadline exceeded")
		}
		return nil, connect.NewError(connect.CodeCanceled, "canceled")
	}

	res := &earliiv1.CheckResponse{
		Status: earliiv1.Status_STATUS_SERVING,
		Checks: make([]*earliiv1.DependencyCheck, 0, len(rep.Results)),
	}
	if !rep.OK() {
		res.Status = earliiv1.Status_STATUS_NOT_SERVING
	}
	for _, r := range rep.Results {
		res.Checks = append(res.Checks, &earliiv1.DependencyCheck{Name: r.Name, Ok: r.OK})
	}
	return res, nil
}
