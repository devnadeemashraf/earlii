#!/usr/bin/env node
// lint:proto (part 2): buf breaking against main (ADR-0006). Published fields are never removed,
// renumbered or retyped: add new ones and deprecate old ones.
// Usage: node scripts/check-proto-breaking.mjs [--base <ref>]   (default: origin/main, then main)

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { git, mergeBase, resolveRef } from "./lib/git.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argIndex = process.argv.indexOf("--base");
const requested = argIndex > -1 ? [process.argv[argIndex + 1]] : ["origin/main", "main"];
const ref = resolveRef(requested, root);
// The merge base, not main's tip: on a branch that is behind, fields added on main since would
// look removed. CI checks the PR merge ref, so a clash with a newer main still fails there.
const sha = ref && mergeBase(ref, root);
if (!sha) {
  console.log(`skip: no base ref (${requested.join(", ")}) to compare contracts with`);
  process.exit(0);
}
if (!git(["cat-file", "-e", `${sha}:buf.yaml`], { cwd: root }).ok) {
  console.log(`skip: ${ref} has no buf.yaml yet, so there is no published contract to break`);
  process.exit(0);
}

const r = spawnSync("buf", ["breaking", "--against", `.git#ref=${sha}`], {
  cwd: root,
  stdio: "inherit",
});
if (r.status !== 0) {
  console.error(`lint:proto: breaking change against ${ref} (${sha.slice(0, 12)})`);
  process.exit(1);
}
console.log(`lint:proto: no breaking changes against ${ref} (${sha.slice(0, 12)})`);
