import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { bannedCharMessage, findBannedChars } from "../lib/banned.mjs";
import { validateCommitMessage } from "../lib/conventional.mjs";
import { evaluateBash, evaluateEditContent } from "../lib/guards.mjs";

const SECTION = String.fromCodePoint(0xa7);
const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("findBannedChars", () => {
  it("finds every occurrence with line and column", () => {
    const hits = findBannedChars(`ok\nsee ${SECTION}4 and ${SECTION}A2\r\nfine`);
    assert.deepEqual(
      hits.map((h) => [h.line, h.column]),
      [
        [2, 5],
        [2, 12],
      ],
    );
  });
  it("returns nothing for clean text, including look-alike words", () => {
    assert.deepEqual(findBannedChars("SPEC section 4, SPEC A2, paragraph"), []);
    assert.equal(bannedCharMessage("clean"), null);
  });
  it("describes the first hit", () => {
    assert.match(bannedCharMessage(`x ${SECTION}1`), /section sign/);
  });
});

describe("banned characters are enforced at every layer", () => {
  it("commit-msg rejects them", () => {
    const r = validateCommitMessage(`docs: update SPEC ${SECTION}3 wording`);
    assert.equal(r.ok, false);
    assert.match(r.errors.join(), /section sign/);
  });

  it("the Bash guard rejects them in PR titles and bodies", () => {
    const ctx = { branch: "feat/x", pointerChanged: () => true };
    assert.equal(
      evaluateBash(`gh pr create --title x --body "see ${SECTION}4"`, ctx).decision,
      "deny",
    );
    assert.equal(evaluateBash(`gh pr edit 1 --body "${SECTION}4"`, ctx).decision, "deny");
    assert.equal(evaluateBash(`git commit -m "docs: ${SECTION}4"`, ctx).decision, "deny");
    assert.equal(evaluateBash(`grep -r "${SECTION}" docs`, ctx).decision, "allow");
  });

  it("the edit guard rejects them in new content", () => {
    assert.equal(evaluateEditContent({ content: `# ${SECTION}1` }).decision, "deny");
    assert.equal(evaluateEditContent({ new_string: `${SECTION}2` }).decision, "deny");
    assert.equal(
      evaluateEditContent({ edits: [{ new_string: "ok" }, { new_string: SECTION }] }).decision,
      "deny",
    );
    assert.equal(
      evaluateEditContent({ new_string: "section 2", old_string: SECTION }).decision,
      "allow",
    );
    assert.equal(evaluateEditContent({}).decision, "allow");
  });
});

describe("CLI: check-text", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "earlii-text-"));
  const run = (files) =>
    spawnSync(process.execPath, [path.join(scripts, "check-text.mjs"), ...files], {
      encoding: "utf8",
    });

  it("fails with file:line:column for a banned character", () => {
    const f = path.join(dir, "bad.md");
    writeFileSync(f, `line one\nsee ${SECTION}4\n`);
    const r = run([f]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /bad\.md:2:5/);
  });

  it("passes clean files and skips binaries and missing files", () => {
    const f = path.join(dir, "good.md");
    writeFileSync(f, "see section 4\n");
    assert.equal(run([f, path.join(dir, "logo.png"), path.join(dir, "missing.md")]).status, 0);
  });

  it("passes on the whole repository", () => {
    const r = spawnSync(process.execPath, [path.join(scripts, "check-text.mjs")], {
      cwd: path.join(scripts, ".."),
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
  });
});
