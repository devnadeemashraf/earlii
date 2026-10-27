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
  it("docs/SPEC.md, the scaffold prompt and docs/learning/ are never tracked", () => {
    const tracked = spawnSync(
      "git",
      ["ls-files", "docs/SPEC.md", "docs/project-scaffold-claude.md", "docs/learning"],
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

// Taskfile.yml has no YAML parser in reach, so read one task by indentation: the task key
// sits at 2 spaces, its keys at 4 and list items at 6. It assumes 2-space indents, and a
// column-0 line (even a comment) inside a task ends the block early.
//
// Tasks that run the binary set their variables inline (`KEY=value cmd`), never in an
// `env:` block: Task lets the shell's environment win over `env:`, so a terminal still
// holding a prod EARLII_DATABASE_URL would be used. Inline assignments always win.
function taskBlock(taskfile, name) {
  const lines = taskfile.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) return null;
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line)) break;
    block.push(line);
  }
  return block;
}

/** The leading KEY=value assignments of a task's first command, or null if the task is missing. */
function taskInlineEnv(taskfile, name) {
  const block = taskBlock(taskfile, name);
  if (!block) return null;
  const cmd = block.find((l) => /^ {6}- /.test(l)) ?? "";
  const env = {};
  for (const token of cmd.replace(/^ {6}- /, "").split(/\s+/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(token);
    if (!m) break;
    env[m[1]] = m[2];
  }
  return env;
}

describe("Taskfile.yml dev:api (BP-001)", () => {
  const env = taskInlineEnv(read("Taskfile.yml"), "dev:api");

  it("exists and sets its variables inline", () => assert.ok(env && Object.keys(env).length > 0));

  it("binds the dev API to loopback, so nobody on the Wi-Fi can reach it", () => {
    assert.match(env?.EARLII_HTTP_ADDR ?? "", /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  });

  it("never binds every interface (empty host, 0.0.0.0 or [::])", () => {
    assert.doesNotMatch(env?.EARLII_HTTP_ADDR ?? ":", /^(:|0\.0\.0\.0:|\[::\]:)/);
  });

  it("listens where the web dev proxy points", () => {
    const target = /const apiTarget = "http:\/\/([^"]+)";/.exec(read("apps/web/vite.config.ts"));
    assert.ok(target, "apiTarget not found in apps/web/vite.config.ts");
    assert.equal(env?.EARLII_HTTP_ADDR, target[1]);
  });

  it("the parser reads leading assignments only and stops at the next task", () => {
    const fixture = [
      "tasks:",
      "  a:",
      "    dir: x",
      "    cmds:",
      "      - X=1 Y=a:b/c?d=e run Z=3",
      "  b:",
      "    cmds:",
      "      - W=2 run",
    ].join("\n");
    assert.deepEqual(taskInlineEnv(fixture, "a"), { X: "1", Y: "a:b/c?d=e" });
    assert.equal(taskInlineEnv(fixture, "missing"), null);
  });
});

// Published ports in the list form ("host:container" strings) under each `ports:` key.
function composePorts(text) {
  const ports = [];
  let indent = -1;
  for (const line of text.split(/\r?\n/)) {
    const key = /^(\s*)ports:\s*$/.exec(line);
    if (key) {
      indent = key[1].length;
      continue;
    }
    if (indent < 0 || line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = /^(\s*)-\s*(.+?)\s*(#.*)?$/.exec(line);
    if (item && item[1].length > indent) ports.push(item[2].replace(/^(["'])(.*)\1$/, "$2"));
    else indent = -1;
  }
  return ports;
}

describe("compose.yaml", () => {
  const compose = read("compose.yaml");

  it("publishes every port on loopback only (Docker bypasses host firewalls)", () => {
    const ports = composePorts(compose);
    assert.ok(ports.length > 0, "no ports found: the parser is out of date");
    for (const p of ports) assert.match(p, /^127\.0\.0\.1:\d+:\d+$/, p);
  });

  it("never uses the long port syntax, which the check above can't read", () => {
    assert.doesNotMatch(compose, /^\s*(published|host_ip|target):/m);
  });

  it("pins every image to an exact version", () => {
    const images = [...compose.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
    assert.ok(images.length > 0);
    // Postgres versions have two parts (18.6), most images three. Never "latest" or a bare major.
    for (const i of images) assert.match(i, /:\d+\.\d+(\.\d+)?(-[a-z0-9]+)?$/, i);
  });

  it("the parser finds list ports and skips other lists", () => {
    const fixture = [
      "services:",
      "  a:",
      "    ports:",
      '      - "127.0.0.1:1:1" # note',
      "      - 0.0.0.0:2:2",
      "    networks: [x]",
      "    command:",
      "      - not-a-port",
    ].join("\n");
    assert.deepEqual(composePorts(fixture), ["127.0.0.1:1:1", "0.0.0.0:2:2"]);
  });
});

describe("Taskfile.yml dev database", () => {
  const taskfile = read("Taskfile.yml");

  it("dev:api and migrate reach Postgres on loopback, in dev", () => {
    for (const task of ["dev:api", "migrate"]) {
      const env = taskInlineEnv(taskfile, task) ?? {};
      assert.equal(env.EARLII_ENV, "dev", task);
      assert.match(
        env.EARLII_DATABASE_URL ?? "",
        /^postgres:\/\/[^@]+@127\.0\.0\.1:5432\/earlii\?sslmode=disable$/,
        task,
      );
    }
  });

  it("no task that runs the binary has an env: block the shell could override", () => {
    for (const task of ["dev:api", "migrate"]) {
      assert.ok(!taskBlock(taskfile, task)?.some((l) => l.trim() === "env:"), task);
    }
  });
});
