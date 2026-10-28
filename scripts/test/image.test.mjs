// The container image (P0-06, ADR-0007): the pure rules in scripts/lib/image.mjs, and the static
// shape of Dockerfile, .dockerignore, the compose app services, the tasks and CI. The image itself
// is built and smoke-tested by scripts/check-image.mjs (`task test:image`).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  contextProblems,
  dockerGate,
  formatMb,
  IMAGE_BUDGET_BYTES,
  IMAGE_ENTRYPOINT,
  IMAGE_USER,
  imageProblems,
  loopbackPort,
  overImageBudget,
  SERVING_MODES,
} from "../lib/image.mjs";
import { parseMiseTools } from "../lib/pins.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const goodImage = () => ({
  Os: "linux",
  Config: {
    User: IMAGE_USER,
    Entrypoint: [...IMAGE_ENTRYPOINT],
    Cmd: null,
    ExposedPorts: { "8080/tcp": {} },
    Env: ["PATH=/usr/bin", "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt"],
  },
});

describe("image budget", () => {
  it("is 30 MB in decimal units, inclusive", () => {
    assert.equal(IMAGE_BUDGET_BYTES, 30_000_000);
    assert.equal(overImageBudget(30_000_000), false);
    assert.equal(overImageBudget(30_000_001), true);
    assert.equal(formatMb(21_456_789), "21.46 MB");
  });
});

describe("imageProblems", () => {
  it("accepts a good image", () => {
    assert.deepEqual(imageProblems(goodImage()), []);
  });

  it("rejects root, a named user and a missing user", () => {
    for (const user of ["", "0", "root", "0:0", "nonroot", undefined]) {
      const img = goodImage();
      img.Config.User = user;
      assert.equal(imageProblems(img).length, 1, String(user));
    }
  });

  it("rejects a shell-form or moved entrypoint", () => {
    for (const ep of [null, ["/bin/sh", "-c", "/earlii"], ["/usr/local/bin/earlii"], []]) {
      const img = goodImage();
      img.Config.Entrypoint = ep;
      assert.match(imageProblems(img).join("\n"), /entrypoint/, JSON.stringify(ep));
    }
  });

  it("rejects a default mode, so a container without one fails instead of serving", () => {
    const img = goodImage();
    img.Config.Cmd = ["api"];
    assert.match(imageProblems(img).join("\n"), /default command/);
    img.Config.Cmd = [];
    assert.deepEqual(imageProblems(img), []);
  });

  it("rejects baked-in config and database variables", () => {
    for (const env of ["EARLII_ENV=prod", "EARLII_DATABASE_URL=postgres://x", "PGPASSWORD=x"]) {
      const img = goodImage();
      img.Config.Env.push(env);
      assert.match(imageProblems(img).join("\n"), /bakes in/, env);
      assert.doesNotMatch(imageProblems(img).join("\n"), /=/, "never echoes the value");
    }
  });

  it("rejects an image without 8080 or not for linux", () => {
    const cases = [
      (i) => (i.Config.ExposedPorts = null),
      (i) => (i.Config.ExposedPorts = { "80/tcp": {} }),
      (i) => (i.Os = "windows"),
    ];
    for (const mutate of cases) {
      const img = goodImage();
      mutate(img);
      assert.equal(imageProblems(img).length, 1, mutate.toString());
    }
  });

  it("survives an inspect result with no Config", () => {
    assert.ok(imageProblems({ Os: "linux" }).length >= 3);
  });
});

describe("contextProblems", () => {
  const good = [
    "backend/go.mod",
    "backend/go.sum",
    "backend/cmd/earlii/main.go",
    "backend/internal/config/config.go",
    "backend/gen/api/earlii/v1/health.pb.go",
    "backend/internal/postgres/migrations/00001_baseline.sql",
  ];

  it("accepts exactly what the build reads", () => {
    assert.deepEqual(contextProblems(good), []);
  });

  it("requires go.mod", () => {
    assert.equal(contextProblems(good.slice(1)).length, 1);
  });

  it("rejects private, secret, test and unrelated files", () => {
    const bad = [
      "docs/SPEC.md",
      "docs/learning/P0-05-contracts-connect/README.md",
      "docs/project-scaffold-claude.md",
      ".env",
      "backend/.env",
      ".git/config",
      "apps/web/src/main.tsx",
      "node_modules/x/index.js",
      "backend/cmd/earlii/main_test.go",
      "backend/internal/postgres/queries/server.sql",
      "backend/sqlc.yaml",
      "backend/internal/postgres/migrations/notes.md",
      "backend/internal/../../docs/SPEC.md",
      "backend/internal/../../docs/x.go",
      "backend/cmd/.hidden/x.go",
      "Dockerfile",
    ];
    for (const f of bad) assert.equal(contextProblems([...good, f]).length, 1, f);
  });
});

describe("dockerGate", () => {
  const linux = { status: 0, stdout: `linux${"\n"}` };
  const windows = { status: 0, stdout: `windows${"\n"}` };
  const none = { status: 1, stdout: "" };
  const required = { EARLII_REQUIRE_DOCKER: "1" };

  it("runs on a Linux daemon, required or not", () => {
    assert.equal(dockerGate(linux, {}).action, "run");
    assert.equal(dockerGate(linux, required).action, "run");
  });

  it("skips without a Linux daemon unless required", () => {
    assert.equal(dockerGate(none, {}).action, "skip");
    assert.equal(dockerGate(windows, {}).action, "skip");
    assert.match(dockerGate(windows, {}).why, /windows/);
  });

  it("fails without a Linux daemon when required, so CI can't go green untested", () => {
    assert.equal(dockerGate(none, required).action, "fail");
    assert.equal(dockerGate(windows, required).action, "fail");
    assert.equal(dockerGate({ status: null, stdout: "" }, required).action, "fail");
  });

  it("only the exact value 1 requires Docker", () => {
    for (const v of ["", "0", "true", " 1", undefined]) {
      assert.equal(dockerGate(none, { EARLII_REQUIRE_DOCKER: v }).action, "skip", String(v));
    }
  });
});

describe("loopbackPort", () => {
  it("picks the IPv4 loopback binding", () => {
    assert.equal(loopbackPort("127.0.0.1:49153\n"), "127.0.0.1:49153");
    assert.equal(loopbackPort("[::1]:1\r\n127.0.0.1:2\r\n"), "127.0.0.1:2");
  });

  it("refuses wildcard, foreign, empty and out-of-range bindings", () => {
    for (const out of [
      "0.0.0.0:49153",
      "[::]:49153",
      "",
      "127.0.0.1:0",
      "127.0.0.1:70000",
      "10.0.0.1:8080",
    ]) {
      assert.equal(loopbackPort(out), null, out);
    }
  });
});

// FROM lines of a Dockerfile: { image, tag, digest, alias }.
function stages(dockerfile) {
  return [
    ...dockerfile.matchAll(
      /^FROM\s+(?:--platform=\S+\s+)?(\S+?)(?::([^@\s]+))?(?:@(sha256:[0-9a-f]+))?(?:\s+AS\s+(\S+))?\s*$/gim,
    ),
  ].map((m) => ({ image: m[1], tag: m[2], digest: m[3], alias: m[4] }));
}

describe("Dockerfile", () => {
  const dockerfile = read("Dockerfile");
  const all = stages(dockerfile);
  const instructions = dockerfile
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]+\s/.test(l))
    .map((l) => l.split(/\s/)[0]);

  it("is multi-stage, every base pinned by tag and digest", () => {
    assert.equal(
      all.length,
      (dockerfile.match(/^FROM\s/gm) ?? []).length,
      "a FROM the parser can't read",
    );
    assert.ok(all.length >= 2);
    for (const s of all) {
      assert.match(s.digest ?? "", /^sha256:[0-9a-f]{64}$/, s.image);
      assert.ok(s.tag && s.tag !== "latest", s.image);
    }
  });

  it("builds with the Go version mise pins", () => {
    const go = parseMiseTools(read("mise.toml")).find((t) => t.name === "go").version;
    const builder = all.find((s) => s.image === "golang");
    assert.ok(builder, "no golang stage");
    assert.ok(builder.tag.startsWith(`${go}-`), `golang:${builder.tag} vs mise go ${go}`);
  });

  it("ends on distroless static as nonroot, running the binary in exec form with no default mode", () => {
    const final = all.at(-1);
    assert.equal(final.image, "gcr.io/distroless/static-debian13");
    assert.equal(final.tag, "nonroot");
    assert.match(dockerfile, new RegExp(`^USER ${IMAGE_USER}$`, "m"));
    assert.match(dockerfile, new RegExp(`^ENTRYPOINT \\["${IMAGE_ENTRYPOINT[0]}"\\]$`, "m"));
    assert.ok(!instructions.includes("CMD"), "no CMD: every container names its mode");
    assert.match(dockerfile, /^EXPOSE 8080$/m);
  });

  it("builds a static, reproducible binary", () => {
    assert.match(dockerfile, /CGO_ENABLED=0/);
    for (const flag of ["-trimpath", "-buildvcs=false", '-ldflags="-s -w"']) {
      assert.ok(dockerfile.includes(flag), flag);
    }
  });

  it("never uses ADD, curl-pipe or a shell entrypoint", () => {
    assert.ok(!instructions.includes("ADD"));
    assert.doesNotMatch(dockerfile, /curl|wget/);
  });

  it("records each base image digest in VERSIONS", () => {
    const versions = read("docs/VERSIONS.md");
    for (const s of all) assert.ok(versions.includes(s.digest), `${s.image} ${s.digest}`);
  });
});

describe(".dockerignore", () => {
  const rules = read(".dockerignore")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  it("is an allowlist: ignore everything, then re-include backend sources only", () => {
    assert.equal(rules[0], "*");
    for (const r of rules.filter((x) => x.startsWith("!"))) assert.match(r, /^!backend\//, r);
  });

  it("drops test files after the re-includes", () => {
    assert.equal(rules.at(-1), "**/*_test.go");
  });
});

// Each top-level service's lines, plus the x- extension blocks, keyed by name.
function composeBlocks(text) {
  const blocks = {};
  let current = null;
  let inServices = false;
  for (const line of text.split(/\r?\n/)) {
    const top = /^([\w-]+):/.exec(line);
    if (top) {
      inServices = top[1] === "services";
      current = top[1].startsWith("x-") ? top[1] : null;
      if (current) blocks[current] = [];
      continue;
    }
    const svc = /^ {2}([\w-]+):\s*$/.exec(line);
    if (inServices && svc) {
      current = svc[1];
      blocks[current] = [];
      continue;
    }
    if (current) blocks[current].push(line);
  }
  return Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, v.join("\n")]));
}

describe("compose.yaml app services", () => {
  const blocks = composeBlocks(read("compose.yaml"));
  const app = blocks["x-app"] ?? "";
  const appServices = [...SERVING_MODES, "migrate"];

  it("every mode runs the one locally built image", () => {
    assert.match(app, /^\s+image: earlii:local$/m);
    assert.match(app, /^\s+build: \.$/m);
    for (const name of appServices) {
      assert.ok(blocks[name], `no ${name} service`);
      assert.match(blocks[name], /^\s+<<: \*app$/m, name);
      assert.match(blocks[name], new RegExp(`^\\s+command: \\[${name}\\]$`, "m"), name);
      assert.doesNotMatch(
        blocks[name],
        /^\s+(image|build):/m,
        `${name} overrides the shared image`,
      );
    }
  });

  it("is opt-in, so task dev:db starts only the infrastructure", () => {
    assert.match(app, /^\s+profiles: \[app\]$/m);
  });

  it("runs hardened: read-only root, no capabilities, no privilege gain", () => {
    assert.match(app, /^\s+read_only: true$/m);
    assert.match(app, /^\s+cap_drop: \[ALL\]$/m);
    assert.match(app, /^\s+security_opt: \["no-new-privileges:true"\]$/m);
  });

  it("is dev config, pointed at the compose Postgres", () => {
    assert.match(app, /^\s+EARLII_ENV: dev$/m);
    assert.match(
      app,
      /^\s+EARLII_DATABASE_URL: postgres:\/\/earlii:earlii-dev-only@postgres:5432\/earlii\?sslmode=disable$/m,
    );
  });

  it("migrates once before any serving mode starts", () => {
    assert.match(blocks.migrate, /condition: service_healthy/);
    for (const name of SERVING_MODES) {
      assert.match(blocks[name], /migrate:\s*\n\s+condition: service_completed_successfully/, name);
    }
  });

  it("publishes only the API, on loopback 8080 like task dev:api", () => {
    assert.match(blocks.api, /^\s+- "127\.0\.0\.1:8080:8080"$/m);
    for (const name of ["worker", "scheduler", "migrate"])
      assert.doesNotMatch(blocks[name], /ports:/, name);
    assert.doesNotMatch(app, /ports:/);
  });

  it("the block parser splits services and extension blocks", () => {
    const fixture = [
      "x-a: &a",
      "  k: 1",
      "services:",
      "  one:",
      "    <<: *a",
      "  two:",
      "    x: y",
      "volumes:",
      "  v:",
    ].join("\n");
    assert.deepEqual(composeBlocks(fixture), {
      "x-a": "  k: 1",
      one: "    <<: *a",
      two: "    x: y",
    });
  });
});

describe("Taskfile.yml and CI wire the image in", () => {
  const taskfile = read("Taskfile.yml");
  const ci = read(".github/workflows/ci.yml");

  it("task lint runs hadolint and task test runs the image smoke test", () => {
    assert.match(taskfile, /^ {6}- task: lint:docker$/m);
    assert.match(taskfile, /^ {6}- task: test:image$/m);
    assert.match(taskfile, /hadolint Dockerfile/);
    assert.match(taskfile, /node scripts\/check-image\.mjs/);
  });

  it("CI requires Docker for the smoke test on Linux and scans the image there", () => {
    assert.match(ci, /EARLII_REQUIRE_DOCKER: \$\{\{ runner\.os == 'Linux' && '1' \|\| '' \}\}/);
    assert.match(ci, /if: runner\.os == 'Linux'\n\s+run: task image:scan/);
  });
});
