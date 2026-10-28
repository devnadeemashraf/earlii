// `task test:image` (P0-06, ADR-0007): builds the image and checks it end to end.
//   1. The build context holds only what the build reads (exported through a scratch build).
//   2. The image: config (nonroot, exec entrypoint, no default mode, no baked config) and size.
//   3. No shell, and no mode means usage (exit 2).
//   4. api, worker and scheduler each boot hardened (read-only, no capabilities), serve /healthz,
//      report /readyz 503 with no database, log JSON for their mode, and drain on SIGTERM as
//      PID 1 (exit 0, not Docker's SIGKILL). Only api serves the Connect API. migrate fails
//      cleanly (exit 1) with no database.
//
// Without a Linux Docker daemon it prints `skip:` and succeeds, unless EARLII_REQUIRE_DOCKER=1
// (CI on Linux), where a skip would be a green job that tested nothing.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  contextProblems,
  dockerGate,
  formatMb,
  IMAGE_BUDGET_BYTES,
  imageProblems,
  loopbackPort,
  overImageBudget,
  SERVING_MODES,
} from "./lib/image.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tag = "earlii:local";
// Unreachable on purpose: the pool connects lazily, so the modes boot and report not-ready.
const noDatabase = "postgres://earlii:unused@127.0.0.1:1/earlii?sslmode=disable";
const hardening = ["--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true"];

/** @param {string[]} args @param {import("node:child_process").SpawnSyncOptions} [opts] */
function docker(args, opts = {}) {
  const r = spawnSync("docker", args, { cwd: root, encoding: "utf8", ...opts });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error };
}

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  FAIL ${msg}`);
};
const pass = (msg) => console.log(`  ok   ${msg}`);

const gate = dockerGate(docker(["info", "--format", "{{.OSType}}"]), process.env);
if (gate.action === "fail") {
  console.error(`test:image: EARLII_REQUIRE_DOCKER=1 but ${gate.why}`);
  process.exit(1);
}
if (gate.action === "skip") {
  console.log(`skip: ${gate.why} (start Docker Desktop to build and smoke-test the image)`);
  process.exit(0);
}

// 1. The context, exactly as the daemon receives it (the real .dockerignore applies).
const out = mkdtempSync(path.join(tmpdir(), "earlii-context-"));
try {
  const ctx = docker(
    ["build", "--quiet", "--file", "-", "--output", `type=local,dest=${out}`, "."],
    {
      input: "FROM scratch\nCOPY . /\n",
    },
  );
  if (ctx.status !== 0) {
    console.error(ctx.stderr);
    fail("couldn't export the build context");
  } else {
    const files = readdirSync(out, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.relative(out, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
    const problems = contextProblems(files);
    for (const p of problems) fail(`context: ${p}`);
    if (problems.length === 0) pass(`build context: ${files.length} files, all on the allowlist`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

// 2. Build and inspect.
console.log(`test:image: docker build --tag ${tag} .`);
const build = docker(["build", "--tag", tag, "."], { stdio: "inherit" });
if (build.status !== 0) {
  console.error("test:image: the build failed");
  process.exit(1);
}

const [image] = JSON.parse(docker(["image", "inspect", tag]).stdout || "[{}]");
const configProblems = imageProblems(image);
for (const p of configProblems) fail(`image: ${p}`);
if (configProblems.length === 0) pass("image config: nonroot, exec entrypoint, no default mode");

const create = docker(["create", tag, "api"]);
const created = create.stdout.trim();
const exported =
  create.status === 0
    ? spawnSync("docker", ["export", created], { cwd: root, maxBuffer: 1 << 28 })
    : null;
if (created) docker(["rm", "--force", created]);
const size = exported?.stdout?.length ?? 0;
if (!exported) fail(`couldn't create a container to measure: ${create.stderr.trim()}`);
else if (exported.status !== 0 || size === 0) fail("couldn't export the image filesystem");
else if (overImageBudget(size)) {
  fail(`image: ${formatMb(size)}, over the ${formatMb(IMAGE_BUDGET_BYTES)} budget`);
} else pass(`image size: ${formatMb(size)} (budget ${formatMb(IMAGE_BUDGET_BYTES)})`);

// 3. No shell to land in; no mode, no server.
const shell = docker(["run", "--rm", "--entrypoint", "/bin/sh", tag, "-c", "true"]);
// Not just any failure: the run itself must work and find no shell to exec.
if (shell.status === 0) fail("the image has a working /bin/sh");
else if (!/no such file|not found/i.test(shell.stderr)) {
  fail(`no-shell check failed for another reason: ${shell.stderr.trim()}`);
} else pass("no shell");

const usage = docker(["run", "--rm", tag]);
if (usage.status !== 2) fail(`no mode: exit ${usage.status}, want 2 (usage)`);
else pass("no mode: usage, exit 2");

const migrate = docker([
  "run",
  "--rm",
  ...hardening,
  "-e",
  "EARLII_ENV=dev",
  "-e",
  `EARLII_DATABASE_URL=${noDatabase}`,
  tag,
  "migrate",
]);
if (migrate.status !== 1) fail(`migrate with no database: exit ${migrate.status}, want 1`);
else pass("migrate with no database: exit 1");

// 4. The serving modes.
/** @param {string} url @param {RequestInit} [init] */
async function get(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(2000) });
    await res.arrayBuffer();
    return res.status;
  } catch {
    return 0;
  }
}

async function waitHealthy(addr) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await get(`http://${addr}/healthz`)) === 200) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** The first log line, parsed, or null. */
function firstLogLine(id) {
  const line = docker(["logs", id]).stdout.split(/\r?\n/)[0];
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function smoke(mode) {
  const run = docker([
    "run",
    "--detach",
    ...hardening,
    "--publish",
    "127.0.0.1::8080",
    "-e",
    "EARLII_ENV=dev",
    "-e",
    `EARLII_DATABASE_URL=${noDatabase}`,
    tag,
    mode,
  ]);
  const id = run.stdout.trim();
  if (run.status !== 0 || id === "") {
    // A created container whose start failed (a port bind, say) still prints its ID.
    if (id) docker(["rm", "--force", id]);
    return fail(`${mode}: didn't start: ${run.stderr.trim()}`);
  }
  const before = failures.length;
  try {
    const addr = loopbackPort(docker(["port", id, "8080/tcp"]).stdout);
    if (!addr) return fail(`${mode}: 8080 isn't published on loopback`);
    if (!(await waitHealthy(addr))) return fail(`${mode}: /healthz never answered 200`);

    const ready = await get(`http://${addr}/readyz`);
    if (ready !== 503) fail(`${mode}: /readyz ${ready} with no database, want 503`);

    const rpc = await get(`http://${addr}/earlii.v1.HealthService/Check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" },
      body: "{}",
    });
    const wantRpc = mode === "api" ? 200 : 404;
    if (rpc !== wantRpc) fail(`${mode}: Health RPC ${rpc}, want ${wantRpc}`);

    const log = firstLogLine(id);
    if (log?.mode !== mode) fail(`${mode}: the first log line isn't JSON for this mode`);

    const started = Date.now();
    docker(["stop", "--time", "10", id]);
    const took = Date.now() - started;
    const code = docker(["inspect", "--format", "{{.State.ExitCode}}", id]).stdout.trim();
    if (code !== "0") fail(`${mode}: exit ${code} after SIGTERM, want 0 (137 means SIGKILL)`);
    else if (took >= 10_000) fail(`${mode}: took ${took} ms to stop, Docker's kill deadline`);

    if (failures.length === before) {
      pass(`${mode}: healthz 200, readyz 503, rpc ${wantRpc}, JSON logs, drained in ${took} ms`);
    }
  } finally {
    if (failures.length !== before) console.error(docker(["logs", id]).stdout);
    docker(["rm", "--force", id]);
  }
}

for (const mode of SERVING_MODES) await smoke(mode);

if (failures.length > 0) {
  console.error(`test:image: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("test:image: ok");
