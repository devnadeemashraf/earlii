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

**Result:** CI runs the same `task check` on `ubuntu-latest` and `windows-latest` (see the PR checks). The local run takes 2.1 s. No per-OS speed comparison was measured, because portability, not speed, was the goal.

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
