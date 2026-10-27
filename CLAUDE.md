@AGENTS.md

## Claude Code specifics

AGENTS.md above is the single source of agent instructions. This file only maps it onto Claude Code.

- **Hooks** (`.claude/settings.json`, logic in `scripts/claude/`): POINTER is injected at session start; edits to secrets, generated and vendored files are blocked; SPEC and LICENSE edits ask the human; commits/pushes to main, force-push, `--no-verify`, merging and PR creation without a POINTER update are blocked; touched files are auto-formatted.
- **Attribution is off** (`attribution` in settings). Never add AI co-author trailers, "generated with" footers or AI comments anywhere. The commit-msg hook rejects them.
- **No section sign (U+00A7), ever.** The edit guard denies any write that contains it.
- **Skills:** `/next-pr` (the PR loop), `/handoff`, `/review`, `/study-guide`, `/api-lookup`, `/snapshot`, `/perf-check`.
- **Subagents:** `architect`, `red-team`, `reviewer`, `mentor`.
- **MCP** (`.mcp.json`): `gopls` (Go symbols, references, diagnostics), `playwright` (browser snapshots), `context7` (optional docs lookup, needs `CONTEXT7_API_KEY`).
