#!/usr/bin/env node
// lint:gen: fails if the committed buf output is stale (ADR-0006). Generates into a temporary
// directory and compares it with the committed tree, so the working tree is never touched and an
// extra file left behind by a deleted proto is caught too.
// Usage: node scripts/check-gen.mjs

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareTrees } from "./lib/proto.mjs";

// Every `out` in buf.gen.yaml.
const OUTS = ["backend/gen/api", "packages/api/src/gen"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readTree(dir) {
  const files = new Map();
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    files.set(path.relative(dir, full).replaceAll("\\", "/"), readFileSync(full, "utf8"));
  }
  return files;
}

const tmp = mkdtempSync(path.join(tmpdir(), "earlii-gen-"));
try {
  const r = spawnSync("buf", ["generate", "-o", tmp], { cwd: root, encoding: "utf8" });
  if (r.error) {
    // buf isn't installed (or not on PATH): say how to fix it rather than printing "null".
    console.error(
      `lint:gen: could not run buf: ${r.error.message}; run "task setup" (mise install)`,
    );
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`lint:gen: buf generate failed:\n${r.stdout}${r.stderr}`);
    process.exit(1);
  }
  const problems = OUTS.flatMap((out) =>
    compareTrees(readTree(path.join(tmp, out)), readTree(path.join(root, out))).map(
      (p) => `${out}: ${p}`,
    ),
  );
  if (problems.length > 0) {
    for (const p of problems) console.error(`lint:gen: ${p}`);
    console.error("lint:gen: generated code is stale; run `task gen` and commit the result");
    process.exit(1);
  }
  console.log(`lint:gen: ok (${OUTS.join(", ")})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
