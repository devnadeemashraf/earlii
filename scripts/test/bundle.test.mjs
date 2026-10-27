import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BUDGET_BYTES, formatKb, initialChunks, overBudget } from "../lib/bundle.mjs";

describe("initialChunks", () => {
  it("returns the entry's file and every static import, transitively, once each", () => {
    const manifest = {
      "index.html": { file: "assets/index.js", isEntry: true, imports: ["_vendor.js"] },
      "_vendor.js": { file: "assets/vendor.js", imports: ["_react.js"] },
      "_react.js": { file: "assets/react.js", imports: ["_vendor.js"] },
      "src/routes/a.tsx?tsr-split=component": {
        file: "assets/a.js",
        isDynamicEntry: true,
        imports: ["index.html"],
      },
    };
    assert.deepEqual(initialChunks(manifest), [
      "assets/index.js",
      "assets/vendor.js",
      "assets/react.js",
    ]);
  });

  it("leaves out lazily loaded (dynamic) chunks", () => {
    const manifest = {
      "index.html": { file: "assets/index.js", isEntry: true, dynamicImports: ["lazy.tsx"] },
      "lazy.tsx": { file: "assets/lazy.js", isDynamicEntry: true },
    };
    assert.deepEqual(initialChunks(manifest), ["assets/index.js"]);
  });

  it("fails loudly on a manifest with no entry or a dangling import", () => {
    assert.throws(() => initialChunks({}), /no entry/);
    assert.throws(
      () => initialChunks({ "index.html": { file: "a.js", isEntry: true, imports: ["nope"] } }),
      /nope/,
    );
  });
});

describe("overBudget", () => {
  it("passes at exactly the budget and fails one byte over", () => {
    assert.equal(overBudget(BUDGET_BYTES), false);
    assert.equal(overBudget(BUDGET_BYTES + 1), true);
  });

  it("uses the ROADMAP budget of 170 kB (1 kB = 1000 bytes, as Vite reports)", () => {
    assert.equal(BUDGET_BYTES, 170_000);
    assert.equal(formatKb(113_950), "113.95 kB");
  });
});

describe("check-web-build.mjs", () => {
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "check-web-build.mjs"),
    "utf8",
  );

  // With a shell on Windows, cmd.exe looks in the current directory before PATH, so a pnpm.cmd
  // planted in the repo root would run on every `task check`.
  it("runs Vite through node, never through a shell", () => {
    assert.doesNotMatch(source, /shell\s*:/);
    assert.match(source, /spawnSync\(process\.execPath,/);
  });

  it("asks for the build manifest only for the check, and removes it from dist", () => {
    assert.match(source, /"--manifest"/);
    assert.match(source, /rmSync\(/);
  });
});
