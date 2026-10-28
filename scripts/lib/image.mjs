// The container image rules (ROADMAP P0-06, ADR-0007): what may enter the build context, what the
// built image must look like, and its size budget. scripts/check-image.mjs applies them.

/**
 * 30 MB, with 1 MB = 1000 * 1000 bytes, the unit `docker images` reports. Measured on the image's
 * flattened root filesystem (the bytes of `docker export`), because `docker image inspect`'s Size
 * means different things on the classic and the containerd image stores.
 */
export const IMAGE_BUDGET_BYTES = 30_000_000;

/** The one user the image runs as: distroless's `nonroot`, numeric so a runtime can verify it. */
export const IMAGE_USER = "65532:65532";

/** The binary's path in the image. */
export const IMAGE_ENTRYPOINT = ["/earlii"];

/** The modes that serve probes on :8080 (migrate is one-shot). */
export const SERVING_MODES = ["api", "worker", "scheduler"];

/** @param {number} bytes */
export function formatMb(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

/** @param {number} bytes */
export function overImageBudget(bytes) {
  return bytes > IMAGE_BUDGET_BYTES;
}

// What `go build ./cmd/earlii` reads: the module files, non-test Go sources and the embedded
// migrations. Nothing else may be in the context (no docs, secrets, web code or private files).
const allowed = [
  /^backend\/go\.(mod|sum)$/,
  // Path segments can't start with a dot, so `..` never passes.
  /^backend\/(cmd|internal|gen)\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.go$/,
  /^backend\/internal\/postgres\/migrations\/[\w.-]+\.sql$/,
];

/**
 * Files in the build context that shouldn't be there.
 * @param {string[]} files context-relative paths with forward slashes
 * @returns {string[]} one problem per offending file
 */
export function contextProblems(files) {
  const problems = [];
  if (!files.includes("backend/go.mod"))
    problems.push("backend/go.mod is missing from the context");
  for (const f of files) {
    if (f.endsWith("_test.go")) problems.push(`${f}: test files don't belong in the image`);
    else if (!allowed.some((re) => re.test(f))) problems.push(`${f}: not on the context allowlist`);
  }
  return problems;
}

/**
 * Problems with a built image's config (the size is checked separately), from
 * `docker image inspect` (one element of its JSON array).
 * @param {{ Os?: string, Config?: { User?: string, Entrypoint?: string[] | null,
 *   Cmd?: string[] | null, ExposedPorts?: Record<string, object> | null, Env?: string[] | null } }} image
 * @returns {string[]}
 */
export function imageProblems(image) {
  const problems = [];
  const config = image.Config ?? {};
  if (image.Os !== "linux") problems.push(`os is ${image.Os}, want linux`);
  if (config.User !== IMAGE_USER) {
    problems.push(`runs as "${config.User ?? ""}", want ${IMAGE_USER} (numeric nonroot)`);
  }
  if (JSON.stringify(config.Entrypoint ?? null) !== JSON.stringify(IMAGE_ENTRYPOINT)) {
    problems.push(
      `entrypoint is ${JSON.stringify(config.Entrypoint ?? null)}, want ${JSON.stringify(IMAGE_ENTRYPOINT)}`,
    );
  }
  // No default mode: a container started without one must fail (exit 2), not become an API.
  if (config.Cmd && config.Cmd.length > 0) {
    problems.push(
      `has a default command ${JSON.stringify(config.Cmd)}; every container names its mode`,
    );
  }
  if (!config.ExposedPorts || !("8080/tcp" in config.ExposedPorts)) {
    problems.push("doesn't expose 8080/tcp");
  }
  // Config comes from the deploy's environment, never baked in.
  for (const e of config.Env ?? []) {
    if (/^(EARLII_|PG)/.test(e)) problems.push(`bakes in ${e.split("=")[0]}`);
  }
  return problems;
}

/**
 * Whether test:image runs, skips or fails, from `docker info --format {{.OSType}}`.
 * Only EARLII_REQUIRE_DOCKER=1 makes a missing Linux daemon a failure (CI's Linux job), so a
 * green run there always means the image was tested.
 * @param {{ status: number | null, stdout: string }} info
 * @param {Record<string, string | undefined>} env
 * @returns {{ action: "run" | "skip" | "fail", why: string }}
 */
export function dockerGate(info, env) {
  const os = info.stdout.trim();
  if (info.status === 0 && os === "linux") return { action: "run", why: "a Linux Docker daemon" };
  const why =
    info.status === 0 ? `the daemon runs ${os || "unknown"} containers` : "no Docker daemon";
  return { action: env.EARLII_REQUIRE_DOCKER === "1" ? "fail" : "skip", why };
}

/**
 * The loopback address `docker port <container> 8080` printed. It prints one line per binding.
 * @param {string} output
 * @returns {string | null} "127.0.0.1:<port>", or null if there is no loopback IPv4 binding
 */
export function loopbackPort(output) {
  for (const line of output.split(/\r?\n/)) {
    const m = /^127\.0\.0\.1:(\d{1,5})$/.exec(line.trim());
    if (m && Number(m[1]) > 0 && Number(m[1]) < 65536) return `127.0.0.1:${m[1]}`;
  }
  return null;
}
