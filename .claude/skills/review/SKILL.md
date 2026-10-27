---
name: review
description: Self-review the current branch's diff against docs/CODING_STANDARDS.md and AGENTS.md using the reviewer subagent, then fix what it finds. Use before opening any PR or when the user says "review".
---

1. Run `task check`. If it's red, fix that first.
2. Collect the diff: `git diff origin/main...HEAD` and `git diff --stat origin/main...HEAD`.
3. Delegate to the `reviewer` subagent with: the diff, the roadmap item ID and its acceptance criteria, and the instruction to review against docs/CODING_STANDARDS.md and AGENTS.md section 2 and section 7.
4. If the diff touches auth, sessions, input parsing, fetching, payments, files or LLM prompts, also run the `red-team` subagent on those files.
5. Triage the findings:
   - **Must-fix** (correctness, security, spec or guardrail violation, missing tests): fix now.
   - **Should-fix:** fix now if it's small; otherwise add a BP-xxx entry to POINTER.
   - **Nit:** fix or ignore.
6. Re-run `task check`. Summarise what was fixed in at most 5 lines.
