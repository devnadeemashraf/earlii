import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkMigrations } from "../lib/migrations.mjs";

const up = (sql = "CREATE TABLE t (id bigint);") => `-- +goose Up\n${sql}\n`;
const files = (obj) => new Map(Object.entries(obj));

describe("checkMigrations (forward-only, ADR-0005)", () => {
  const base = files({ "00001_baseline.sql": up("SELECT 1;") });

  it("happy: appending a higher version passes", () => {
    const head = files({ "00001_baseline.sql": up("SELECT 1;"), "00002_companies.sql": up() });
    assert.deepEqual(checkMigrations({ base, head }), []);
  });

  it("happy: no changes passes, and no base (first run) passes", () => {
    assert.deepEqual(checkMigrations({ base, head: base }), []);
    assert.deepEqual(checkMigrations({ base: new Map(), head: base }), []);
  });

  it("edge: line endings alone are not an edit (Windows checkouts)", () => {
    const head = files({ "00001_baseline.sql": "-- +goose Up\r\nSELECT 1;\r\n" });
    assert.deepEqual(checkMigrations({ base, head }), []);
  });

  it("sad: editing a merged migration fails", () => {
    const head = files({ "00001_baseline.sql": up("SELECT 2;") });
    assert.match(checkMigrations({ base, head }).join("\n"), /00001_baseline\.sql.*changed/);
  });

  it("sad: deleting or renaming a merged migration fails", () => {
    const head = files({ "00001_init.sql": up("SELECT 1;") });
    assert.match(checkMigrations({ base, head }).join("\n"), /00001_baseline\.sql.*deleted/);
  });

  it("sad: a new version at or below main's highest fails (it would never run in prod)", () => {
    const b = files({ "00001_a.sql": up(), "00003_c.sql": up() });
    const head = new Map([...b, ["00002_b.sql", up()]]);
    assert.match(checkMigrations({ base: b, head }).join("\n"), /00002_b\.sql.*above 3/);
  });

  it("sad: two files with one version fail", () => {
    const head = new Map([...base, ["00002_a.sql", up()], ["00002_b.sql", up()]]);
    assert.match(
      checkMigrations({ base, head }).join("\n"),
      /version 2.*00002_a\.sql.*00002_b\.sql/,
    );
  });

  it("sad: a Down section fails (forward-only)", () => {
    const head = new Map([...base, ["00002_x.sql", `${up()}-- +goose Down\nDROP TABLE t;\n`]]);
    assert.match(checkMigrations({ base, head }).join("\n"), /00002_x\.sql.*Down/);
  });

  it("sad: a file without an Up annotation fails", () => {
    const head = new Map([...base, ["00002_x.sql", "CREATE TABLE t (id bigint);\n"]]);
    assert.match(checkMigrations({ base, head }).join("\n"), /00002_x\.sql.*\+goose Up/);
  });

  it("abuser: bad file names fail (timestamps, missing padding, upper case, other extensions)", () => {
    for (const name of [
      "20261028120000_x.sql",
      "2_x.sql",
      "00002_X.sql",
      "00002_x.go",
      "00002-x.sql",
    ]) {
      const head = new Map([...base, [name, up()]]);
      assert.match(checkMigrations({ base, head }).join("\n"), /name/, name);
    }
  });
});
