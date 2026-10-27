import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkHandoff, detectNewModules, isDocOnly, parseNameStatus } from "../lib/handoff.mjs";

const base = new Set(["README.md", "docs/POINTER.md", "backend/internal/feed/feed.go"]);
const mod = (path) => ({ status: "M", path });
const add = (path) => ({ status: "A", path });

describe("parseNameStatus", () => {
  it("parses modifications, additions and renames", () => {
    const out = "M\tdocs/POINTER.md\nA\tscripts/x.mjs\nR087\told/a.go\tnew/a.go\n";
    assert.deepEqual(parseNameStatus(out), [
      { status: "M", path: "docs/POINTER.md" },
      { status: "A", path: "scripts/x.mjs" },
      { status: "R", path: "new/a.go" },
    ]);
  });

  it("tolerates CRLF and blank output", () => {
    assert.deepEqual(parseNameStatus(""), []);
    assert.equal(parseNameStatus("M\ta.go\r\n").length, 1);
  });
});

describe("isDocOnly", () => {
  it("treats docs, root markdown and LICENSE as non-code", () => {
    for (const p of ["docs/ROADMAP.md", "README.md", "LICENSE", "docs/adr/0001-x.md"]) {
      assert.equal(isDocOnly(p), true, p);
    }
  });
  it("treats nested markdown and everything else as code", () => {
    for (const p of ["apps/web/README.md", "scripts/x.mjs", ".github/workflows/ci.yml"]) {
      assert.equal(isDocOnly(p), false, p);
    }
  });
});

describe("checkHandoff", () => {
  it("passes a docs-only change without POINTER", () => {
    assert.equal(checkHandoff({ changes: [mod("docs/ROADMAP.md")], baseFiles: base }).ok, true);
  });

  it("fails a code change without POINTER", () => {
    const r = checkHandoff({ changes: [mod("backend/internal/feed/feed.go")], baseFiles: base });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /POINTER/);
  });

  it("passes a code change with POINTER, with no warnings", () => {
    const r = checkHandoff({
      changes: [mod("backend/internal/feed/feed.go"), mod("docs/POINTER.md")],
      baseFiles: base,
    });
    assert.equal(r.ok, true);
    // The study guides are private (docs/learning/ is gitignored), so CI can't
    // and mustn't look for them.
    assert.deepEqual(r.warnings, []);
  });

  it("fails a new module without HANDBOOK", () => {
    const r = checkHandoff({
      changes: [add("backend/internal/connectors/greenhouse.go"), mod("docs/POINTER.md")],
      baseFiles: base,
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.newModules, ["backend/internal/connectors"]);
  });

  it("passes a new module with HANDBOOK", () => {
    const r = checkHandoff({
      changes: [add("apps/web/package.json"), mod("docs/POINTER.md"), mod("docs/HANDBOOK.md")],
      baseFiles: base,
    });
    assert.equal(r.ok, true);
  });

  it("does not treat a new file in an existing module as a new module", () => {
    assert.deepEqual(detectNewModules([add("backend/internal/feed/rank.go")], base), []);
  });

  it("detects a new go.mod anywhere below the root", () => {
    assert.deepEqual(detectNewModules([add("backend/go.mod")], base), ["backend"]);
  });
});
