#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash/PowerShell: enforces the git/gh rules in AGENTS.md.

import { currentBranch, git, mergeBase, resolveRef } from "../lib/git.mjs";
import { evaluateBash, POINTER_PATH } from "../lib/guards.mjs";
import { emitPreToolUse, projectDir, readHookInput } from "../lib/hookio.mjs";

try {
  const input = readHookInput();
  const command = input.tool_input?.command ?? "";
  const cwd = input.cwd || projectDir(input);

  const pointerChanged = () => {
    const base = resolveRef(["origin/main", "main"], cwd);
    const sha = base && mergeBase(base, cwd);
    if (!sha) return false;
    const diff = git(["diff", "--name-only", sha, "HEAD"], { cwd });
    return diff.stdout.split(/\r?\n/).includes(POINTER_PATH);
  };

  emitPreToolUse(evaluateBash(command, { branch: currentBranch(cwd), pointerChanged }));
} catch (err) {
  console.error(`guard-bash: internal error, not blocking: ${err.message}`);
}
