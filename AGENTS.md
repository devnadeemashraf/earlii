# AGENTS.md: instructions for every AI coding agent

This is the **single source of agent instructions** for Earlii. Tool-specific files (`CLAUDE.md`, and any future `.cursor/rules` or `.github/copilot-instructions.md`) only import or point here.

## 1. Session read order

1. `docs/POINTER.md`: the FIX-FIRST QUEUE first, otherwise NEXT UP. (Claude Code injects it at session start.)
2. This file.
3. The roadmap entry in `docs/ROADMAP.md`, and the `docs/SPEC.md` sections it cites.
4. The relevant `docs/HANDBOOK.md` sections. Read its repo map before opening files.
5. `docs/CODING_STANDARDS.md` for the languages you will touch.

**Sources of truth, in order:** SPEC > ROADMAP > POINTER > HANDBOOK. If they disagree, the higher one wins. Raise the conflict in POINTER's "Open questions for the human".

## 2. Non-negotiable rules

1. **Never break the Spec guardrails** (SPEC §7): no LinkedIn/Naukri scraping; no auto-sending, auto-applying or messaging; no recruiter-contact database; no claim about a user that their resume doesn't support; no selling user data; no resumes or drafts sent to a free LLM tier.
2. **No AI attribution, anywhere.** No `Co-Authored-By` AI trailers, no "Generated with …" footers, no "written by AI" comments. The owner owns all IP (proprietary `LICENSE`).
3. **Verify, don't recall** (table below). Never invent an API, flag, version or limit. When unsure, mark it `UNVERIFIED` and say how to check.
4. **Small PRs.** One roadmap item per PR, about 1–4 sessions. Anything bigger is an epic: split it in a docs-only grooming PR.
5. **Tests first.** Cover the happy, sad, edge and abuser paths. Never weaken a test to make it pass.
6. **Everything runs.** `task check` is green before every push. Tasks for code that doesn't exist yet print `skip: <reason>` and succeed.
7. **Decisions are explicit.** Lasting choices get an ADR in `docs/adr/`. Spec changes are a _Spec change proposal_ (what it replaces, cost, risk) in ROADMAP that the owner approves.
8. **Public postings only go to the LLM** until a paid, no-training tier is in place, recorded in VERSIONS.
9. **Privacy and legal flags** (DPDP Act, licences, terms of service, money) go into `docs/LEGAL.md` with a note when a professional is needed. Don't present them as legal advice.

## 3. Verify, don't recall

| What                       | Where to check (in this order)                                                                    |
| :------------------------- | :------------------------------------------------------------------------------------------------ |
| Tool versions              | `mise.toml` → `docs/VERSIONS.md` → `mise latest <tool>`                                           |
| Go module APIs             | `go doc <pkg>.<Symbol>` at the pinned version → the gopls MCP → pkg.go.dev for that exact version |
| TS package APIs            | `node_modules/<pkg>/**/*.d.ts` → the package's docs for the installed version                     |
| Protobuf / Connect         | `proto/` + `buf.yaml` → connectrpc.com docs → the buf.build docs                                  |
| SQL / Postgres             | the migrations in the repo → postgresql.org docs for the pinned major                             |
| River                      | `go doc github.com/riverqueue/river` → riverqueue.com docs                                        |
| CLI flags                  | `<tool> --help` locally, never memory                                                             |
| Prices, free tiers, limits | the vendor's pricing page, dated in `docs/VERSIONS.md`                                            |
| Licences, terms, law       | the primary source, dated in `docs/LEGAL.md` and marked "not legal advice"                        |
| Job-board APIs             | the provider's official API docs plus their terms, recorded before writing a connector            |

Every new fact goes into `docs/VERSIONS.md` with the date and a source link.

## 4. THE PR LOOP (every session follows it)

1. **Orient.** Read POINTER (fix-first queue first, otherwise NEXT UP), then this file, the roadmap entry and the spec sections it cites, and the relevant HANDBOOK sections. Read the repo map before opening files.
2. **Versions.** Use the pinned versions. When stuck, read the official docs for that exact version.
3. **Branch** from an up-to-date main: `git switch main && git pull --ff-only && git switch -c <type>/<ID>-<slug>`.
4. **Design, in proportion to the item.** For M items, or anything touching the data model, security, concurrency or hot paths:
   - compare 2–3 approaches (the architect and red-team subagents);
   - pick one;
   - write an ADR if the choice will last.
5. **Tests first:** happy, sad, edge and abuser paths. Run them and watch them fail.
6. **Implement the smallest change that passes**, following CODING_STANDARDS.
7. **Run `task check`** and fix until it's green. Never weaken a test.
8. **Bugs from earlier PRs: don't widen scope.** Add a `BP-xxx` entry with evidence (file:line or a failing test) to POINTER's fix-first queue. The next session fixes it as a side-blueprint PR.
9. **Self-review** with the reviewer subagent (`/review`) and fix what it finds.
10. **Hand off** (`/handoff`). Update POINTER, the ROADMAP status and HANDBOOK, plus VERSIONS and ADRs if touched. In LEARN mode, also write the decision story (`/story`) and update `docs/learning/SKILLS.md`.
11. **Commit** (Conventional Commits, no AI trailers), **push** the branch, and **open the PR** with the template. Never merge: the owner merges.
12. **Report in at most 8 lines:** what changed; test results; manual test needed (yes/no, with exact steps); risks; the next item.

## 5. LEARN mode (active: standard, 1–2 exercises per PR)

The owner is strong in TypeScript/React and new to Go. The goal is a shipped product **and** an engineer who can explain every decision in an interview.

- **Exercises (1–2 per PR)** are carved out of the real work, never toy problems. Prefer skills that are core to _this_ project and in demand beyond CRUD: Go concurrency and cancellation, rate limiting and backoff, idempotency and exactly-once delivery, job queues, change detection and hashing, near-duplicate detection, Postgres indexing and query plans, search, streaming, observability, LLM evals, security. Write the stub marked `EXERCISE <ID>-<n>` with failing tests, and the exercise file `docs/learning/exercises/<ID>-<n>-<slug>.md` (format in `docs/learning/exercises/README.md`).
- **Everything else** (scaffolding, glue, config) the AI builds, but every notable decision gets a **decision story** in `docs/learning/STORIES.md` and the PR body:
  - **Problem / bottleneck:** what was slow, risky or unclear, with evidence.
  - **Options:** 2–3, each with its trade-offs.
  - **Chose [Y] because [A, B, C]; skipped [Z] because [A, B, C].**
  - **Result:** a measured number (benchmark, test, profile) from a committed command, or "not measured, because …". **Never invent numbers.**
  - **Interview soundbite** (at most 3 lines): "I found [X], so I did [Y] because [A, B, C]. I skipped [Z] because […]. It improved [metric] by [M]%."
- **Review (mentor subagent):** run the tests and `task check` first, then score with the 1–4 rubric (correctness, complexity with the actual Big-O, tests, readability, performance, security, idiomatic use). Socratic first. Show a reference solution only after the second failed attempt, or on request.
- **"skip"** means the AI completes the exercise, logs it as skipped in SKILLS.md and reschedules it.
- **Mode switches** ("mode: build", "mode: learn intense") are recorded in POINTER.

## 6. Commands

| Command        | What it does                                                                               |
| :------------- | :----------------------------------------------------------------------------------------- |
| `task setup`   | Install pinned tools (mise), dependencies (pnpm) and git hooks (lefthook), then run doctor |
| `task doctor`  | Check every tool against the pins in `mise.toml`                                           |
| `task check`   | Everything CI runs: format check, lint, tests                                              |
| `task fmt`     | Format everything                                                                          |
| `task lint`    | All linters (TS, Go, workflows, secrets)                                                   |
| `task test`    | All tests (`test:scripts`, `test:go`, `test:web`)                                          |
| `task handoff` | Run the POINTER/HANDBOOK handoff rule against `origin/main`                                |

## 7. Never

- Commit to `main`, push to `main`, force-push, or use `--no-verify`.
- Merge a PR, or approve your own.
- Edit generated files (`gen/`, `*.pb.go`, `*_pb.ts`, `*.gen.ts`, lockfiles) or vendored code (`node_modules/`, `vendor/`).
- Read or write secrets (`.env*` except `.env.example`, keys, `secrets/`).
- Edit `docs/SPEC.md` or `LICENSE` without the owner's explicit approval.
- Weaken, skip or delete a test to make it pass.
- Leave a `TODO` without a roadmap or bug ID: `// TODO(P1-07): …` or `// TODO(BP-003): …`.
- Add AI attribution of any kind.
- Make network calls to job boards in tests: use recorded fixtures.

## 8. Checklists for tools without hooks

If your tool can't run the hooks in `.claude/settings.json`, do these by hand:

- **Session start:** read `docs/POINTER.md` and run `git status`.
- **Before each edit:** check the target isn't a secret, a generated or vendored file, SPEC or LICENSE.
- **After each edit:** `task fmt`.
- **Before committing:** confirm you're not on `main`, then run `task check`.
- **Before opening a PR:** confirm `docs/POINTER.md` changed (`task handoff`) and the body has no AI footer.
