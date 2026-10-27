// Input/output helpers for Claude Code hooks (JSON on stdin, JSON on stdout).

import { readFileSync } from "node:fs";
import path from "node:path";

export function readHookInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return {};
  }
}

export function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

/** Path of `filePath` relative to the project root, with forward slashes. */
export function toRepoPath(root, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  return path.relative(root, abs).replace(/\\/g, "/");
}

/** Emits a PreToolUse decision. "allow" emits nothing so normal permissions apply. */
export function emitPreToolUse({ decision, reason }) {
  if (decision === "allow") return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}
