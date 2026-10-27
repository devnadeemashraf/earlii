---
name: exercise
description: LEARN mode - create, hint, grade or skip a real-work exercise for the owner (stub + failing tests + exercise file), or run the mentor review of their attempt. Use when carving exercises out of a roadmap item, or when the user says "hint", "grade", "check my exercise" or "skip".
argument-hint: "[create <ID> | hint <ID-n> <1|2|3> | grade <ID-n> | skip <ID-n>]"
---

Follow docs/learning/exercises/README.md for the file format, and AGENTS.md section 5 for the rules.

**create `<ID>`**
1. From the item's real work, pick 1–2 pieces that teach a core, in-demand skill (see ROADMAP section Curriculum map). Avoid boilerplate and CRUD.
2. Rotate the exercise types: implement, bug hunt, optimise, test it, review it, design it, explain it. Check docs/learning/SKILLS.md for weak spots and what's due.
3. Write the stub at the exact file, function and signature, marked `// EXERCISE <ID>-<n>: <one line>`. The surrounding code must compile, and the full check must pass apart from the exercise's own tests, which are skipped until the owner starts.
4. Write the failing tests: happy, sad, edge and abuser paths.
5. Write `docs/learning/exercises/<ID>-<n>-<slug>.md`:
   - a concept brief (at most 15 lines);
   - the task;
   - the tests;
   - 3 hint levels, collapsed;
   - a stretch goal;
   - a timebox.
6. Update POINTER's Learning section.

**hint `<ID-n>` `<level>`:** reveal only that level.

**grade `<ID-n>`:** delegate to the `mentor` subagent. It runs the tests and `task check`, scores the 1–4 rubric with line references, and asks Socratic questions first. It shows a reference solution only after the second failed attempt or on request, and schedules a re-implementation from memory. Update SKILLS.md.

**skip `<ID-n>`:** complete it yourself to the same bar, log it as skipped in SKILLS.md and reschedule it.
