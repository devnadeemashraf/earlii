#!/usr/bin/env node
// lint:migrations: the forward-only rules (ADR-0005), against main.
// Usage: node scripts/check-migrations.mjs [--base <ref>]   (default: origin/main, then main)

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { git, mergeBase, resolveRef, showFile } from "./lib/git.mjs";
import { checkMigrations } from "./lib/migrations.mjs";

const DIR = "backend/internal/postgres/migrations";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const head = new Map(
  readdirSync(path.join(root, DIR)).map((f) => [f, readFileSync(path.join(root, DIR, f), "utf8")]),
);

const argIndex = process.argv.indexOf("--base");
const requested = argIndex > -1 ? [process.argv[argIndex + 1]] : ["origin/main", "main"];
const ref = resolveRef(requested, root);
// The merge base, not main's tip: on a branch that is behind, migrations merged since
// would look deleted. CI checks the PR merge ref, so a version clash with a newer main
// still fails there; locally, rebase first.
const sha = ref && mergeBase(ref, root);
const base = new Map();
if (sha) {
  const listed = git(["ls-tree", "--name-only", `${sha}:${DIR}`], { cwd: root });
  for (const f of listed.ok ? listed.stdout.split(/\r?\n/).filter(Boolean) : []) {
    // Exact bytes: git() trims, which would make every file on main look edited (BP-002).
    const content = showFile(sha, `${DIR}/${f}`, root);
    if (content === null) {
      // Never guess: an unreadable file must not read as an edit (or as unchanged).
      console.error(`migrations: cannot read ${f} at ${sha}`);
      process.exit(2);
    }
    base.set(f, content);
  }
} else {
  console.log(`note: no base ref (${requested.join(", ")}); checking names and annotations only`);
}

const errors = checkMigrations({ base, head });
if (errors.length > 0) {
  for (const e of errors) console.error(`migrations: ${e}`);
  process.exit(1);
}
console.log(`migrations: ok (${head.size} files; ${base.size} on ${ref ?? "no base"})`);
