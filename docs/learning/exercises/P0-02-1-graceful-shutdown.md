# P0-02-1 · Graceful shutdown with errgroup and context (implement, timebox 2 h)

## Concept brief

A `context.Context` is a cancellation signal passed down a call tree. When it is cancelled, `<-ctx.Done()` unblocks for everyone holding it, and `ctx.Err()` says why. Nothing is killed: each goroutine has to notice and return. That is the core of all Go concurrency in Earlii.

In `cmd/earlii/main.go`, `signal.NotifyContext` turns SIGINT/SIGTERM into a cancelled context. `httpserver.Serve` receives it. Today the stub calls `srv.Close()`, which cuts every in-flight request off mid-response. On a deploy, that means users see failed requests.

`http.Server.Shutdown(ctx)` is the graceful version: it closes the listener, closes idle connections, then waits for active requests to finish, **or until its own ctx expires**. So you need two contexts: the signal one (when to start stopping) and a drain one (how long to wait). Careful: a context derived from an already-cancelled parent is born cancelled. Look at `context.WithoutCancel`.

`errgroup.Group` (`golang.org/x/sync/errgroup`) runs goroutines, waits for all of them, and returns the first error. `errgroup.WithContext` also cancels a shared context when any goroutine fails. You'll want that when the listener breaks before any signal arrives.

A small example that isn't the answer: a shop at closing time locks the front door (no new customers), lets the people inside finish paying, and after 10 minutes asks everyone still there to leave.

## Task

- **File / function:** `backend/internal/httpserver/serve.go`, `func Serve(ctx context.Context, srv *http.Server, ln net.Listener, drain time.Duration) error`. The doc comment is the contract.
- **Inputs → outputs:**
  - nil after a clean drain;
  - an error wrapping `context.DeadlineExceeded` if the drain ran out and connections were force-closed;
  - the serving error at once if `srv.Serve` fails (not `http.ErrServerClosed`).
- **Constraints:**
  - no `time.Sleep`;
  - no goroutine that `Serve` starts may outlive it;
  - wrap errors with context (`fmt.Errorf("drain: %w", err)`).
- **Setup:** `cd backend && go get golang.org/x/sync@v0.24.0 && go mod tidy` (the version is recorded in docs/VERSIONS.md).
- **Target:** returns within `drain` plus a few milliseconds, whatever the clients do.

## Tests

`backend/internal/httpserver/serve_test.go` has six tests: happy, sad, two edges, and the slowloris abuser. They are skipped until you set `exerciseStarted = true` at the top of the file. Two of them fail against the stub today (the drain, and the forced close).

```sh
cd backend
go test ./internal/httpserver -run TestServe -v
go test ./internal/httpserver -run TestServe -count=20   # flushes out flaky timing
```

`task check` must be green with `exerciseStarted = true` before grading. CI runs these with `-race` on Linux.

## Hints (reveal only when asked: `/exercise hint P0-02-1 <level>`)

<details><summary>Level 1 · nudge</summary>There are two things to wait for at the same time: <code>srv.Serve</code> returning, and <code>ctx</code> being done. Whichever happens first decides what to do next. Which tool waits for several goroutines and gives you the first error?</details>
<details><summary>Level 2 · approach</summary>Two goroutines in an <code>errgroup.WithContext</code> group. One runs <code>srv.Serve(ln)</code> and treats <code>http.ErrServerClosed</code> as success. The other waits on the <em>group's</em> context (so a Serve failure also wakes it), then calls <code>Shutdown</code> with a fresh timeout context. If Shutdown returns an error, call <code>Close</code>.</details>
<details><summary>Level 3 · near-pseudocode</summary><pre>
g, gctx := errgroup.WithContext(ctx)
g.Go: err := srv.Serve(ln); if not ErrServerClosed → return wrapped err; return nil
g.Go: <-gctx.Done()
      sctx, cancel := WithTimeout(WithoutCancel(ctx), drain); defer cancel()
      if err := srv.Shutdown(sctx); err != nil { srv.Close(); return wrapped err }
      return nil
return g.Wait()
</pre></details>

## Stretch goal

In P0-04 the worker must stop River and the HTTP server inside **one** budget. Change the signature to take a deadline (`time.Time`) instead of a duration, and explain in 3 lines why one shared deadline beats two separate timeouts.

## Interview angle

"Deploys were killing in-flight requests, because the server closed connections on SIGTERM. I used `signal.NotifyContext` to turn the signal into a context, and `errgroup` to run the server and a shutdown watcher together. `Shutdown` drains within a budget smaller than Docker's 10 s kill deadline, then force-closes. Tests prove that an in-flight request completes, and that a hung handler or a slowloris can't hold the process past the deadline."

## Answer

_(owner's notes after implementing)_
