---
name: perf-check
description: Measure performance against the budgets in docs/ROADMAP.md (Go benchmarks with benchstat, query plans, bundle size, API latency) and report regressions. Use on any hot-path change, before claiming a measured result in a PR or study guide, or when the user says "perf check".
argument-hint: "[area: go | sql | web | api]"
---

Measure, don't guess. Every number you report must come from a command you ran.

- **go** (skip if there are no Go modules yet): run `go test -run=^$ -bench=. -benchmem -count=10 ./<pkg>/...` on `main` and on the branch. Compare with `go run golang.org/x/perf/cmd/benchstat@<pinned> old.txt new.txt`, after pinning benchstat in VERSIONS on first use. Profile with `-cpuprofile` / `-memprofile` and `go tool pprof -top`.
- **sql** (skip if there's no database yet): run `EXPLAIN (ANALYZE, BUFFERS)` for every query the change touches, against seeded data. Flag seq scans on large tables and sorts that spill.
- **web** (skip if there's no web app yet): record the production build size per route chunk and compare it with the budget. Run Lighthouse on the PWA once that item lands.
- **api:** p50/p95 latency of the touched RPCs under a small fixed load, compared with SPEC section 4 budgets.

Report a table (metric, budget, before, after, delta %) plus the exact commands. Put the numbers in the PR decision brief and the study guide (`/study-guide`).
