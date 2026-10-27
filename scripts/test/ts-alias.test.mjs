// Proves the `@/*` path alias (ADR-0004) resolves in every TypeScript context:
// typecheck, tests, the dev server and the production build. It also proves the
// Biome rule that bans parent-relative imports in app code.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = path.join(root, "scripts", "test", "fixtures", "ts-alias");
const bin = {
  tsc: path.join(root, "node_modules", "typescript", "bin", "tsc"),
  vitest: path.join(root, "node_modules", "vitest", "vitest.mjs"),
  biome: path.join(root, "node_modules", "@biomejs", "biome", "bin", "biome"),
};
const node = (args, cwd = root) =>
  spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: { ...process.env, CI: "1" } });

describe("path alias @/*", () => {
  const scratch = [];
  after(() => {
    for (const p of scratch) rmSync(p, { recursive: true, force: true });
  });

  it("typechecks with tsc", () => {
    const r = node([bin.tsc, "-p", fixture]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("fails the typecheck on an alias that points nowhere", () => {
    const broken = path.join(fixture, "src", "__broken__.ts");
    scratch.push(broken);
    writeFileSync(broken, 'import { nope } from "@/lib/does-not-exist";\nexport const x = nope;\n');
    const r = node([bin.tsc, "-p", fixture]);
    rmSync(broken, { force: true });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /TS2307|Cannot find module '@\/lib\/does-not-exist'/);
  });

  it("resolves in tests (Vitest)", () => {
    const r = node([bin.vitest, "run", "--root", fixture]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 passed/);
  });

  it("resolves in the dev server (Vite transform)", async () => {
    const { createServer } = await import("vite");
    const server = await createServer({
      root: fixture,
      configFile: path.join(fixture, "vite.config.ts"),
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
    });
    try {
      const result = await server.transformRequest("/src/main.ts");
      assert.match(result.code, /from\s+"\/src\/lib\/freshness\.ts"/);
      assert.doesNotMatch(result.code, /@\/lib/);
    } finally {
      await server.close();
    }
  });

  it("is bundled away in the production build, and the output runs", async () => {
    const { build } = await import("vite");
    const outDir = mkdtempSync(path.join(tmpdir(), "earlii-alias-build-"));
    scratch.push(outDir);
    await build({
      root: fixture,
      configFile: path.join(fixture, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
    const mod = await import(pathToFileURL(path.join(outDir, "main.js")).href);
    assert.equal(mod.sample, "SDE-2 · Bengaluru (12 min ago)");
  });
});

describe("Biome bans parent-relative imports in app code", () => {
  const probeDir = path.join(fixture, "src", "__probe__", "nested");
  after(() => rmSync(path.join(fixture, "src", "__probe__"), { recursive: true, force: true }));

  const lint = (specifier) => {
    mkdirSync(probeDir, { recursive: true });
    const file = path.join(probeDir, `p${Math.random().toString(36).slice(2)}.ts`);
    writeFileSync(file, `import { a } from "${specifier}";\n\nexport const b = a;\n`);
    const r = node([bin.biome, "lint", "--colors=off", path.relative(root, file)]);
    return (r.stdout + r.stderr).includes("noRestrictedImports");
  };

  for (const specifier of ["../lib/format-role", "../../main"]) {
    it(`rejects ${specifier}`, () => assert.equal(lint(specifier), true));
  }
  for (const specifier of ["@/lib/format-role", "./sibling", "vitest"]) {
    it(`allows ${specifier}`, () => assert.equal(lint(specifier), false));
  }
});
