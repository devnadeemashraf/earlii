---
name: next-pr
description: Run the full Earlii PR loop for the next roadmap item (or a given ID) - orient, branch, design, tests first, implement, check, review, handoff, PR. Use when the user says "next PR", "continue", "start <ID>" or similar.
argument-hint: "[roadmap ID, e.g. P0-02]"
---

Run THE PR LOOP from AGENTS.md section 4 for `$ARGUMENTS` (if empty: the first FIX-FIRST QUEUE entry in docs/POINTER.md, else NEXT UP).

1. **Orient**
   - Read docs/POINTER.md, then the ROADMAP entry and every SPEC section it cites, then the HANDBOOK repo map and relevant sections.
   - State in 3 lines: the item, its acceptance criteria, and the files you expect to touch.
   - If the item is size L or has no acceptance criteria, stop and propose a split (docs-only grooming PR) instead.
2. **Versions:** check docs/VERSIONS.md for every dependency you'll use. Add and verify any new one (date + source) before using it.
3. **Branch:** `git switch main && git pull --ff-only && git switch -c <type>/<ID>-<slug>`.
4. **Design**
   - For M items, or anything touching the data model, security, concurrency or hot paths: run the `architect` subagent for 2–3 options and the `red-team` subagent against the leading option.
   - Pick one, and write an ADR (docs/adr/) if the choice will last.
5. **Build mode:** build the whole item yourself, to the bar of a principal engineer (AGENTS.md section 5). Note the concepts, internals and decisions worth teaching as you go: they feed the study guide in step 11.
6. **Tests first:** happy, sad, edge and abuser paths. Run them and confirm they fail for the right reason.
7. **Implement** the smallest change that passes, following docs/CODING_STANDARDS.md.
8. **Run `task check`** until it's green. Never weaken a test.
9. **Earlier bugs:** record them as `BP-xxx` in POINTER's FIX-FIRST QUEUE with evidence. Don't fix them here.
10. **Review:** run `/review` and fix the findings.
11. **Hand off:** run `/handoff`, then `/study-guide` (private: `docs/learning/` is never committed). Put a short decision brief for each notable decision in the PR body.
12. **Commit and open the PR**
    - Commit with Conventional Commits and no AI trailers.
    - `git push -u origin HEAD`.
    - `gh pr create` with the .github/pull_request_template.md sections filled, and no AI footer.
    - Never merge.
13. **Report in at most 8 lines:** what changed, test results, manual test (yes/no + exact steps), risks, the next item.
