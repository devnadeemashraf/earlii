import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, inflateSync } from "node:zlib";
import { ICONS, renderIcon } from "../lib/icons.mjs";
import { encodePng } from "../lib/png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function chunks(png) {
  const out = [];
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString("latin1");
    const data = png.subarray(at + 8, at + 8 + len);
    const crc = png.readUInt32BE(at + 8 + len);
    out.push({ type, data, crcOk: crc === crc32(png.subarray(at + 4, at + 8 + len)) });
    at += 12 + len;
  }
  return out;
}

function pixel(icon, x, y) {
  const i = (y * icon.size + x) * 4;
  return [...icon.rgba.subarray(i, i + 4)];
}

describe("encodePng", () => {
  it("writes a valid RGBA PNG: signature, IHDR, IDAT, IEND, correct CRCs", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 9, 9, 9, 9]);
    const png = encodePng(2, 2, rgba);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const cs = chunks(png);
    assert.deepEqual(
      cs.map((c) => c.type),
      ["IHDR", "IDAT", "IEND"],
    );
    assert.ok(cs.every((c) => c.crcOk));
    const ihdr = cs[0].data;
    assert.equal(ihdr.readUInt32BE(0), 2);
    assert.equal(ihdr.readUInt32BE(4), 2);
    assert.deepEqual([...ihdr.subarray(8)], [8, 6, 0, 0, 0]);
    // Each row is a filter byte (0, none) followed by the row's RGBA bytes.
    const raw = inflateSync(cs[1].data);
    assert.deepEqual([...raw], [0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)]);
  });

  it("rejects a buffer that doesn't match the dimensions", () => {
    assert.throws(() => encodePng(2, 2, new Uint8Array(15)), /RGBA/);
    assert.throws(() => encodePng(0, 1, new Uint8Array(0)), /size/);
  });
});

describe("renderIcon", () => {
  it("draws the sun in the accent colour and the backdrop in near-black", () => {
    const icon = renderIcon(512, { rounded: true });
    assert.deepEqual(pixel(icon, 256, 250), [0xc6, 0xff, 0x3d, 255]);
    assert.deepEqual(pixel(icon, 256, 120), [0x0a, 0x0a, 0x0a, 255]);
  });

  it("leaves rounded corners transparent, and fills square (maskable) corners", () => {
    assert.equal(pixel(renderIcon(512, { rounded: true }), 0, 0)[3], 0);
    assert.deepEqual(pixel(renderIcon(512, { rounded: false }), 0, 0), [0x0a, 0x0a, 0x0a, 255]);
  });

  it("antialiases edges", () => {
    const icon = renderIcon(512, { rounded: true });
    // The corner arc (radius 112) crosses the diagonal at 112 * (1 - 1/sqrt 2), about 32.8.
    const alpha = pixel(icon, 32, 32)[3];
    assert.ok(alpha > 0 && alpha < 255, `alpha ${alpha}`);
  });

  it("keeps the maskable art inside the safe zone (a circle of 40% of the size)", () => {
    const size = 512;
    const icon = renderIcon(size, { rounded: false });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r] = pixel(icon, x, y);
        if (r !== 0x0a && Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) {
          assert.fail(`accent pixel outside the safe zone at ${x},${y}`);
        }
      }
    }
  });

  it("rejects sizes outside 1..4096", () => {
    assert.throws(() => renderIcon(0, { rounded: true }), /size/);
    assert.throws(() => renderIcon(4097, { rounded: true }), /size/);
    assert.equal(renderIcon(1, { rounded: false }).rgba.length, 4);
  });
});

// The pixels, not the compressed bytes: zlib builds can deflate the same data differently.
function scanlines(png) {
  const idat = chunks(png).filter((c) => c.type === "IDAT");
  return inflateSync(Buffer.concat(idat.map((c) => c.data)));
}

describe("committed web icons", () => {
  it("match a fresh render (run `node scripts/render-icons.mjs` after changing the art)", () => {
    for (const spec of ICONS) {
      const icon = renderIcon(spec.size, spec);
      const fresh = encodePng(spec.size, spec.size, icon.rgba);
      const committed = readFileSync(path.join(root, spec.file));
      assert.ok(fresh.subarray(0, 33).equals(committed.subarray(0, 33)), `${spec.file}: header`);
      assert.ok(scanlines(fresh).equals(scanlines(committed)), `${spec.file} is stale`);
    }
  });
});
