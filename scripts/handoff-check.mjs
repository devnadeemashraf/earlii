#!/usr/bin/env node
// Handoff check: code changed => POINTER changed; new module => HANDBOOK changed.
// Usage: node scripts/handoff-check.mjs [--base <ref>]   (default: origin/main, then main)

import { currentBranch, filesAt, mergeBase, nameStatusSince, resolveRef } from "./lib/git.mjs";
import { checkHandoff, parseNameStatus } from "./lib/handoff.mjs";

const argIndex = process.argv.indexOf("--base");
const requested = argIndex > -1 ? [process.argv[argIndex + 1]] : ["origin/main", "main"];

const branch = currentBranch();
if (branch === "main" || branch === "master") {
  console.log("skip: handoff check runs on feature branches only");
  process.exit(0);
}

const base = resolveRef(requested);
if (!base) {
  console.log(`skip: base ref not found (${requested.join(", ")})`);
  process.exit(0);
}
const baseSha = mergeBase(base);
if (!baseSha) {
  console.error(`handoff: no merge base between ${base} and HEAD`);
  process.exit(1);
}

const changes = parseNameStatus(nameStatusSince(baseSha));
if (changes.length === 0) {
  console.log(`skip: no changes since ${base}`);
  process.exit(0);
}

const result = checkHandoff({ changes, baseFiles: filesAt(baseSha) });
for (const w of result.warnings) console.log(`warn: ${w}`);
if (!result.ok) {
  for (const e of result.errors) console.error(`handoff: ${e}`);
  process.exit(1);
}
console.log(`handoff: ok (${changes.length} changed files since ${base})`);
