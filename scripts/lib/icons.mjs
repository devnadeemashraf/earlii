// Draws the Earlii app icon (apps/web/public/icon.svg) as pixels, so the PNG sizes a web app
// manifest needs are reproducible without a browser or an image library. Keep the shapes in step
// with icon.svg: a 512-unit square, a half-disc sun and a horizon bar.

const BACKDROP = [0x0a, 0x0a, 0x0a];
const ACCENT = [0xc6, 0xff, 0x3d];
const SAMPLES = 4; // 4 x 4 samples per pixel for antialiasing

/** The PNGs the web app ships. `rounded: false` fills the corners (maskable and Apple icons). */
export const ICONS = [
  { file: "apps/web/public/icon-192.png", size: 192, rounded: true },
  { file: "apps/web/public/icon-512.png", size: 512, rounded: true },
  { file: "apps/web/public/icon-maskable-512.png", size: 512, rounded: false },
  { file: "apps/web/public/apple-touch-icon.png", size: 180, rounded: false },
];

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function sample(px, py, rounded) {
  if (!inRoundRect(px, py, 0, 0, 512, 512, rounded ? 112 : 0)) return null;
  const sun = py <= 312 && (px - 256) ** 2 + (py - 312) ** 2 <= 120 * 120;
  const horizon = inRoundRect(px, py, 96, 340, 320, 28, 14);
  return sun || horizon ? ACCENT : BACKDROP;
}

/**
 * @param {number} size output width and height in pixels, 1..4096
 * @param {{ rounded: boolean }} opts
 * @returns {{ size: number, rgba: Uint8Array }}
 */
export function renderIcon(size, { rounded }) {
  if (!Number.isInteger(size) || size < 1 || size > 4096) throw new Error(`icon: bad size ${size}`);
  const rgba = new Uint8Array(size * size * 4);
  const scale = 512 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = sample(
            (x + (sx + 0.5) / SAMPLES) * scale,
            (y + (sy + 0.5) / SAMPLES) * scale,
            rounded,
          );
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          hits++;
        }
      }
      if (hits === 0) continue;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / hits);
      rgba[i + 1] = Math.round(g / hits);
      rgba[i + 2] = Math.round(b / hits);
      rgba[i + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return { size, rgba };
}
