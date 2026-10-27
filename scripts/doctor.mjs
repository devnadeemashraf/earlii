#!/usr/bin/env node
// Checks every pinned tool against mise.toml and package.json.
// Usage: node scripts/doctor.mjs

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkTools, parseMiseTools, withoutDisabled } from "./lib/pins.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function exec(cmd, args) {
  const isWindows = process.platform === "win32";
  const result = isWindows
    ? spawnSync([cmd, ...args].join(" "), { encoding: "utf8", shell: true, cwd: root })
    : spawnSync(cmd, args, { encoding: "utf8", cwd: root });
  return { ok: result.status === 0, stdout: `${result.stdout || ""}${result.stderr || ""}` };
}

const tools = withoutDisabled(
  parseMiseTools(readFileSync(path.join(root, "mise.toml"), "utf8")),
  process.env.MISE_DISABLE_TOOLS,
);
const results = checkTools(tools, exec);

// Root devDependencies are pinned exactly; check what's actually installed in node_modules.
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
for (const [name, want] of Object.entries(pkg.devDependencies ?? {})) {
  const manifest = path.join(root, "node_modules", name, "package.json");
  const got = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")).version : "";
  results.push({ name, want, got, status: !got ? "missing" : got === want ? "ok" : "mismatch" });
}

let failed = false;
for (const r of results) {
  const mark = r.status === "ok" ? "ok  " : "FAIL";
  if (r.status !== "ok") failed = true;
  console.log(`${mark} ${r.name.padEnd(30)} want ${r.want.padEnd(10)} got ${r.got || "-"}`);
}

const warnings = [];
const hook = path.join(root, ".git", "hooks", "pre-commit");
if (!existsSync(hook) || !readFileSync(hook, "utf8").includes("lefthook")) {
  warnings.push("git hooks not installed: run `lefthook install`");
}
if (!exec("docker", ["--version"]).ok) {
  warnings.push("docker not found: needed from P0-04 (local Postgres)");
}
for (const w of warnings) console.log(`warn ${w}`);

if (failed) {
  console.error("\ndoctor: some tools are missing or off-pin.");
  console.error(
    "  Run `mise install` and `pnpm install`, and make sure mise is activated in your shell (docs/SETUP.md).",
  );
  process.exit(1);
}
console.log("\ndoctor: all pinned tools match");
