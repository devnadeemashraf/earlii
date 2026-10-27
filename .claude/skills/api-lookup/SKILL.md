---
name: api-lookup
description: Look up the real signature of a Go, TypeScript, Protobuf or CLI API at the pinned version from local sources (go doc, gopls MCP, node_modules .d.ts, --help) instead of guessing. Use whenever you are about to call an API you have not verified in this session.
argument-hint: "<package or symbol, e.g. github.com/riverqueue/river.Client.Insert | @tanstack/react-query useQuery | buf breaking>"
---

Find the exact, version-pinned signature for `$ARGUMENTS`. Never answer from memory.

**Go**
1. Run `go doc -all <import/path>` or `go doc <import/path>.<Symbol>` from the module that depends on it. This resolves the version in `go.mod`.
2. For references, implementations or call sites, use the `gopls` MCP tools.
3. If the module isn't a dependency yet, check the version first (`go list -m -versions <path>`), then read pkg.go.dev for that exact version. Add the version to docs/VERSIONS.md before using it.

**TypeScript**
1. Find the installed version: `pnpm why <pkg>`, or read `node_modules/<pkg>/package.json`.
2. Read the type declarations: search `node_modules/<pkg>` for `*.d.ts` with Grep, filtering on the symbol name.
3. If the types are unclear, read the docs for that version, or ask context7 (if configured) with the version in the query.

**Protobuf / Connect:** read `proto/**/*.proto` and `buf.yaml`, then `buf --help` and `buf <cmd> --help`.

**CLIs:** run `<tool> --help` or `<tool> <subcommand> --help` at the pinned version (`mise.toml`).

**Output:** the signature, the version it was read from, and the source (command or file path). If it can't be verified, say `UNVERIFIED` and say how to check.
