---
name: handoff
description: Update docs/POINTER.md, docs/ROADMAP.md status, docs/HANDBOOK.md and (if touched) VERSIONS and ADRs so the next session can pick up cold. Use at the end of every PR or when the user says "handoff".
---

Bring the handoff docs in line with the current branch. Work from `git diff origin/main...HEAD --stat`.

1. **docs/POINTER.md** (at most 80 lines; keep the fixed headings exactly)
   - **State:** phase, current branch/PR, what works now.
   - **FIX-FIRST QUEUE:** add any BP-xxx found, with evidence. Remove fixed ones.
   - **NEXT UP:** exactly one item: why now, where to start (files), done-when.
   - **Open questions for the human:** blocking decisions only.
   - **Environment notes and gotchas:** anything that cost time this session.
   - **Learning:** the mode, and the latest private study guide (path only; its content stays out of git).
   - **Recent history:** prepend this PR (PR #, ID, summary, manual test?). Keep the last 8.
2. **docs/ROADMAP.md:** set the item's status (`in review`, with the PR #) and append a status-log line with today's date.
3. **docs/HANDBOOK.md**
   - Update the repo map for any new module or directory.
   - Fill in any "(planned, <ID>)" section this PR built.
   - Add new glossary terms.
4. **docs/VERSIONS.md:** add any new dependency or fact with today's date and a source link.
5. **docs/adr/:** confirm any ADR written this PR is linked from HANDBOOK section Decision log.
6. Run `task handoff` and `task check`. Both must pass.
7. Then run `/study-guide` for this PR (private, never committed).
