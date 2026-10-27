// Covers the pre-push and session helpers, then runs the CLI entry points end to end.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { protectedRefsTouched } from "../lib/prepush.mjs";
import { buildSessionContext, formatterFor, MAX_CONTEXT_CHARS } from "../lib/session.mjs";

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (script, args = [], input = "", env = {}) =>
  spawnSync(process.execPath, [path.join(scripts, script), ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

const ZERO = "0000000000000000000000000000000000000000";
const SHA = "1111111111111111111111111111111111111111";

describe("protectedRefsTouched", () => {
  it("flags updates and deletions of main", () => {
    const stdin = `refs/heads/feat/x ${SHA} refs/heads/main ${ZERO}\n(delete) ${ZERO} refs/heads/master ${SHA}\n`;
    assert.deepEqual(protectedRefsTouched(stdin), ["refs/heads/main", "refs/heads/master"]);
  });
  it("allows feature branches and empty input", () => {
    assert.deepEqual(protectedRefsTouched(`refs/heads/x ${SHA} refs/heads/x ${ZERO}`), []);
    assert.deepEqual(protectedRefsTouched(""), []);
  });
  it("does not confuse branches that merely contain 'main'", () => {
    assert.deepEqual(protectedRefsTouched(`a ${SHA} refs/heads/main-fix ${ZERO}`), []);
  });
});

describe("buildSessionContext", () => {
  it("includes branch, status and pointer", () => {
    const text = buildSessionContext({ pointer: "# POINTER", branch: "feat/x", status: " M a.go" });
    assert.match(text, /branch: feat\/x/);
    assert.match(text, /M a\.go/);
    assert.match(text, /# POINTER/);
  });
  it("handles a missing pointer and a clean tree", () => {
    const text = buildSessionContext({ pointer: null, branch: "main", status: "" });
    assert.match(text, /clean/);
    assert.match(text, /missing/);
  });
  it("truncates oversized context", () => {
    const text = buildSessionContext({ pointer: "x".repeat(20000), branch: "b", status: "" });
    assert.ok(text.length < MAX_CONTEXT_CHARS + 100);
    assert.match(text, /truncated/);
  });
});

describe("formatterFor", () => {
  it("routes files to the right formatter", () => {
    assert.equal(formatterFor("backend/cmd/earlii/main.go"), "go");
    assert.equal(formatterFor("apps/web/src/App.tsx"), "biome");
    assert.equal(formatterFor(".claude/settings.json"), "biome");
    assert.equal(formatterFor("docs/POINTER.md"), null);
    assert.equal(formatterFor("backend/gen/x.pb.go"), null);
    assert.equal(formatterFor("node_modules/x/y.js"), null);
  });
});

const dir = mkdtempSync(path.join(tmpdir(), "earlii-"));

describe("CLI: commit-msg", () => {
  const msgFile = (text) => {
    const f = path.join(dir, `msg-${Math.random()}`);
    writeFileSync(f, text);
    return f;
  };
  it("exits 0 for a valid message", () => {
    assert.equal(run("commit-msg.mjs", [msgFile("docs: update pointer\n")]).status, 0);
  });
  it("exits 1 with reasons for an invalid message", () => {
    const r = run("commit-msg.mjs", [msgFile("updated stuff\n")]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Conventional Commit/);
  });
  it("exits 2 without arguments", () => {
    assert.equal(run("commit-msg.mjs").status, 2);
  });
});

describe("CLI: pre-push-guard", () => {
  it("refuses a push to main", () => {
    const r = run("pre-push-guard.mjs", [], `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`, {
      EARLII_ALLOW_MAIN_PUSH: "",
    });
    assert.equal(r.status, 1);
  });
  it("allows a feature branch", () => {
    assert.equal(
      run("pre-push-guard.mjs", [], `refs/heads/x ${SHA} refs/heads/x ${ZERO}\n`).status,
      0,
    );
  });
  it("honours the human escape hatch", () => {
    const r = run("pre-push-guard.mjs", [], `a ${SHA} refs/heads/main ${ZERO}\n`, {
      EARLII_ALLOW_MAIN_PUSH: "1",
    });
    assert.equal(r.status, 0);
  });
});

describe("CLI: Claude hooks", () => {
  const hookJson = (obj) => JSON.stringify(obj);
  it("guard-edit denies a secret file with a PreToolUse decision", () => {
    const r = run(
      "claude/guard-edit.mjs",
      [],
      hookJson({ cwd: dir, tool_input: { file_path: path.join(dir, ".env") } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  });
  it("guard-edit stays silent for a normal file", () => {
    const r = run(
      "claude/guard-edit.mjs",
      [],
      hookJson({ tool_input: { file_path: path.join(dir, "a.go") } }),
      { CLAUDE_PROJECT_DIR: dir },
    );
    assert.equal(r.stdout, "");
  });
  it("guard-bash denies force-push and survives malformed input", () => {
    const r = run(
      "claude/guard-bash.mjs",
      [],
      hookJson({ tool_input: { command: "git push -f" } }),
    );
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.equal(run("claude/guard-bash.mjs", [], "not json").status, 0);
  });
  it("session-start emits additionalContext", () => {
    const r = run("claude/session-start.mjs", [], "{}");
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(out.hookSpecificOutput.additionalContext, /branch/);
  });
});
