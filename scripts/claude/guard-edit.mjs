#!/usr/bin/env node
// Claude Code PreToolUse hook for Edit/Write: blocks secrets, generated and vendored files,
// and asks the human before SPEC or LICENSE edits.

import { evaluateEdit } from "../lib/guards.mjs";
import { emitPreToolUse, projectDir, readHookInput, toRepoPath } from "../lib/hookio.mjs";

try {
  const input = readHookInput();
  const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (filePath) {
    emitPreToolUse(evaluateEdit(toRepoPath(projectDir(input), filePath)));
  }
} catch (err) {
  console.error(`guard-edit: internal error, not blocking: ${err.message}`);
}
