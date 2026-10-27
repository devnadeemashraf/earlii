# Skills tracker (LEARN mode, standard intensity)

**Levels:**

- **0:** never seen
- **1:** needed heavy hints
- **2:** solo, with tests provided
- **3:** solo, including tests and complexity analysis
- **4:** can teach or review it

**How difficulty adapts:**

- Two clean level-3 results in an area mean harder exercises there.
- Struggling means smaller sub-exercises plus a refresher.

The self-assessment baseline (2026-10-27) assumes strong TS/React and new to Go. Adjust the starting levels in the first mentor session.

| Area | Level | Evidence | Weak spots | Next review |
| :-- | :-: | :-- | :-- | :-- |
| DSA: arrays, strings, hash maps | 2 | — | Go idioms (slices, maps, runes) | P1-06 |
| DSA: stacks, queues, linked structures | 1 | — | — | P1-03 |
| DSA: trees, tries, heaps | 1 | — | — | P1-02 |
| DSA: graphs (BFS/DFS, topo, union-find) | 1 | — | — | P1-12 |
| DSA: sorting, searching, binary search | 2 | — | — | P1-02 |
| DSA: techniques (two pointers, sliding window, recursion, greedy, DP, bits) | 1 | — | — | P1-09 / P1-12 |
| DSA: intervals and spatial | 1 | — | — | P1-10 |
| Big-O analysis | 2 | — | — | every exercise |
| Testing: unit / integration / e2e | 2 | — | Go table tests, integration with a DB | P0-02 |
| Testing: property-based, fuzzing, mutation | 0 | — | — | P1-03 / P1-10 / P1-05 |
| Debugging (repro → bisect → postmortem) | 2 | — | git bisect, Go debugger (Delve) | P1-08 |
| Performance (profiling, benchmarks, budgets) | 1 | — | pprof, benchstat, EXPLAIN | P0-06 / P1-12 |
| Design and architecture (interfaces, ADRs, data modelling, API versioning) | 2 | — | protobuf evolution | P0-04 / P0-05 |
| Reliability (idempotency, transactions, outbox) | 1 | — | — | P1-06 |
| Security (validation, authn/z, SSRF, XSS, secrets) | 1 | — | — | P1-11 |
| Observability (logs, metrics, traces) | 1 | — | — | P0-07 |
| Concurrency (goroutines, context, errgroup, locks vs channels, races) | 0 | — | — | P0-02 |
| Networking and OS (HTTP semantics, signals, containers) | 1 | — | — | P0-02 |
| LLM features with evals | 0 | — | — | E-01 |
| Craft (review, git workflows, CI/CD, docs, estimation) | 2 | — | — | P0-01 |

## Exercise log

| Exercise | Type | Status | Score (C/Cx/T/R/P/S/I) | Attempts | Re-implement on |
| :-- | :-- | :-- | :-- | :-: | :-- |
| P0-01-1 explain the PR guards | explain it | open | — | 0 | — |

The score columns are: correctness, complexity, tests, readability, performance, security and idiomatic use.
