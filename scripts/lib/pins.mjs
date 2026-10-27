// Reads tool pins from mise.toml and checks installed versions against them.

/** Parses the [tools] table of a mise.toml file. Supports `name = "x.y.z"` lines. */
export function parseMiseTools(toml) {
  const tools = [];
  let inTools = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const table = /^\[([^\]]+)\]$/.exec(line);
    if (table) {
      inTools = table[1].trim() === "tools";
      continue;
    }
    if (!inTools) continue;
    const entry = /^("?)([^"=]+)\1\s*=\s*"([^"]+)"$/.exec(line);
    if (entry) tools.push({ name: entry[2].trim(), version: entry[3] });
  }
  return tools;
}

/** Drops tools listed in mise's MISE_DISABLE_TOOLS (comma-separated), e.g. editor-only tools in CI. */
export function withoutDisabled(tools, disabledList = "") {
  const disabled = new Set(
    disabledList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return tools.filter((t) => !disabled.has(t.name));
}

/** How to ask each pinned tool for its version. */
export const PROBES = {
  go: ["go", ["version"]],
  node: ["node", ["--version"]],
  pnpm: ["pnpm", ["--version"]],
  task: ["task", ["--version"]],
  lefthook: ["lefthook", ["version"]],
  "golangci-lint": ["golangci-lint", ["--version"]],
  gitleaks: ["gitleaks", ["version"]],
  actionlint: ["actionlint", ["--version"]],
  zizmor: ["zizmor", ["--version"]],
  buf: ["buf", ["--version"]],
  sqlc: ["sqlc", ["version"]],
  "go:golang.org/x/tools/gopls": ["gopls", ["version"]],
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `output` contains exactly `version` (optionally prefixed with "v" or "go"). */
export function versionMatches(output, version) {
  const re = new RegExp(`(^|[^0-9.])v?${escapeRegExp(version)}($|[^0-9.])`, "m");
  return re.test(output);
}

/**
 * Checks each pinned tool. `exec(cmd, args)` returns { ok, stdout } and is injected for tests.
 * Returns [{ name, want, got, status: "ok" | "mismatch" | "missing" | "unknown" }].
 */
export function checkTools(tools, exec) {
  return tools.map(({ name, version }) => {
    const probe = PROBES[name];
    if (!probe) return { name, want: version, got: "", status: "unknown" };
    const result = exec(probe[0], probe[1]);
    const got = (result.stdout || "").split(/\r?\n/)[0].trim();
    if (!result.ok) return { name, want: version, got, status: "missing" };
    return {
      name,
      want: version,
      got,
      status: versionMatches(result.stdout, version) ? "ok" : "mismatch",
    };
  });
}
