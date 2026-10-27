// End to end: the lint:migrations CLI against a real git history (BP-002). The pure rules are
// covered in migrations.test.mjs; this covers reading main's files out of git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = "backend/internal/postgres/migrations";

function sh(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

describe("check-migrations CLI", () => {
  let repo;

  before(() => {
    repo = mkdtempSync(path.join(tmpdir(), "earlii-migrations-"));
    cpSync(
      path.join(scripts, "check-migrations.mjs"),
      path.join(repo, "scripts/check-migrations.mjs"),
    );
    cpSync(path.join(scripts, "lib"), path.join(repo, "scripts/lib"), { recursive: true });
    mkdirSync(path.join(repo, DIR), { recursive: true });
    // Every real migration ends with a newline, as editors and formatters write them.
    writeFileSync(path.join(repo, DIR, "00001_baseline.sql"), "-- +goose Up\nSELECT 1;\n");
    sh(repo, "git", ["init", "-q", "-b", "main"]);
    sh(repo, "git", ["add", "."]);
    sh(repo, "git", [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "core.autocrlf=false",
      // A machine that signs commits or has global hooks must not change the test.
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=",
      "commit",
      "-q",
      "-m",
      "base",
    ]);
  });

  after(() => rmSync(repo, { recursive: true, force: true }));

  function run() {
    return spawnSync(process.execPath, ["scripts/check-migrations.mjs", "--base", "main"], {
      cwd: repo,
      encoding: "utf8",
    });
  }

  it("happy: an unchanged migration that is already on main passes", () => {
    const r = run();
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /1 on main/);
  });

  it("sad: editing a migration that is on main fails", () => {
    const file = path.join(repo, DIR, "00001_baseline.sql");
    writeFileSync(file, "-- +goose Up\nSELECT 2;\n");
    try {
      const r = run();
      assert.equal(r.status, 1);
      assert.match(r.stderr, /00001_baseline\.sql: changed after merge/);
    } finally {
      writeFileSync(file, "-- +goose Up\nSELECT 1;\n");
    }
  });

  it("edge: a new migration above main's highest passes", () => {
    const file = path.join(repo, DIR, "00002_companies.sql");
    writeFileSync(file, "-- +goose Up\nCREATE TABLE companies (id bigint);\n");
    try {
      const r = run();
      assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    } finally {
      rmSync(file);
    }
  });

  it("abuser: deleting a migration that is on main fails", () => {
    const file = path.join(repo, DIR, "00001_baseline.sql");
    rmSync(file);
    try {
      const r = run();
      assert.equal(r.status, 1);
      assert.match(r.stderr, /00001_baseline\.sql/);
    } finally {
      writeFileSync(file, "-- +goose Up\nSELECT 1;\n");
    }
  });
});
