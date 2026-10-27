#!/usr/bin/env node
// git commit-msg hook: Conventional Commits + no AI-attribution traces.
// Usage: node scripts/commit-msg.mjs <path-to-COMMIT_EDITMSG>

import { readFileSync } from "node:fs";
import { validateCommitMessage } from "./lib/conventional.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: commit-msg.mjs <message-file>");
  process.exit(2);
}

const { ok, errors } = validateCommitMessage(readFileSync(file, "utf8"));
if (!ok) {
  console.error("commit-msg: rejected");
  for (const e of errors) console.error(`  - ${e}`);
  console.error('  example: "feat(connectors): add Greenhouse board fetcher"');
  process.exit(1);
}
