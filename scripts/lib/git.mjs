// Thin wrappers over the git CLI.

import { spawnSync } from "node:child_process";

export function git(args, options = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  return { ok: result.status === 0, stdout: (result.stdout || "").trim(), stderr: result.stderr };
}

/**
 * A file's exact content at a commit (not trimmed, unlike git()), or null if git can't show it.
 * The buffer is far above spawnSync's 1 MiB default, so a large file never reads as missing.
 */
export function showFile(sha, file, cwd) {
  const r = spawnSync("git", ["show", `${sha}:${file}`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 && !r.error ? r.stdout : null;
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
