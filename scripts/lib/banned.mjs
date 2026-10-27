// Characters that must never appear in this repo, its commits or its PRs (owner rule, 2026-10-27).

export const BANNED_CHARS = [
  // Built from its code point: a literal, or a unicode escape (which Biome rewrites), would trip the check.
  {
    char: String.fromCodePoint(0xa7),
    name: "section sign",
    hint: 'write "section 4" or "SPEC A2" instead',
  },
];

/** Returns [{ line, column, char, name, hint }] for every banned character in `text`. */
export function findBannedChars(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of BANNED_CHARS) {
      let at = line.indexOf(rule.char);
      while (at !== -1) {
        hits.push({ line: i + 1, column: at + 1, ...rule });
        at = line.indexOf(rule.char, at + 1);
      }
    }
  });
  return hits;
}

/** One-line description of the first banned character, or null. */
export function bannedCharMessage(text) {
  const [hit] = findBannedChars(text);
  return hit ? `"${hit.char}" (${hit.name}) is banned in this repo: ${hit.hint}` : null;
}
