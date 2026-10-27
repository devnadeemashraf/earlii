package rpc_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	"connectrpc.com/connect/v2/connectinprocess"

	earliiv1 "github.com/devnadeemashraf/earlii/backend/gen/api/earlii/v1"
	"github.com/devnadeemashraf/earlii/backend/gen/api/earlii/v1/earliiv1connect"
	"github.com/devnadeemashraf/earlii/backend/internal/health"
	"github.com/devnadeemashraf/earlii/backend/internal/rpc"
)

var requestIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// logBuffer collects JSON log lines; the server logs from handler goroutines.
type logBuffer struct {
	mu  sync.Mutex // guards buf
	buf bytes.Buffer
}

func (b *logBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

// lines decodes every log line, failing the test on one that isn't JSON (a
// log injection would split or corrupt a line).
func (b *logBuffer) lines(t *testing.T) []map[string]any {
	t.Helper()
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []map[string]any
	for line := range strings.SplitSeq(strings.TrimSpace(b.buf.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("log line is not JSON: %v: %q", err, line)
		}
		out = append(out, m)
	}
	return out
}

// withMsg returns the lines whose msg is msg.
func withMsg(lines []map[string]any, msg string) []map[string]any {
	var out []map[string]any
	for _, l := range lines {
		if l["msg"] == msg {
			out = append(out, l)
		}
	}
	return out
}

func newLogger() (*slog.Logger, *logBuffer) {
	b := &logBuffer{}
	return slog.New(slog.NewJSONHandler(b, nil)), b
}

func checker(checks ...health.Check) *health.Checker {
	return health.NewChecker(slog.New(slog.DiscardHandler), health.Config{Timeout: time.Second}, checks...)
}

func ok(context.Context) error { return nil }

// serve mounts server on a mux behind a loopback test server, as main does.
func serve(t *testing.T, server *connect.Server) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	rpc.Mount(mux, server)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return ts
}

// reply is a fully read response.
type reply struct {
	StatusCode int
	Header     http.Header
	Body       string
}

// post sends a raw Connect unary request, so tests control every header and
// byte the generated client would normalise.
func post(t *testing.T, ts *httptest.Server, path string, body io.Reader, header http.Header) reply {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, ts.URL+path, body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")
	maps.Copy(req.Header, header)
	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	return reply{StatusCode: res.StatusCode, Header: res.Header, Body: readAll(t, res.Body)}
}

func readAll(t *testing.T, r io.Reader) string {
	t.Helper()
	b, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

const checkPath = earliiv1connect.HealthServiceCheckProcedure

// --- In-process handler tests (connectinprocess: no listener, no codec) ---

func inProcessClient(server *connect.Server) earliiv1connect.HealthServiceClient {
	return earliiv1connect.NewHealthServiceClient(connect.NewClient(connectinprocess.New(server)))
}

func TestCheckServing(t *testing.T) {
	logger, _ := newLogger()
	client := inProcessClient(rpc.NewServer(logger, checker(
		health.Check{Name: "queue", Fn: ok},
		health.Check{Name: "postgres", Fn: ok},
	)))

	res, err := client.Check(t.Context(), &earliiv1.CheckRequest{})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if res.GetStatus() != earliiv1.Status_STATUS_SERVING {
		t.Fatalf("status = %v, want SERVING", res.GetStatus())
	}
	got := res.GetChecks()
	if len(got) != 2 || got[0].GetName() != "postgres" || !got[0].GetOk() || got[1].GetName() != "queue" || !got[1].GetOk() {
		t.Fatalf("checks = %v, want postgres ok, queue ok (sorted)", got)
	}
}

// A failing dependency is content, not an error: the API is up and says what
// is wrong, without the error text.
func TestCheckNotServingIsAResponse(t *testing.T) {
	logger, _ := newLogger()
	client := inProcessClient(rpc.NewServer(logger, checker(
		health.Check{Name: "postgres", Fn: func(context.Context) error {
			return errors.New("dial postgres://admin:hunter2@10.0.0.5: refused")
		}},
	)))

	res, err := client.Check(t.Context(), &earliiv1.CheckRequest{})
	if err != nil {
		t.Fatalf("Check: %v, want a NOT_SERVING response", err)
	}
	if res.GetStatus() != earliiv1.Status_STATUS_NOT_SERVING {
		t.Fatalf("status = %v, want NOT_SERVING", res.GetStatus())
	}
	if len(res.GetChecks()) != 1 || res.GetChecks()[0].GetOk() {
		t.Fatalf("checks = %v, want postgres failing", res.GetChecks())
	}
}

func TestCheckNoChecksIsServing(t *testing.T) {
	logger, _ := newLogger()
	res, err := inProcessClient(rpc.NewServer(logger, checker())).Check(t.Context(), &earliiv1.CheckRequest{})
	if err != nil || res.GetStatus() != earliiv1.Status_STATUS_SERVING || len(res.GetChecks()) != 0 {
		t.Fatalf("got %v, %v; want SERVING with no checks", res, err)
	}
}

func TestCheckCallerGone(t *testing.T) {
	logger, _ := newLogger()
	started := make(chan struct{})
	var once sync.Once
	hung := health.Check{Name: "postgres", Fn: func(ctx context.Context) error {
		once.Do(func() { close(started) })
		<-ctx.Done()
		return ctx.Err()
	}}
	client := inProcessClient(rpc.NewServer(logger,
		health.NewChecker(slog.New(slog.DiscardHandler), health.Config{Timeout: time.Minute}, hung)))
	ctx, cancel := context.WithCancel(t.Context())
	go func() {
		<-started
		cancel() // the caller hangs up while the check is running
	}()

	_, err := client.Check(ctx, &earliiv1.CheckRequest{})
	if code := connect.CodeOf(err); code != connect.CodeCanceled {
		t.Fatalf("code = %v (%v), want canceled", code, err)
	}
}

// --- Over HTTP: what the browser and a hostile client actually reach ---

func TestCheckOverHTTP(t *testing.T) {
	logger, logs := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker(health.Check{Name: "postgres", Fn: ok})))
	client := earliiv1connect.NewHealthServiceClient(connect.NewClient(
		connecthttp.NewTransport(ts.Client(), ts.URL, connecthttp.WithProtoJSON())))

	ctx, info := connect.NewClientContext(t.Context())
	res, err := client.Check(ctx, &earliiv1.CheckRequest{})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if res.GetStatus() != earliiv1.Status_STATUS_SERVING {
		t.Fatalf("status = %v, want SERVING", res.GetStatus())
	}
	id := info.ResponseHeader().Get("X-Request-Id")
	if !requestIDPattern.MatchString(id) {
		t.Fatalf("X-Request-Id = %q, want 32 hex characters", id)
	}
	if got := info.ResponseHeader().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	access := withMsg(logs.lines(t), "rpc")
	if len(access) != 1 {
		t.Fatalf("access log lines = %d, want 1: %v", len(access), access)
	}
	line := access[0]
	for k, want := range map[string]any{
		"procedure":  checkPath,
		"code":       "ok",
		"protocol":   "connect",
		"codec":      "json",
		"request_id": id,
	} {
		if line[k] != want {
			t.Errorf("log %s = %v, want %v", k, line[k], want)
		}
	}
	if _, has := line["duration"]; !has {
		t.Error("log has no duration")
	}
}

// The browser calls Check with GET (NO_SIDE_EFFECTS); a shared cache must
// never keep a stale "ok".
func TestCheckWithGET(t *testing.T) {
	logger, _ := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker(health.Check{Name: "postgres", Fn: ok})))

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
		ts.URL+checkPath+"?connect=v1&encoding=json&message=%7B%7D", http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	body := readAll(t, res.Body)
	if res.StatusCode != http.StatusOK || !strings.Contains(body, "STATUS_SERVING") {
		t.Fatalf("GET = %d %s, want 200 SERVING", res.StatusCode, body)
	}
	if got := res.Header.Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

// Requiring the protocol marker means a plain cross-site form or <img> can't
// make a valid call: a GET needs connect=v1, a POST needs the header (which a
// cross-origin page can only send after a CORS preflight we never grant).
func TestRequiresConnectProtocolMarker(t *testing.T) {
	logger, _ := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker()))

	t.Run("GET without connect=v1", func(t *testing.T) {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
			ts.URL+checkPath+"?encoding=json&message=%7B%7D", http.NoBody)
		if err != nil {
			t.Fatal(err)
		}
		res, err := ts.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = res.Body.Close() }()
		if res.StatusCode == http.StatusOK {
			t.Fatalf("GET without connect=v1 = 200, want a rejection")
		}
	})
	t.Run("POST without Connect-Protocol-Version", func(t *testing.T) {
		res := post(t, ts, checkPath, strings.NewReader("{}"), http.Header{"Connect-Protocol-Version": nil})
		if res.StatusCode == http.StatusOK {
			t.Fatalf("POST without the protocol header = 200, want a rejection")
		}
	})
	t.Run("POST as text/plain (a CORS simple request)", func(t *testing.T) {
		res := post(t, ts, checkPath, strings.NewReader("{}"), http.Header{"Content-Type": {"text/plain"}})
		if res.StatusCode == http.StatusOK {
			t.Fatalf("text/plain POST = 200, want a rejection")
		}
	})
}

// The server's request ID is the only one it trusts: an inbound ID is logged
// for correlation, but a client can't make two requests share an ID.
func TestRequestIDIsNeverAdopted(t *testing.T) {
	logger, logs := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker()))

	ids := make([]string, 0, 2)
	for range 2 {
		res := post(t, ts, checkPath, strings.NewReader("{}"), http.Header{"X-Request-Id": {"victim-id-123"}})
		if res.StatusCode != http.StatusOK {
			t.Fatalf("status = %d", res.StatusCode)
		}
		ids = append(ids, res.Header.Get("X-Request-Id"))
	}
	if ids[0] == "victim-id-123" || ids[0] == ids[1] || !requestIDPattern.MatchString(ids[0]) || !requestIDPattern.MatchString(ids[1]) {
		t.Fatalf("response IDs = %q, want two fresh, different server IDs", ids)
	}
	for _, l := range withMsg(logs.lines(t), "rpc") {
		if l["client_request_id"] != "victim-id-123" {
			t.Errorf("client_request_id = %v, want the inbound ID logged for correlation", l["client_request_id"])
		}
	}
}

func TestHostileInboundRequestIDIsNotLogged(t *testing.T) {
	for name, value := range map[string]string{
		"too long":       strings.Repeat("a", 65),
		"bad characters": "id with spaces;drop",
		"bidi override":  "id" + string(rune(0x202e)), // right-to-left override
	} {
		t.Run(name, func(t *testing.T) {
			logger, logs := newLogger()
			ts := serve(t, rpc.NewServer(logger, checker()))
			res := post(t, ts, checkPath, strings.NewReader("{}"), http.Header{"X-Request-Id": {value}})
			if res.StatusCode != http.StatusOK {
				t.Fatalf("status = %d", res.StatusCode)
			}
			access := withMsg(logs.lines(t), "rpc")
			if len(access) != 1 {
				t.Fatalf("access lines = %d, want 1", len(access))
			}
			if v, has := access[0]["client_request_id"]; has {
				t.Fatalf("client_request_id = %q logged, want hostile IDs dropped", v)
			}
		})
	}
}

// A panicking handler answers "internal" with fixed text, never the panic
// value, and is logged once by the access log with its request ID.
func TestPanicIsRecovered(t *testing.T) {
	logger, logs := newLogger()
	ts := serve(t, rpc.NewServerWith(logger, panickingHealth{}))

	res := post(t, ts, checkPath, strings.NewReader("{}"), nil)
	body := res.Body
	if strings.Contains(body, "hunter2") {
		t.Fatalf("response leaks the panic value: %s", body)
	}
	if !strings.Contains(body, `"code":"internal"`) {
		t.Fatalf("body = %s, want code internal", body)
	}
	id := res.Header.Get("X-Request-Id")

	lines := logs.lines(t)
	access := withMsg(lines, "rpc")
	if len(access) != 1 || access[0]["code"] != "internal" || access[0]["request_id"] != id || access[0]["level"] != "ERROR" {
		t.Fatalf("access lines = %v, want one ERROR line with code internal and request_id %s", access, id)
	}
	panics := withMsg(lines, "rpc panicked")
	if len(panics) != 1 || !strings.Contains(panics[0]["panic"].(string), "hunter2") || panics[0]["request_id"] != id {
		t.Fatalf("panic lines = %v, want one with the value and request_id, for the operator", panics)
	}
}

type panickingHealth struct {
	earliiv1connect.UnimplementedHealthServiceHandler
}

func (panickingHealth) Check(context.Context, *earliiv1.CheckRequest) (*earliiv1.CheckResponse, error) {
	panic("secret password hunter2")
}

// Errors that aren't authored *connect.Error values reach the client as a bare
// code: no wrapped driver text.
func TestPlainErrorTextNeverReachesClient(t *testing.T) {
	logger, _ := newLogger()
	ts := serve(t, rpc.NewServerWith(logger, failingHealth{}))

	body := post(t, ts, checkPath, strings.NewReader("{}"), nil).Body
	if strings.Contains(body, "hunter2") || strings.Contains(body, "10.0.0.5") {
		t.Fatalf("response leaks the error: %s", body)
	}
}

type failingHealth struct {
	earliiv1connect.UnimplementedHealthServiceHandler
}

func (failingHealth) Check(context.Context, *earliiv1.CheckRequest) (*earliiv1.CheckResponse, error) {
	return nil, errors.New("dial postgres://admin:hunter2@10.0.0.5: refused")
}

func TestOversizedRequestIsRejected(t *testing.T) {
	logger, _ := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker()))

	big := `{"pad":"` + strings.Repeat("x", 128<<10) + `"}`
	body := post(t, ts, checkPath, strings.NewReader(big), nil).Body
	if !strings.Contains(body, "resource_exhausted") {
		t.Fatalf("128 KiB request body = %s, want resource_exhausted", body)
	}
}

// A small gzip body that inflates past the limit fails without being
// inflated in full.
func TestGzipBombIsRejected(t *testing.T) {
	logger, _ := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker()))

	var bomb bytes.Buffer
	zw := gzip.NewWriter(&bomb)
	if _, err := zw.Write(make([]byte, 32<<20)); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	body := post(t, ts, checkPath, &bomb, http.Header{"Content-Encoding": {"gzip"}}).Body
	if !strings.Contains(body, "resource_exhausted") {
		t.Fatalf("gzip bomb = %s, want resource_exhausted", body)
	}
}

// An unknown method in a known service is attacker-chosen text in the
// procedure; the access log keeps it bounded and on one line.
func TestUnknownMethodIsLoggedBounded(t *testing.T) {
	logger, logs := newLogger()
	ts := serve(t, rpc.NewServer(logger, checker()))

	path := "/earlii.v1.HealthService/" + strings.Repeat("A", 4096)
	body := post(t, ts, path, strings.NewReader("{}"), nil).Body
	if !strings.Contains(body, "unimplemented") || strings.Contains(body, "AAAA") {
		t.Fatalf("unknown method = %s, want unimplemented without echoing the path", body)
	}
	access := withMsg(logs.lines(t), "rpc")
	if len(access) != 1 || access[0]["procedure"] != "unknown" || access[0]["code"] != "unimplemented" {
		t.Fatalf("access lines = %v, want one with procedure unknown, code unimplemented", access)
	}
}

func TestLoggableProcedure(t *testing.T) {
	for in, want := range map[string]string{
		"/earlii.v1.HealthService/Check":                             "/earlii.v1.HealthService/Check",
		"/earlii.v1.HealthService/" + strings.Repeat("A", 200):       "unknown",
		"/earlii.v1.HealthService/Ch" + string(rune(0x202e)) + "eck": "unknown",
		"/earlii.v1.HealthService/Check" + string(rune(0x200b)):      "unknown",
		"/earlii.v1.HealthService/a/b":                               "unknown",
		"/earlii.v1.HealthService/":                                  "unknown",
		"//Check":                                                    "unknown",
		"earlii.v1.HealthService/Check":                              "unknown",
		"/a b/c":                                                     "unknown",
		"":                                                           "unknown",
	} {
		if got := rpc.LoggableProcedure(in); got != want {
			t.Errorf("LoggableProcedure(%q) = %q, want %q", in, got, want)
		}
	}
}
