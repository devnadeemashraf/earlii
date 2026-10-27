---
name: story
description: Write an interview-ready decision story (problem, options, choice, skipped alternatives, measured result, soundbite) into docs/learning/STORIES.md and the PR body. Use for every notable technical decision in a PR, or when the user asks "why was this done this way".
argument-hint: "[short decision title]"
---

Append one entry to docs/learning/STORIES.md for `$ARGUMENTS`, using the template at the top of that file.

Rules:

- **Evidence only.**
  - Every number must come from a command committed in the repo (a benchmark, a test, a profile, a `task` target). Name the command and the before/after output.
  - If nothing was measured, write "Not measured, because …" and say how it could be measured. Never estimate silently. Never invent percentages.
- **Real options.** List 2–3 alternatives that were actually viable, each with its concrete trade-offs. Don't use straw men.
- **Context-specific "why".** Tie each reason to Earlii's constraints: free tiers, Windows dev box, solo maintainer, the latency budgets in SPEC §4, India market, DPDP.
- **Soundbite:** at most 3 lines, first person, in the shape "I found [X], so I did [Y] because [A, B, C]. I skipped [Z] because [...]. It improved [metric] by [M]%." (or "…which kept [metric] within budget").
- **Follow-ups:** 2–3 questions an interviewer would likely ask, each with a crisp answer.
- Link the PR, the ADR (if any) and the files.

Then copy a 5-line summary into the PR body under "Decision brief".
