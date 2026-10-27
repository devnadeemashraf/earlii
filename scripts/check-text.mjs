#!/usr/bin/env node
// Fails if any tracked text file (or the files given as arguments) contains a banned character.
// Usage: node scripts/check-text.mjs [files...]   (no args: every file tracked by git)

import { readFileSync } from "node:fs";
import { findBannedChars } from "./lib/banned.mjs";
import { git } from "./lib/git.mjs";

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz)$/i;

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : git(["ls-files"]).stdout.split(/\r?\n/).filter(Boolean);

let failures = 0;
for (const file of files.filter((f) => !BINARY.test(f))) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const hit of findBannedChars(text)) {
    failures++;
    console.error(`${file}:${hit.line}:${hit.column}  "${hit.char}" (${hit.name}): ${hit.hint}`);
  }
}

if (failures > 0) {
  console.error(`check-text: ${failures} banned character(s) found`);
  process.exit(1);
}
console.log(`check-text: ok (${files.length} files)`);
