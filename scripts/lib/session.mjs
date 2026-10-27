// Builds the context injected at the start of every Claude Code session and
// picks the formatter that runs after each edit.

export const MAX_CONTEXT_CHARS = 9500;

/** Factual session context: branch, working-tree state and the POINTER handoff file. */
export function buildSessionContext({ pointer, branch, status }) {
  const header = [
    `Current git branch: ${branch || "(unknown)"}.`,
    status.trim() === ""
      ? "Working tree is clean."
      : `Uncommitted changes:\n${status.trim().split("\n").slice(0, 20).join("\n")}`,
    "docs/POINTER.md (the handoff file, read first) follows.",
    "",
  ].join("\n");
  const body = pointer ?? "docs/POINTER.md is missing.";
  const text = header + body;
  return text.length > MAX_CONTEXT_CHARS
    ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n[truncated: read docs/POINTER.md]`
    : text;
}

const BIOME_EXTENSIONS = /\.(m?[jt]sx?|cjs|cts|json|jsonc|css|graphql)$/i;

/** Returns which formatter applies to `relPath`: "biome", "go" or null. */
export function formatterFor(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (/(^|\/)(node_modules|vendor|gen)\//.test(p)) return null;
  if (/\.go$/.test(p)) return "go";
  if (BIOME_EXTENSIONS.test(p)) return "biome";
  return null;
}
