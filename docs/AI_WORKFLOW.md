# AI workflow

How the AI tooling fits together, and how to run a session. For the research behind these choices and the wider tool landscape, see [TOOLING.md](TOOLING.md).

## The pieces

```mermaid
flowchart TB
  A[AGENTS.md<br/>single source of instructions] --> C[CLAUDE.md<br/>@AGENTS.md import]
  P[docs/POINTER.md] -->|SessionStart hook| S[Claude Code session]
  C --> S
  S -->|/next-pr| L[THE PR LOOP]
  L --> SUB[Subagents<br/>architect · red-team · reviewer · mentor]
  L --> MCP[MCP<br/>gopls · playwright · context7]
  L --> G[Guards<br/>PreToolUse hooks]
  L --> F[Auto-format<br/>PostToolUse hook]
  L --> CI[task check → CI → PR]
  CI --> H[Human review and squash merge]
```

| Layer | What | Where |
| :-- | :-- | :-- |
| Instructions | Rules, read order, PR loop, never-list | `AGENTS.md` (Claude reads it through the `@AGENTS.md` import in `CLAUDE.md`) |
| Handoff | State, fix-first queue, next item, gotchas | `docs/POINTER.md`, injected at session start |
| Codebase map | Repo map plus module boundaries | `docs/HANDBOOK.md` section 3–4, and gopls for symbols, references and implementations |
| Language servers / MCP | `gopls mcp` (Go workspace symbols, diagnostics, references); Playwright MCP (browser snapshots of the PWA); Context7 (optional versioned docs lookup) | `.mcp.json` |
| Local API reference | `go doc` at the pinned module version; `.d.ts` files in `node_modules`; `--help` for CLIs | `/api-lookup` skill |
| Hooks | Inject POINTER; block secret, generated and vendored edits; ask before SPEC/LICENSE edits; block commits/pushes to main, force-push, `--no-verify`, merges, and PRs without a POINTER update; auto-format | `.claude/settings.json` → `scripts/claude/*.mjs` → `scripts/lib/*.mjs` (unit-tested) |
| Skills | `/next-pr`, `/handoff`, `/review`, `/study-guide`, `/api-lookup`, `/snapshot`, `/perf-check` | `.claude/skills/<name>/SKILL.md` |
| Subagents | `architect` (2–3 options + recommendation), `red-team` (abuse cases → tests), `reviewer` (diff vs standards), `mentor` (quizzes on the study guides, lab reviews) | `.claude/agents/*.md` |
| Git hooks | Format, secrets, Conventional Commits + no AI trailers, no push to main | `lefthook.yml` → `scripts/*.mjs` |
| CI | Lint + tests on Linux and Windows; the handoff rule; Dependabot | `.github/` |

**Defence in depth:**

1. The Claude hooks stop the agent before it acts.
2. The git hooks stop anyone, human or agent, at commit and push time.
3. CI and the branch ruleset stop anything that slipped through.

Each layer is independent, so one bug doesn't open the gate.

## Attribution policy

The owner holds all IP. The setting `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` in `.claude/settings.json` turns off Claude Code's default trailers and footers. The commit-msg hook and the Bash guard reject AI-attribution trailers and footers if they appear anyway.

## Starting a session

1. `cd earlii && claude`. The session-start hook prints the branch, git status and POINTER.
2. **Pick the work:**
   - say "next PR" or `/next-pr` (takes FIX-FIRST, then NEXT UP);
   - or `/next-pr P1-03` for a specific item.
3. The agent follows THE PR LOOP (AGENTS.md section 4):
   - orient;
   - branch;
   - design: the architect and red-team subagents for M items;
   - tests first;
   - implement;
   - `task check`;
   - `/review`;
   - `/handoff`, then `/study-guide` (private, never committed);
   - commit, push, PR.
4. **You:**
   - study the PR's guide in `docs/learning/<ID>-<slug>/` and do its labs (ask the mentor to quiz you or review a lab);
   - run any 🧪 manual checks;
   - review the PR and the decision brief;
   - squash-merge.

## Ending or pausing a session

Run `/handoff` before you stop, even mid-item. POINTER's NEXT UP and gotchas are the only memory the next session is guaranteed to have.

## Useful prompts

- "Architect: compare approaches for P1-07 scheduling." Runs the architect subagent.
- "Red-team the board discovery design." Runs the red-team subagent.
- "/study-guide P0-02" (re)writes the private study guide for a PR.
- "Mentor: quiz me on P0-02 chapter 4" or "Mentor: review my lab 05".
- "mode: build" or "mode: learn" switches modes (recorded in POINTER).

## Other AI tools

AGENTS.md is the shared source. A tool that reads `AGENTS.md` natively needs nothing else. For one that doesn't, add a one-line pointer file (e.g. `.github/copilot-instructions.md`: "Follow AGENTS.md"). Tools without hooks follow the manual checklists in AGENTS.md section 8.
