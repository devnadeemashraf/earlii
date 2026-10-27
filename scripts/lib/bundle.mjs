// The web bundle budget (ROADMAP section Budgets: initial JS at most 170 kB gzip).

/** 170 kB, with 1 kB = 1000 bytes, the unit Vite's build output reports. */
export const BUDGET_BYTES = 170_000;

/**
 * The JS a browser must download before the app can start: every entry chunk plus everything it
 * imports statically, transitively. Dynamic imports (lazily loaded routes) are left out.
 * @param {Record<string, { file: string, isEntry?: boolean, imports?: string[] }>} manifest
 *   Vite's dist/.vite/manifest.json
 * @returns {string[]} chunk files, entry first, each once
 */
export function initialChunks(manifest) {
  const entries = Object.keys(manifest).filter((k) => manifest[k]?.isEntry);
  if (entries.length === 0) throw new Error("bundle: the Vite manifest has no entry chunk");

  const files = [];
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`bundle: the Vite manifest has no chunk "${key}"`);
    files.push(chunk.file);
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  for (const key of entries) visit(key);
  return files;
}

/** @param {number} gzipBytes */
export function overBudget(gzipBytes) {
  return gzipBytes > BUDGET_BYTES;
}

/** @param {number} bytes */
export function formatKb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}
