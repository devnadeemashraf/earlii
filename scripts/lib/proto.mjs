// Pure logic for the contract checks (ADR-0006).

const normalise = (s) => s.replace(/\r\n/g, "\n");

/**
 * Compares freshly generated files with the committed ones (both Map<relativePath, content>).
 * Returns sorted messages: "changed: p", "missing: p" (generated but not committed), "stale: p"
 * (committed but no longer generated). Line endings are ignored.
 */
export function compareTrees(fresh, committed) {
  const out = [];
  for (const [p, content] of fresh) {
    if (!committed.has(p)) out.push(`missing: ${p}`);
    else if (normalise(committed.get(p)) !== normalise(content)) out.push(`changed: ${p}`);
  }
  for (const p of committed.keys()) {
    if (!fresh.has(p)) out.push(`stale: ${p}`);
  }
  return out.sort((a, b) => (a.split(": ")[1] < b.split(": ")[1] ? -1 : 1));
}
