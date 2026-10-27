import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { compareTrees } from "../lib/proto.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tree = (obj) => new Map(Object.entries(obj));

describe("compareTrees (lint:gen: committed output vs a fresh buf generate)", () => {
  it("happy: identical trees have no differences", () => {
    const t = tree({ "a/x.pb.go": "package x\n", "b_pb.ts": "export {};\n" });
    assert.deepEqual(compareTrees(t, new Map(t)), []);
  });

  it("edge: line endings alone are not a difference (Windows checkouts)", () => {
    assert.deepEqual(compareTrees(tree({ f: "a\nb\n" }), tree({ f: "a\r\nb\r\n" })), []);
  });

  it("sad: a changed, a missing and a stale extra file are each reported", () => {
    const fresh = tree({ changed: "new\n", missing: "x\n", same: "s\n" });
    const committed = tree({ changed: "old\n", stale: "y\n", same: "s\n" });
    assert.deepEqual(compareTrees(fresh, committed), [
      "changed: changed",
      "missing: missing",
      "stale: stale",
    ]);
  });

  it("edge: two empty trees are equal", () => {
    assert.deepEqual(compareTrees(new Map(), new Map()), []);
  });
});

// The acceptance check for P0-05: buf breaking must fail a PR that removes a field. Run against a
// copy of the real contracts, so the rule set in buf.yaml is what's being proved.
describe("buf breaking (FILE rules in buf.yaml)", () => {
  const dirs = [];
  after(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function copyWith(edit) {
    const dir = mkdtempSync(path.join(tmpdir(), "earlii-proto-"));
    dirs.push(dir);
    cpSync(path.join(root, "proto"), path.join(dir, "proto"), { recursive: true });
    cpSync(path.join(root, "buf.yaml"), path.join(dir, "buf.yaml"));
    const file = path.join(dir, "proto/earlii/v1/health.proto");
    writeFileSync(file, edit(readFileSync(file, "utf8")));
    return dir;
  }

  function breaking(dir) {
    // Against the repo's own proto/ as the "main" side.
    return spawnSync("buf", ["breaking", dir, "--against", root], {
      encoding: "utf8",
    });
  }

  it("sad: removing a field fails", () => {
    const dir = copyWith((s) => s.replace(/^\s*bool ok = 2;\s*$/m, ""));
    const r = breaking(dir);
    assert.notEqual(r.status, 0, `buf breaking passed a removed field:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout + r.stderr, /"ok".*deleted/);
  });

  it("sad: renumbering a field fails", () => {
    const dir = copyWith((s) => s.replace("bool ok = 2;", "bool ok = 3;"));
    assert.notEqual(breaking(dir).status, 0);
  });

  it("end to end: check-proto-breaking skips, passes and fails against a real git base", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "earlii-breaking-"));
    dirs.push(repo);
    const git = (...args) => {
      const r = spawnSync(
        "git",
        [
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.com",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "core.hooksPath=",
          ...args,
        ],
        { cwd: repo, encoding: "utf8" },
      );
      assert.equal(r.status, 0, r.stderr);
    };
    const script = () =>
      spawnSync(process.execPath, ["scripts/check-proto-breaking.mjs", "--base", "main"], {
        cwd: repo,
        encoding: "utf8",
      });
    cpSync(
      path.join(root, "scripts/check-proto-breaking.mjs"),
      path.join(repo, "scripts/check-proto-breaking.mjs"),
    );
    cpSync(path.join(root, "scripts/lib"), path.join(repo, "scripts/lib"), { recursive: true });
    git("init", "-q", "-b", "main");
    git("add", ".");
    git("commit", "-q", "-m", "no contracts yet");

    // Main has no buf.yaml: nothing published, nothing to break.
    let r = script();
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^skip: /);

    cpSync(path.join(root, "proto"), path.join(repo, "proto"), { recursive: true });
    cpSync(path.join(root, "buf.yaml"), path.join(repo, "buf.yaml"));
    git("add", ".");
    git("commit", "-q", "-m", "contracts");

    r = script();
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /no breaking changes/);

    const file = path.join(repo, "proto/earlii/v1/health.proto");
    writeFileSync(file, readFileSync(file, "utf8").replace(/^\s*bool ok = 2;\s*$/m, ""));
    r = script();
    assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /breaking change against main/);
  });

  it("happy: adding a field passes", () => {
    const dir = copyWith((s) => s.replace("bool ok = 2;", "bool ok = 2;\n  string detail = 3;"));
    const r = breaking(dir);
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  });
});
