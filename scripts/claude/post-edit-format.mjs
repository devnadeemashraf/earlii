#!/usr/bin/env node
// Claude Code PostToolUse hook for Edit/Write: formats the touched file. Never blocks.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { projectDir, readHookInput, toRepoPath } from "../lib/hookio.mjs";
import { formatterFor } from "../lib/session.mjs";

try {
  const input = readHookInput();
  const root = projectDir(input);
  const filePath = input.tool_input?.file_path;
  if (filePath && existsSync(filePath)) {
    const rel = toRepoPath(root, filePath);
    const kind = rel.startsWith("../") ? null : formatterFor(rel);
    const biome = path.join(root, "node_modules", "@biomejs", "biome", "bin", "biome");

    if (kind === "biome" && existsSync(biome)) {
      spawnSync(process.execPath, [biome, "format", "--write", "--no-errors-on-unmatched", rel], {
        cwd: root,
        stdio: "ignore",
      });
    }
    if (kind === "go") {
      spawnSync("golangci-lint", ["fmt", path.basename(filePath)], {
        cwd: path.dirname(filePath),
        stdio: "ignore",
      });
    }
  }
} catch (err) {
  console.error(`post-edit-format: skipped: ${err.message}`);
}
