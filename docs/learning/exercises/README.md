# Exercises

Each exercise is carved from real roadmap work and lives at `docs/learning/exercises/<ID>-<n>-<slug>.md`. Its code stub is marked `EXERCISE <ID>-<n>` in the source.

## File format

```markdown
# <ID>-<n> · <title>  (<type>, timebox <h>)

## Concept brief (at most 15 lines)
What it is, why it matters right here in Earlii, and one small example that isn't the solution.

## Task
- File / function / signature:
- Inputs → outputs:
- Constraints:
- Target complexity or budget:

## Tests
Which tests exist (and fail now), and how to run them: `go test ./backend/internal/x -run TestY`.
(For a *test it* exercise: what the owner must cover; grading by mutation score or seeded bugs.)

## Hints (reveal only when asked: `/exercise hint <ID-n> <level>`)
<details><summary>Level 1 · nudge</summary>…</details>
<details><summary>Level 2 · approach</summary>…</details>
<details><summary>Level 3 · near-pseudocode</summary>…</details>

## Stretch goal

## Interview angle
How to tell this as a story: the problem, the options, and why this solution.
```

## Types (rotate through them)

| Type | What happens |
| :-- | :-- |
| Implement | The owner writes the function behind a stub, against failing tests |
| Bug hunt | On a practice branch, the AI plants 1–3 realistic bugs and gives only the symptom. The owner finds and fixes them and adds regression tests |
| Optimise | The AI ships a correct but slow version with a benchmark and a budget. The owner profiles, explains the bottleneck and beats the budget |
| Test it | The AI provides working code. The owner writes the suite, graded by mutation testing or seeded bugs |
| Review it | The AI opens a PR with seeded issues. The owner reviews it and is scored on what they found and missed |
| Design it | The owner writes a short ADR before an M item. The AI critiques it against the alternatives |
| Explain it | The owner explains code or a decision in at most 10 lines. The AI asks 2–3 follow-ups |

## Workflow

1. The AI creates the exercise (`/exercise create <ID>`) inside the item's PR. The stub compiles, and the exercise's tests are skipped until the owner starts.
2. The owner works on it, on the same branch or a practice branch.
3. `/exercise grade <ID-n>`: the mentor runs the tests and `task check`, scores the rubric, and asks Socratic questions first.
4. It merges only at the same bar as AI code. `skip` makes the AI finish it, log it as skipped and reschedule it.
