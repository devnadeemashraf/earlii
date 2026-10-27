# Decision stories

Interview-ready write-ups of real decisions in this codebase. One entry per notable decision. Every number comes from a command you can re-run, and unmeasured claims say so.

## Template

```markdown
## S-NNN · <title>   (PR #, roadmap ID, ADR if any)

**Problem / bottleneck:** what was slow, risky or unclear, with the evidence.
**Options:**
- A: … (trade-offs)
- B: …
- C: …
**Chose** <Y> **because** <A, B, C>. **Skipped** <Z> **because** <…>.
**Result:** <metric before → after, with the command>, or "Not measured, because …; measure by …".
**Soundbite:** "I found [X], so I did [Y] because [A, B, C]. I skipped [Z] because […]. It improved [metric] by [M]%."
**Likely follow-ups:**
- Q: … A: …
- Q: … A: …
```

---

## S-001 · Making AI-agent policy executable, in three independent layers   (P0-01, ADR-0001)

**Problem:** an AI agent writes most of the code. Instructions in AGENTS.md ("never push to main", "no AI trailers", "update POINTER") are requests, and agents sometimes ignore them. A broken `main` or a leaked secret in a **public** repo is hard to undo.

**Options:**
- **A: Instructions only.** Zero cost, zero enforcement.
- **B: Server-side only** (a GitHub ruleset + CI). Strong, but feedback arrives minutes later, after a push, and it can't stop a local `git commit` on main or the agent reading `.env`.
- **C: The same rules enforced at three layers:** Claude Code PreToolUse hooks (before the agent acts), git hooks (for anyone, at commit and push), and CI + ruleset (nothing gets past). All the rules live as **pure functions** in `scripts/lib/`, so each layer is a thin wrapper.

**Chose C because:**
- each layer is independent, so a bug in one (for example the shell parser) is caught by the next;
- pure functions make the policy unit-testable without git or an agent;
- local feedback is instant instead of waiting minutes for CI.

**Skipped B alone** because it can't see local actions (commits on main, secret reads), and its feedback is slow.

**Result** (measured 2026-10-27, Windows 11, Node 24.22.1):
- 140 tests cover the rules, including 19 abuse cases (force-push variants, `--no-verify`, env-prefix tricks, AI trailers): `node --test "scripts/test/*.test.mjs"`.
- Hook overhead is **~153 ms** per edit (`guard-edit`) and **~188 ms** per shell command (`guard-bash`, including git lookups), averaged over 20 runs with a `date +%s%N` loop.
- The full local check takes **2.1 s** (`time task check`).

**Soundbite:** "Our AI agent wrote most of the code, so I turned the team rules into code: pure, unit-tested rule functions that the agent's hooks, the git hooks and CI all reuse. Three independent layers means one bug doesn't open the gate. It costs under 200 ms per agent action, and the whole check runs in about 2 seconds."

**Likely follow-ups:**
- Q: Why not just trust CI? A: CI can't see local actions like committing on main or reading `.env`, and it reports minutes later. Local hooks fail in milliseconds.
- Q: How do you know the shell parser is safe? A: I don't assume it is. It's a classifier, not a sandbox, and I list its known blind spots (`eval`, scripts that call git). The pre-push hook and the server ruleset catch what it misses.

---

## S-002 · A cross-platform task runner on a Windows dev box   (P0-01, ADR-0001)

**Problem:** development happens on Windows 11 and CI runs Linux (plus Windows). Recipe drift between machines means "works on my machine" bugs in the very tooling meant to prevent them.

**Options:**
- **A: Make.** Not installed on Windows, and recipes depend on cmd vs sh.
- **B: just.** Clean syntax, but it shells out to the OS shell, so the same recipe behaves differently per OS.
- **C: Task,** with an embedded POSIX shell interpreter (mvdan/sh), so one recipe runs the same everywhere.

**Chose C because:**
- one Taskfile serves both OSes;
- it's a single binary pinned by mise;
- the `skip:` branches (`if [ -f go.work ]`) work on Windows without Git Bash.

**Skipped just** because shell differences would force per-OS recipes.

**Result:** CI runs the same `task doctor` + `task check` on both OSes. Both were green on the first run of PR #1: ubuntu-latest 20 s, windows-latest 1 m 21 s (job durations from `gh pr checks 1`). The local run takes 2.1 s. No per-OS speed comparison was measured, because portability, not speed, was the goal.

**Soundbite:** "I develop on Windows but deploy on Linux, so I chose a task runner with an embedded POSIX shell and made CI run the identical check on both OSes. Tooling drift became a CI failure instead of a surprise."

**Likely follow-ups:**
- Q: Why not WSL? A: The native toolchain matches what most contributors and the hooks see. WSL is fine, but optional.

---

## S-003 · A formatter silently broke config, and the test that should have caught it   (P0-01)

**Problem:** after the first `biome check --write`, every skill and subagent file gained a blank line after its opening `---`. Biome 2.6 formats Markdown, and that blank line makes the YAML frontmatter unparseable. It also reformatted the committed README and the owner's SPEC. The config test still **passed**, because its frontmatter regex was lenient.

**Options:**
- **A: Keep formatting Markdown with Biome,** and add an ignore comment to every file.
- **B: Switch Markdown formatting to another tool** (Prettier / markdownlint).
- **C: Exclude `*.md` from Biome**, restore the damaged files, and make the test strict.

**Chose C because:**
- it's the smallest change;
- docs don't need auto-formatting yet;
- the strict test now fails on exactly this regression.

**Skipped B** because it adds a dependency for a problem we don't have yet.

**Recovery:**
- the README came back with `git checkout`;
- the uncommitted SPEC came back from the editor's pre-edit snapshot, and its body was verified identical to the original with `diff`;
- the frontmatter was repaired by a script.

**Result:** the tightened regex rejects the broken form and the old one accepted it (`node -e` check against a sample file). All 140 tests still pass.

**Soundbite:** "A formatter upgrade quietly corrupted config files, and my test passed because it was too lenient. I restored the files, verified byte-for-byte that the spec was intact, and tightened the test so it fails on exactly that regression. A green test only means as much as its assertions."

**Likely follow-ups:**
- Q: How would you catch this class of bug earlier? A: Validate configs with the consumer's own parser where possible, and run a formatter's first pass on a branch with the diff reviewed.

---

## S-004 · One alias declaration for four TypeScript contexts   (P0-01 review, ADR-0004)

**Problem:** the owner wanted `@/` imports to work in development, testing and production. The classic failure is an alias declared in several places (tsconfig, the bundler, the test runner) that drift apart. The code typechecks but the build fails, or tests pass but the dev server can't resolve.

**Options:**
- **A: tsconfig `paths` as the single source**, read natively by Vite 8 (`resolve.tsconfigPaths`); Vitest inherits it.
- **B: Node subpath imports (`#/*`).** Standards-based, but an unfamiliar prefix, and shadcn expects `@/`.
- **C: Duplicate alias maps, or the `vite-tsconfig-paths` plugin.** Drift risk, or a dependency that Vite 8 makes unnecessary.

**Chose A because:**
- one declaration per project;
- zero plugins;
- shadcn compatibility.

**Skipped B** because two conventions in one codebase is worse than one familiar one. **Skipped C** because duplication is exactly the bug class we're avoiding.

**Result:**
- `scripts/test/ts-alias.test.mjs` proves all four contexts (10 tests, 2.9 s, `node --test scripts/test/ts-alias.test.mjs`):
  - `tsc` passes and fails with TS2307 on a broken alias;
  - Vitest passes;
  - the dev server rewrites `@/lib/freshness` to `/src/lib/freshness.ts`;
  - the production bundle has no alias left and runs.
- Biome now rejects `../` imports in app code, which keeps the convention from eroding.

**Soundbite:** "Aliases usually break because they're declared three times. I declared ours once, in tsconfig, used Vite 8's native resolver for dev and build, and let Vitest inherit it. Then I wrote one test that proves the same import resolves in typecheck, tests, the dev server and the production bundle, plus a lint rule that bans `../` so the convention can't erode."

**Likely follow-ups:**
- Q: Why not alias across packages too? A: Package boundaries should be explicit. Workspace package names make dependencies visible in `package.json`, so the bundler and tooling treat them as real packages.
- Q: What breaks if code runs unbundled? A: Node doesn't read tsconfig `paths`, so any TS run without a bundler needs a resolver. That's noted in ADR-0004.

---

## S-005 · Turning a style preference into an enforced rule   (P0-01 review)

**Problem:** the owner banned the section sign everywhere. Dozens of references already existed across docs, skills and the PR body, and a style rule that relies on memory erodes.

**Options:**
- **A: A note in AGENTS.md.** It depends on the agent remembering.
- **B: A CI grep.** It catches problems late, and misses commit messages and PR text.
- **C: One pure function (`findBannedChars`)** reused by the edit guard (before the agent writes), the pre-commit and commit-msg hooks, the PR guard and `task lint:text` in CI.

**Chose C because** it follows the same pattern as S-001: the cheapest, earliest point of enforcement, with independent backstops.

**Skipped B alone** because it can't see commit messages or PR bodies.

**Migration:** a context-aware rewrite instead of a blind delete. "SPEC" plus the sign plus a number became "SPEC section 4". In labelled Spec fields, the sign was simply dropped ("Spec: Q"). The ambiguous leftovers were then reviewed by hand.

**Caught by the rule itself:** the formatter rewrote the unicode escape in the rule's own source into the literal character. The full-repo test had passed only because the new files weren't tracked yet. The pre-commit hook blocked the commit, and the fix builds the character with `String.fromCodePoint(0xa7)`.

**Result:**
- 0 occurrences in tracked files (`node scripts/check-text.mjs`);
- the rule is covered by `scripts/test/banned.test.mjs`.

**Soundbite:** "When a rule matters, I make it executable once and reuse it everywhere it can be broken: the editor, commits, PR text and CI."

---

## S-006 · A private file almost shipped: incident and fix   (P0-01 review)

**Problem:** the owner asked to keep SPEC private. I gitignored it and staged its removal. But while splitting commits I reset the index and ran `git add docs/SPEC.md`. For a file that is *already tracked*, `.gitignore` does nothing, so git staged it as **modified** instead of deleted. The PR then carried SPEC, and a squash merge would have published it to `main`. I had also reported "it won't be merged", which was wrong.

**How it was caught:** while preparing the owner-approved history rewrite, I diffed the tree before and after the rewrite. The diff showed SPEC still tracked at the branch tip.

**Fix:**
- `git filter-branch --index-filter 'git rm --cached --ignore-unmatch …'` over the PR commits only;
- verified that zero commits contain the file and no SPEC text is reachable;
- restored the local file from the backup ref;
- the owner force-pushes, and GitHub Support purges cached views.

**Prevention:**
- a test fails whenever either private file is tracked; it was proven by staging SPEC into a throwaway index and watching the test fail;
- the Bash guard denies `git add` of the private paths, forced or not.

**Result:**
- 0 of 7 rewritten commits contain the files;
- the final tree is otherwise identical;
- 166 tests pass.

**Soundbite:** "I nearly leaked a private spec: `.gitignore` doesn't untrack a file that's already tracked, and I'd re-staged it by accident. I caught it by diffing the tree before and after a history rewrite, purged it from every commit, then made it impossible to repeat with a test and a guard. The lesson I took away: verify the end state, don't assume the steps worked."

---

## S-007 · Fail-fast config that can't crash-loop a rollback   (P0-02, PR TBD)

**Problem:** config errors in a containerised service tend to show up late and one at a time. A typo such as `EARLII_HTTP_ADRR` is silently ignored, so the default is used and the service listens on the wrong port. A missing variable surfaces only when a request first needs it. And a validation error that echoes its value prints a database password into the logs. But "reject anything unknown" has its own failure mode: roll back to an older image after adding a variable, and the old binary refuses to boot.

**Options:**
- **A: An env library** (struct tags, e.g. caarlos0/env). Less code. But it's a dependency for about 100 lines of logic, and unknown-key detection, duplicate detection and no-echo errors would still be custom.
- **B: Lenient `os.Getenv` with defaults.** Simplest, but typos and wrong-case keys are invisible, and failures come one per redeploy.
- **C: A standard-library parser over `os.Environ()`:**
  - every error is collected with `errors.Join`, naming the variable but never its value;
  - `EARLII_ENV` is required;
  - unknown `EARLII_*` keys (any case) are fatal unless `EARLII_ENV=prod`, where they are only logged.

**Chose C because:**
- one boot reports every problem, so a broken deploy takes one fix instead of one per variable;
- strictness catches typos everywhere except the place where it would cause an outage (a prod rollback);
- secrets are about to enter config (database URLs in P0-04), so no error may echo a value, and that is tested.

**Skipped A** because the standards say standard library first, and the hard parts would still be custom. **Skipped B** because silent defaults are how a service ends up on the wrong port.

**Result:**
- `go test -v ./internal/config` runs 42 passing cases, 27 of them rejection cases: signed and leading-zero ports, `1e3s`, a duration past the kill deadline, a key set twice, wrong-case keys, and Windows `=C:` entries.
- A dedicated test feeds a fake DSN into every variable and asserts it never appears in the error.
- Boot-time cost was not measured, because it runs once per process. Measure it with a `BenchmarkLoad` if config grows.

**Soundbite:** "I made config fail fast and report everything at once, but I made unknown variables fatal only outside prod. Strict everywhere would have turned a routine rollback into a crash loop. Errors name the variable, never its value, because config is where database passwords live."

**Likely follow-ups:**
- Q: Why not fail on unknown keys in prod too? A: The environment is shared across image versions. A variable added for v2 is unknown to v1, so a strict v1 couldn't be rolled back to. Prod logs a warning instead.
- Q: Why require `EARLII_ENV` instead of defaulting to dev? A: Defaulting to dev means a forgotten variable in prod silently runs dev behaviour. Requiring it costs one line of deploy config.

---

## S-008 · A shutdown budget that fits inside the platform's kill deadline   (P0-02, PR TBD, exercise P0-02-1)

**Problem:** when a container is stopped, the platform sends SIGTERM and later SIGKILL. Docker waits 10 s; Render waits 30 s by default (docs/VERSIONS.md). If the drain takes longer than the platform waits, in-flight requests are cut off by the kill anyway, and the logs never show a "stopped" line. Three things could stretch the drain: a hung handler, a slowloris client, or a dependency check that never returns.

**Options:**
- **A: Close on SIGTERM.** Simplest, but every in-flight request fails on every deploy.
- **B: `Shutdown` with no deadline.** Graceful, but one stuck request holds the process until SIGKILL.
- **C: `Shutdown` bounded by a budget below the strictest kill deadline, then `Close`:**
  - the budget is 8 s by default and capped at 9 s by config validation;
  - `/readyz` fails as soon as the signal arrives, so load balancers stop routing;
  - every connection has read, write and idle timeouts;
  - the readiness checks run concurrently, under one 2 s timeout that a buggy check can't hold up.

**Chose C because:**
- the strictest platform (Docker, 10 s) sets the ceiling, and the cap enforces it, so a misconfiguration can't exceed it;
- a second Ctrl-C restores the default signal handlers, so a developer is never stuck waiting;
- every mode serves the probes, so Compose and Render health-check any container the same way.

**Skipped B** because one hostile client could hold every deploy hostage.

**Result:**
- The six drain tests (in-flight completes, hung handler cut off at the deadline, slowloris, idle keep-alive, closed listener, pre-cancelled context) pass 5 runs out of 5 against a reference solution: `go test -count=5 ./internal/httpserver` with `exerciseStarted = true`.
- Against the shipped stub, the drain and forced-close tests fail as intended.
- Drain latency in production was not measured, because there's no deploy yet (P0-06). Measure it from the gap between the "stopped" log line and SIGTERM.

**Soundbite:** "Deploys send SIGTERM, then SIGKILL after 10 seconds on Docker, so I bounded the graceful drain at 8 seconds and made config reject anything over 9. Readiness flips to failing on the signal so traffic moves away. Tests prove that a hung handler or a slowloris can't hold the process past the deadline."

**Likely follow-ups:**
- Q: Why 8 s when Render gives 30? A: The same image runs under Docker locally and in Compose, where the limit is 10 s. The strictest platform sets the budget.
- Q: What about background jobs? A: In P0-04 the River client stop shares the same budget. It's one deadline passed down, not two timeouts that add up.
