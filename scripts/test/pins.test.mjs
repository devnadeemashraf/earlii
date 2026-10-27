import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  checkTools,
  PROBES,
  parseMiseTools,
  versionMatches,
  withoutDisabled,
} from "../lib/pins.mjs";

describe("withoutDisabled", () => {
  const tools = [{ name: "go" }, { name: "go:golang.org/x/tools/gopls" }, { name: "node" }];
  it("drops disabled tools and tolerates spaces", () => {
    assert.deepEqual(
      withoutDisabled(tools, " go:golang.org/x/tools/gopls , node").map((t) => t.name),
      ["go"],
    );
  });
  it("keeps everything when unset", () => {
    assert.equal(withoutDisabled(tools, undefined).length, 3);
  });
});

describe("parseMiseTools", () => {
  it("reads quoted and bare keys from [tools] only", () => {
    const toml = `
# comment
[env]
FOO = "1.0.0"

[tools]
go = "1.27.3"   # trailing comment
"go:golang.org/x/tools/gopls" = "0.24.0"

[settings]
x = "y"
`;
    assert.deepEqual(parseMiseTools(toml), [
      { name: "go", version: "1.27.3" },
      { name: "go:golang.org/x/tools/gopls", version: "0.24.0" },
    ]);
  });

  it("parses the real mise.toml and every pin has a probe", () => {
    const tools = parseMiseTools(readFileSync(new URL("../../mise.toml", import.meta.url), "utf8"));
    assert.ok(tools.length >= 5);
    for (const t of tools) assert.ok(PROBES[t.name], `no probe for ${t.name}`);
  });
});

describe("versionMatches", () => {
  const cases = [
    ["go version go1.27.3 windows/amd64", "1.27.3", true],
    ["v24.22.1", "24.22.1", true],
    ["golangci-lint has version 2.15.0 built with go1.27.0", "2.15.0", true],
    ["golang.org/x/tools/gopls v0.24.0", "0.24.0", true],
    ["v24.22.10", "24.22.1", false],
    ["v124.22.1", "24.22.1", false],
    ["1.27.30", "1.27.3", false],
    ["", "1.0.0", false],
  ];
  for (const [output, version, expected] of cases) {
    it(`${JSON.stringify(output)} ~ ${version} => ${expected}`, () => {
      assert.equal(versionMatches(output, version), expected);
    });
  }
});

describe("checkTools", () => {
  it("reports ok, mismatch, missing and unknown", () => {
    const fake = (cmd) =>
      ({
        go: { ok: true, stdout: "go version go1.27.3 linux/amd64" },
        node: { ok: true, stdout: "v22.0.0" },
        pnpm: { ok: false, stdout: "" },
      })[cmd];
    const r = checkTools(
      [
        { name: "go", version: "1.27.3" },
        { name: "node", version: "24.22.1" },
        { name: "pnpm", version: "12.15.0" },
        { name: "mystery", version: "1.0.0" },
      ],
      fake,
    );
    assert.deepEqual(
      r.map((x) => x.status),
      ["ok", "mismatch", "missing", "unknown"],
    );
  });
});
