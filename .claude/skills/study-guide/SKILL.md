---
name: study-guide
description: Write or update the owner's private study guide for a PR in docs/learning/<ID>-<slug>/ (gitignored, never committed) - concepts from zero, code walkthrough, internals verified against the pinned source, decisions, debugging, interview prep and hands-on labs with tests. Use after /handoff in every PR, or when the user asks to explain a PR, a concept or a decision.
argument-hint: "[roadmap ID, e.g. P0-02]"
---

Write the private study guide for `$ARGUMENTS` (if empty: the current branch's roadmap ID). The rules are in AGENTS.md section 5; `docs/learning/README.md` has the house style and the index to update.

**Privacy.** Everything goes under `docs/learning/`, which is gitignored. Never `git add` it (the Bash guard denies it), never quote it in commits or PR bodies, never publish it.

**Reader.** The owner: strong in TypeScript/React, new to Go. Assume no prior knowledge of anything else. Explain each concept before you use it, bridge from TypeScript where that helps, and say where the analogy breaks.

**Layout:** `docs/learning/<ID>-<slug>/`

1. `README.md`: what the PR does in plain words, the reading order, prerequisites (earlier guides), and a checklist the owner ticks.
2. Numbered chapters, each covering one theme:
   - **Concepts from zero:** language features, libraries, protocols, patterns and tools, each with a small runnable example that isn't the PR's code.
   - **Walkthrough:** every file the PR added or changed, with `file:line` references, explaining what and why.
   - **Under the hood:** how the library or tool really does it. Read the pinned source (`$(go env GOROOT)/src/...`, the module cache, `node_modules`) and name files and functions. Never describe internals from memory: if you couldn't verify something, mark it UNVERIFIED.
   - **Decisions:** for each one, the problem, 2–3 real options, what was chosen and skipped and why, the result (a re-runnable command, or "not measured, because …"), and a soundbite of at most 3 lines. Never invent numbers.
   - **Debug and optimise:** how to make this code fail, how to observe it (logs, `dlv`, `-race`, pprof, `GODEBUG`), and how to fix it.
   - **Interview prep:** 10–20 likely questions, with model answers inside `<details>`.
3. `labs/` (for Go PRs): a self-contained module with its own `go.mod` and a `go.work` containing `use .`, so it stays out of the product workspace.
   - Each lab is a package with a stub (`panic("TODO")` or similar), failing tests and a `README.md` (goal, steps, hints in `<details>`).
   - Order the labs from rebuilding the PR's ideas from scratch, to variations, to a bug hunt.
   - Reference solutions go in `labs/SOLUTIONS.md`, never in the stub files.
   - **Verify before handing over:** every lab's tests must pass against the reference solution, and fail against the stub. Run them with `go test ./...` from `labs/`.

**Finish:**

- Update the index and progress table in `docs/learning/README.md`.
- Tell the owner where the guide is, and which chapter to start with.
