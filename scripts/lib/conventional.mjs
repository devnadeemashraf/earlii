// Conventional Commits validation plus a ban on AI-attribution traces.
// Used by the commit-msg git hook and by the Claude Code Bash guard.

import { findBannedChars } from "./banned.mjs";

export const TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

export const MAX_HEADER_LENGTH = 72;

const HEADER =
  /^(?<type>[a-z]+)(?:\((?<scope>[A-Za-z0-9][A-Za-z0-9._/-]*)\))?(?<breaking>!)?: (?<subject>\S.*)$/;
const PASSTHROUGH_HEADER = /^(Merge |Revert "|(fixup|squash|amend)! )/;
const SCISSORS = /^# -+ >8 -+$/m;

const AI_TRACE_PATTERNS = [
  /co-authored-by:.*\b(claude|anthropic|copilot|cursor|chatgpt|openai|gemini|codeium|devin|aider)\b/i,
  /co-authored-by:.*noreply@anthropic\.com/i,
  /generated (with|by) .*\b(claude|chatgpt|copilot|cursor|gemini|ai)\b/i,
  /^\s*claude-session:/im,
  /\u{1F916}/u,
];

/** Removes git comment lines and anything below the scissors line. */
export function stripComments(raw) {
  const cut = raw.split(SCISSORS)[0];
  return cut
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("#"))
    .join("\n");
}

/** Returns every line of `text` that carries an AI-attribution trace. */
export function findAiTraces(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => AI_TRACE_PATTERNS.some((pattern) => pattern.test(line)));
}

/** Validates a raw commit message. Returns { ok, errors }. */
export function validateCommitMessage(raw) {
  const errors = [];
  const message = stripComments(raw).trim();
  if (message === "") {
    return { ok: false, errors: ["commit message is empty"] };
  }

  const lines = message.split("\n");
  const header = lines[0];

  if (!PASSTHROUGH_HEADER.test(header)) {
    const match = HEADER.exec(header);
    if (!match) {
      errors.push(
        `header "${header}" is not a Conventional Commit: expected "<type>(<scope>)?: <subject>"`,
      );
    } else {
      const { type, subject } = match.groups;
      if (!TYPES.includes(type)) {
        errors.push(`type "${type}" is not one of: ${TYPES.join(", ")}`);
      }
      if (subject.endsWith(".")) {
        errors.push("subject must not end with a period");
      }
    }
    if (header.length > MAX_HEADER_LENGTH) {
      errors.push(`header is ${header.length} characters; the limit is ${MAX_HEADER_LENGTH}`);
    }
  }

  if (lines.length > 1 && lines[1].trim() !== "") {
    errors.push("leave a blank line between the header and the body");
  }

  for (const line of findAiTraces(message)) {
    errors.push(`AI-attribution trace is not allowed in this repo: "${line.trim()}"`);
  }

  for (const hit of findBannedChars(message)) {
    errors.push(`line ${hit.line}: "${hit.char}" (${hit.name}) is banned: ${hit.hint}`);
  }

  return { ok: errors.length === 0, errors };
}
