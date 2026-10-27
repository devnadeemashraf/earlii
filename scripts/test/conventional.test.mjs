import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findAiTraces, stripComments, validateCommitMessage } from "../lib/conventional.mjs";

describe("validateCommitMessage", () => {
  it("accepts a plain conventional header", () => {
    assert.deepEqual(validateCommitMessage("feat: add feed"), { ok: true, errors: [] });
  });

  it("accepts scope, breaking marker and a body", () => {
    const msg = "fix(connectors/greenhouse)!: handle 304\n\nBody line.\n\nRefs: P1-04";
    assert.equal(validateCommitMessage(msg).ok, true);
  });

  it("accepts roadmap and bug IDs as scopes", () => {
    for (const h of ["chore(P0-01): add kit", "fix(BP-003): stop duplicates", "docs(R-01): bump"]) {
      assert.equal(validateCommitMessage(h).ok, true, h);
    }
  });

  it("rejects a scope with spaces or an empty scope", () => {
    assert.equal(validateCommitMessage("feat(my scope): x").ok, false);
    assert.equal(validateCommitMessage("feat(): x").ok, false);
  });

  it("accepts merge, revert and fixup headers", () => {
    for (const h of ['Merge branch "x"', 'Revert "feat: x"', "fixup! feat: x"]) {
      assert.equal(validateCommitMessage(h).ok, true, h);
    }
  });

  it("rejects an unknown type", () => {
    const r = validateCommitMessage("feature: add feed");
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /type "feature"/);
  });

  it("rejects a header without a colon-space", () => {
    assert.equal(validateCommitMessage("feat add feed").ok, false);
    assert.equal(validateCommitMessage("feat:add feed").ok, false);
  });

  it("rejects an uppercase type and a trailing period", () => {
    assert.equal(validateCommitMessage("Feat: add").ok, false);
    assert.match(validateCommitMessage("feat: add feed.").errors.join(), /period/);
  });

  it("rejects a header longer than 72 characters", () => {
    const r = validateCommitMessage(`feat: ${"x".repeat(70)}`);
    assert.match(r.errors.join(), /limit is 72/);
  });

  it("allows exactly 72 characters", () => {
    assert.equal(validateCommitMessage(`feat: ${"x".repeat(66)}`).ok, true);
  });

  it("rejects an empty or comment-only message", () => {
    assert.equal(validateCommitMessage("").ok, false);
    assert.equal(validateCommitMessage("# only a comment\n\n").ok, false);
  });

  it("requires a blank line after the header", () => {
    assert.equal(validateCommitMessage("feat: x\nbody").ok, false);
  });

  it("ignores everything below the scissors line", () => {
    const msg = "docs: x\n# ------------------------ >8 ------------------------\nnot a header";
    assert.equal(validateCommitMessage(msg).ok, true);
  });

  it("handles CRLF line endings from Windows editors", () => {
    assert.equal(validateCommitMessage("feat: x\r\n\r\nbody\r\n").ok, true);
  });
});

describe("AI-attribution traces (abuse cases)", () => {
  const traced = [
    "feat: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    "feat: x\n\nco-authored-by: claude <someone@example.com>",
    "feat: x\n\nCo-authored-by: GitHub Copilot <copilot@github.com>",
    "feat: x\n\nGenerated with Claude Code",
    "feat: x\n\n\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)",
    "feat: x\n\nClaude-Session: https://claude.ai/code/abc",
  ];
  for (const msg of traced) {
    it(`rejects: ${msg.split("\n").pop()}`, () => {
      const r = validateCommitMessage(msg);
      assert.equal(r.ok, false);
      assert.match(r.errors.join(), /AI-attribution/);
    });
  }

  it("allows a human co-author", () => {
    assert.equal(validateCommitMessage("feat: x\n\nCo-Authored-By: Asha <a@example.com>").ok, true);
  });

  it("does not flag ordinary mentions of AI features", () => {
    assert.deepEqual(findAiTraces("feat(enrichment): call the Gemini provider"), []);
  });
});

describe("stripComments", () => {
  it("drops lines starting with #", () => {
    assert.equal(stripComments("a\n# b\nc"), "a\nc");
  });
});
