#!/usr/bin/env node
// Claude Code SessionStart hook: injects branch, working-tree state and docs/POINTER.md.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { currentBranch, git } from "../lib/git.mjs";
import { projectDir, readHookInput } from "../lib/hookio.mjs";
import { buildSessionContext } from "../lib/session.mjs";

const input = readHookInput();
const root = projectDir(input);
const pointerPath = path.join(root, "docs", "POINTER.md");

const context = buildSessionContext({
  pointer: existsSync(pointerPath) ? readFileSync(pointerPath, "utf8") : null,
  branch: currentBranch(root),
  status: git(["status", "--short"], { cwd: root }).stdout,
});

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
  }),
);
