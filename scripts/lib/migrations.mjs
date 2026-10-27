// Forward-only migration rules (ADR-0005), checked against main:
// merged files never change or disappear, new versions go above main's highest,
// and no file has a Down section.

const NAME = /^(\d{5})_[a-z0-9_]+\.sql$/;

const normalise = (s) => s.replace(/\r\n/g, "\n");

/**
 * `base` and `head` map file names to contents: the migrations directory on
 * main and in the working tree. Returns a list of errors (empty when ok).
 */
export function checkMigrations({ base, head }) {
  const errors = [];

  for (const [name, content] of base) {
    if (!head.has(name))
      errors.push(`${name}: deleted or renamed after merge; add a new migration instead`);
    else if (normalise(head.get(name)) !== normalise(content))
      errors.push(`${name}: changed after merge; add a new migration instead`);
  }

  let maxBase = 0;
  for (const name of base.keys()) {
    const m = NAME.exec(name);
    if (m) maxBase = Math.max(maxBase, Number(m[1]));
  }

  const byVersion = new Map();
  for (const [name, content] of head) {
    const m = NAME.exec(name);
    if (!m) {
      errors.push(`${name}: bad name; use NNNNN_snake_case.sql, such as 00002_companies.sql`);
      continue;
    }
    const version = Number(m[1]);
    byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
    if (!base.has(name) && version <= maxBase)
      errors.push(`${name}: new versions must be above ${maxBase}, the highest on main`);
    if (!/^-- \+goose Up\b/m.test(content))
      errors.push(`${name}: missing the "-- +goose Up" annotation`);
    if (/^-- \+goose Down\b/m.test(content))
      errors.push(
        `${name}: has a Down section; migrations are forward-only (expand, migrate, contract)`,
      );
  }

  for (const [version, names] of byVersion) {
    if (names.length > 1)
      errors.push(`version ${version} is used by ${names.sort().join(" and ")}`);
  }
  return errors;
}
