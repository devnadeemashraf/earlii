import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateBash, evaluateEdit } from "../lib/guards.mjs";
import { splitCommands, tokenize } from "../lib/shell.mjs";

const onBranch = (branch, pointerChanged = true) => ({
  branch,
  pointerChanged: () => pointerChanged,
});
const decide = (cmd, ctx = onBranch("feat/P1-04-greenhouse")) => evaluateBash(cmd, ctx).decision;

describe("shell parsing", () => {
  it("splits on unquoted separators only", () => {
    assert.deepEqual(splitCommands('git add . && git commit -m "a; b" | cat'), [
      "git add .",
      'git commit -m "a; b"',
      "cat",
    ]);
  });

  it("tokenizes quotes and escapes", () => {
    assert.deepEqual(tokenize(`git commit -m "say \\"hi\\"" -m 'x y'`), [
      "git",
      "commit",
      "-m",
      'say "hi"',
      "-m",
      "x y",
    ]);
  });
});

describe("evaluateBash: happy paths", () => {
  for (const cmd of [
    "git status",
    "git commit -m 'feat: x'",
    "git push -u origin feat/P1-04-greenhouse",
    "git push",
    "git merge origin/main",
    "gh pr create --title 'feat: x' --body 'ok'",
    "gh pr view 3",
    "task check",
  ]) {
    it(`allows: ${cmd}`, () => assert.equal(decide(cmd), "allow"));
  }
});

describe("evaluateBash: main is protected", () => {
  const main = onBranch("main");
  it("denies commits on main", () => assert.equal(decide("git commit -m 'feat: x'", main), "deny"));
  it("denies a bare push from main", () => assert.equal(decide("git push", main), "deny"));
  it("denies merging into main", () => assert.equal(decide("git merge feat/x", main), "deny"));
  it("denies pushing to main explicitly", () => {
    assert.equal(decide("git push origin main"), "deny");
    assert.equal(decide("git push origin HEAD:main"), "deny");
    assert.equal(decide("git push origin feat/x:refs/heads/main"), "deny");
    assert.equal(decide("git push origin HEAD", main), "deny");
  });
  it("allows pull and checkout on main", () => {
    assert.equal(decide("git pull --ff-only", main), "allow");
    assert.equal(decide("git switch -c feat/P0-02-go-skeleton", main), "allow");
  });
});

describe("evaluateBash: abuse cases", () => {
  for (const cmd of [
    "git push --force",
    "git push -f origin feat/x",
    "git push --force-with-lease",
    "git push --force-with-lease=feat/x",
    "git push origin +feat/x",
    "git push --mirror",
    "git push --all",
    "git push --no-verify",
    "git commit --no-verify -m 'feat: x'",
    "git commit -n -m 'feat: x'",
    "gh pr merge 3 --squash",
    "gh repo delete devnadeemashraf/earlii",
    "echo ok && git push origin main",
    "FOO=1 git push origin main",
    "git -C . push origin main",
    "git.exe push origin main",
    "EARLII_ALLOW_MAIN_PUSH=1 git push origin main",
    "git commit -m 'feat: x' -m 'Co-Authored-By: Claude <noreply@anthropic.com>'",
    "gh pr create --title x --body 'Generated with Claude Code'",
    "git add docs/SPEC.md",
    "git add -f docs/SPEC.md",
    "git add --force docs/project-scaffold-claude.md",
    "git add ./docs/SPEC.md",
  ]) {
    it(`denies: ${cmd}`, () => assert.equal(decide(cmd), "deny"));
  }
});

describe("evaluateBash: PR creation needs a POINTER update", () => {
  it("denies when POINTER did not change", () => {
    const r = evaluateBash("gh pr create --fill", onBranch("feat/x", false));
    assert.equal(r.decision, "deny");
    assert.match(r.reason, /POINTER/);
  });
});

describe("evaluateEdit", () => {
  const cases = {
    allow: [
      "backend/internal/feed/feed.go",
      "docs/POINTER.md",
      ".env.example",
      "apps/web/src/app.tsx",
    ],
    deny: [
      ".env",
      ".env.local",
      "apps/web/.env.production",
      "certs/server.pem",
      "secrets/razorpay.json",
      "backend/gen/earlii/v1/feed.pb.go",
      "packages/api/src/gen/feed_pb.ts",
      "apps/web/src/routeTree.gen.ts",
      "pnpm-lock.yaml",
      "backend/go.sum",
      "node_modules/react/index.js",
      "vendor/x/y.go",
      "id_ed25519",
    ],
    ask: ["docs/SPEC.md", "LICENSE"],
  };
  for (const [decision, paths] of Object.entries(cases)) {
    for (const p of paths) {
      it(`${decision}: ${p}`, () => assert.equal(evaluateEdit(p).decision, decision));
    }
  }

  it("normalises Windows separators", () => {
    assert.equal(evaluateEdit("apps\\web\\.env").decision, "deny");
    assert.equal(evaluateEdit(".\\docs\\SPEC.md").decision, "ask");
  });

  it("ignores files outside the repo", () => {
    assert.equal(evaluateEdit("../elsewhere/.env").decision, "allow");
  });
});
