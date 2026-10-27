# P0-01-1 · How the guards turn policy into enforcement (explain it, timebox 45 min)

## Concept brief

AGENTS.md is a *request*: an agent can ignore it. Enforcement comes from code that runs whether or not anyone remembers the rules. Earlii enforces the same policy at three independent layers:

1. **Claude Code PreToolUse hooks** run before the agent acts.
2. **Git hooks** (lefthook) run at commit and push time, for humans and agents alike.
3. **CI and the branch ruleset** run on GitHub, and nothing gets past them.

The rules themselves are **pure functions** in `scripts/lib/` (for example `evaluateBash(command, ctx)`). The hook entry points only parse input and print a decision. That's why the rules can be unit-tested without a git repo or a running agent.

A small example that isn't the answer: a vending machine's "exact change only" sticker is policy. The coin mechanism that rejects a wrong coin is enforcement.

## Task

Read these files:

- `scripts/lib/guards.mjs`
- `scripts/lib/shell.mjs`
- `scripts/claude/guard-bash.mjs`
- `scripts/lib/prepush.mjs`
- `.claude/settings.json`
- `lefthook.yml`

Then answer in **at most 10 lines** (write the answer below, or tell the mentor):

1. Trace what happens, layer by layer, when an agent runs `git push origin HEAD:main` from a feature branch. Which layer stops it, and what would still stop it if that layer had a bug?
2. Why is `ctx.pointerChanged` passed in as a function, not a boolean?
3. Name one command that would get past `splitCommands`/`tokenize`, and the layer that would still catch it.

## Tests

None to write. The mentor checks your understanding with 2–3 follow-up questions (`/exercise grade P0-01-1`).

## Hints

<details><summary>Level 1 · nudge</summary>Look at what <code>evaluatePush</code> does with a refspec that contains a colon.</details>
<details><summary>Level 2 · approach</summary>Count the independent checks: the Claude hook, the pre-push hook reading git's stdin, and the GitHub ruleset. What does each one see?</details>
<details><summary>Level 3 · near-pseudocode</summary>Q2 is about laziness and cost: calling git (merge-base + diff) only when the command is actually <code>gh pr create</code>. Q3: think of variables, <code>eval</code> or a script file that runs git internally.</details>

## Stretch goal

Add a failing test to `scripts/test/guards.test.mjs` for a bypass you found. Then fix the guard, or argue in 3 lines why the next layer is the right place to catch it.

## Interview angle

"I didn't trust instructions alone, so I made the policy executable: pure, unit-tested rule functions, reused by AI-agent hooks, git hooks and CI. The layers are independent, so a bug in one doesn't open the gate."

## Answer

_(owner writes here)_
