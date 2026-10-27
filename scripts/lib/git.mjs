// Thin wrappers over the git CLI.

import { spawnSync } from "node:child_process";

export function git(args, options = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  return { ok: result.status === 0, stdout: (result.stdout || "").trim(), stderr: result.stderr };
}

export function currentBranch(cwd) {
  const r = git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return r.ok ? r.stdout : "";
}

/** First of the candidate refs that exists, or null. */
export function resolveRef(candidates, cwd) {
  for (const ref of candidates) {
    if (git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd }).ok) return ref;
  }
  return null;
}

export function mergeBase(base, cwd) {
  const r = git(["merge-base", base, "HEAD"], { cwd });
  return r.ok ? r.stdout : null;
}

export function nameStatusSince(baseSha, cwd) {
  return git(["diff", "--name-status", "-M", baseSha, "HEAD"], { cwd }).stdout;
}

export function filesAt(sha, cwd) {
  const out = git(["ls-tree", "-r", "--name-only", sha], { cwd }).stdout;
  return new Set(out.split(/\r?\n/).filter(Boolean));
}
