// The handoff rule: code changes must update docs/POINTER.md, and new modules
// must update docs/HANDBOOK.md. Shared by CI and the local `task handoff`.

export const POINTER = "docs/POINTER.md";
export const HANDBOOK = "docs/HANDBOOK.md";

/** Files that never count as "code": docs, root markdown and the licence. */
export function isDocOnly(path) {
  return path.startsWith("docs/") || /^[^/]+\.md$/.test(path) || path === "LICENSE";
}

/** Parses `git diff --name-status -M` output into [{ status, path }]. */
export function parseNameStatus(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0][0];
      return { status, path: parts[parts.length - 1] };
    });
}

const MODULE_ROOTS = [/^(apps|packages)\/([^/]+)\//, /^backend\/internal\/([^/]+)\//];

/** Returns the new module directories introduced by `changes`. */
export function detectNewModules(changes, baseFiles) {
  const added = changes.filter((c) => c.status === "A" || c.status === "R");
  const modules = new Set();
  const existedBefore = (prefix) => [...baseFiles].some((f) => f.startsWith(prefix));

  for (const { path } of added) {
    const manifest = /^(.+)\/(go\.mod|package\.json)$/.exec(path);
    if (manifest && !baseFiles.has(path)) modules.add(manifest[1]);

    for (const root of MODULE_ROOTS) {
      const m = root.exec(path);
      if (m) {
        const prefix = m[0];
        if (!existedBefore(prefix)) modules.add(prefix.replace(/\/$/, ""));
      }
    }
  }
  return [...modules].sort();
}

/**
 * Applies the handoff rules.
 * changes: [{ status, path }], baseFiles: Set<string> of files at the merge base.
 */
export function checkHandoff({ changes, baseFiles }) {
  const errors = [];
  const warnings = [];
  const paths = new Set(changes.map((c) => c.path));
  const codeChanged = changes.some((c) => !isDocOnly(c.path));

  if (codeChanged && !paths.has(POINTER)) {
    errors.push(`Code changed but ${POINTER} did not. Run /handoff and commit the update.`);
  }

  const newModules = detectNewModules(changes, baseFiles);
  if (newModules.length > 0 && !paths.has(HANDBOOK)) {
    errors.push(
      `New module(s) ${newModules.join(", ")} added but ${HANDBOOK} did not change. Document them in the repo map.`,
    );
  }

  return { ok: errors.length === 0, errors, warnings, newModules };
}
