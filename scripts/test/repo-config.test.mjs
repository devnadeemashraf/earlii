// "Every config parses": JSON configs load, hook commands point at real scripts,
// and every skill and subagent has the frontmatter Claude Code needs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

// Strict on purpose: the first line after the opening fence must be a key. A blank line there
// (which Biome's Markdown formatter once inserted) makes Claude Code ignore the frontmatter.
function frontmatter(text) {
  const m = /^---\r?\n(?=[a-zA-Z])([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((l) => /^([a-zA-Z-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x[1], x[2]]),
  );
}

describe("JSON configs", () => {
  for (const f of ["package.json", "biome.json", ".mcp.json", ".claude/settings.json"]) {
    it(`${f} parses`, () => assert.doesNotThrow(() => json(f)));
  }
});

describe(".claude/settings.json", () => {
  const settings = json(".claude/settings.json");

  it("hides all AI attribution", () => {
    assert.deepEqual(settings.attribution, { commit: "", pr: "", sessionUrl: false });
  });

  it("every hook command points at an existing script", () => {
    const commands = Object.values(settings.hooks)
      .flat()
      .flatMap((group) => group.hooks.map((h) => h.command));
    assert.ok(commands.length >= 4);
    for (const cmd of commands) {
      const m = /scripts\/[\w/-]+\.mjs/.exec(cmd);
      assert.ok(m, `no script in: ${cmd}`);
      assert.ok(existsSync(path.join(root, m[0])), `missing ${m[0]}`);
    }
  });

  it("denies reading secrets", () => {
    assert.ok(settings.permissions.deny.some((r) => r.startsWith("Read(./.env")));
  });
});

describe("CLAUDE.md", () => {
  it("imports AGENTS.md", () => assert.match(read("CLAUDE.md"), /^@AGENTS\.md$/m));
});

describe("skills and subagents", () => {
  const skillsDir = path.join(root, ".claude", "skills");
  for (const name of readdirSync(skillsDir)) {
    it(`skill ${name} has name and description`, () => {
      const fm = frontmatter(read(`.claude/skills/${name}/SKILL.md`));
      assert.ok(fm, "missing frontmatter");
      assert.equal(fm.name, name);
      assert.ok(fm.description?.length > 20);
    });
  }

  for (const file of readdirSync(path.join(root, ".claude", "agents"))) {
    it(`agent ${file} has name, description and tools`, () => {
      const fm = frontmatter(read(`.claude/agents/${file}`));
      assert.ok(fm, "missing frontmatter");
      assert.equal(`${fm.name}.md`, file);
      assert.ok(fm.description?.length > 20);
      assert.ok(fm.tools);
    });
  }
});

describe("private inputs", () => {
  it("docs/SPEC.md and the scaffold prompt are never tracked", () => {
    const tracked = spawnSync(
      "git",
      ["ls-files", "docs/SPEC.md", "docs/project-scaffold-claude.md"],
      {
        cwd: root,
        encoding: "utf8",
      },
    ).stdout.trim();
    assert.equal(tracked, "", `private files are tracked: ${tracked}`);
  });
});

describe("POINTER.md", () => {
  const pointer = read("docs/POINTER.md");
  it("stays within 80 lines", () => assert.ok(pointer.trimEnd().split("\n").length <= 80));
  it("has the fixed headings", () => {
    for (const h of [
      "## State",
      "## FIX-FIRST QUEUE",
      "## NEXT UP",
      "## Open questions for the human",
      "## Environment notes and gotchas",
      "## Learning",
      "## Recent history",
    ]) {
      assert.ok(pointer.includes(h), `missing heading ${h}`);
    }
  });
});
