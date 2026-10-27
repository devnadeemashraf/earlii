// Regenerates the web app's PNG icons from scripts/lib/icons.mjs. Run after changing the art:
//   node scripts/render-icons.mjs
// scripts/test/icons.test.mjs fails if a committed PNG differs from a fresh render.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS, renderIcon } from "./lib/icons.mjs";
import { encodePng } from "./lib/png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const spec of ICONS) {
  const { rgba } = renderIcon(spec.size, spec);
  const png = encodePng(spec.size, spec.size, rgba);
  writeFileSync(path.join(root, spec.file), png);
  console.log(`wrote ${spec.file} (${png.length} bytes)`);
}
