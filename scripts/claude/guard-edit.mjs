#!/usr/bin/env node
// Claude Code PreToolUse hook for Edit/Write: blocks secrets, generated and vendored files,
// asks the human before SPEC or LICENSE edits, and rejects banned characters in new content.

import { evaluateEdit, evaluateEditContent } from "../lib/guards.mjs";
import { emitPreToolUse, projectDir, readHookInput, toRepoPath } from "../lib/hookio.mjs";

try {
  const input = readHookInput();
  const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (filePath) {
    const byPath = evaluateEdit(toRepoPath(projectDir(input), filePath));
    emitPreToolUse(byPath.decision === "allow" ? evaluateEditContent(input.tool_input) : byPath);
  }
} catch (err) {
  console.error(`guard-edit: internal error, not blocking: ${err.message}`);
}
