// `task build:web`: builds apps/web for production, then fails if
//   - the committed route tree (apps/web/src/routeTree.gen.ts) was stale: the router plugin
//     regenerates it during the build, so a changed file means someone added or renamed a route
//     without committing the regenerated tree;
//   - the initial JS is over the ROADMAP budget (scripts/lib/bundle.mjs).
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { BUDGET_BYTES, formatKb, initialChunks, overBudget } from "./lib/bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");
const routeTree = path.join(web, "src", "routeTree.gen.ts");

// Run the app's own Vite with this Node, not `pnpm build` through a shell. On Windows, cmd.exe
// looks in the current directory before PATH, so a planted pnpm.cmd would run here.
const vitePkg = createRequire(path.join(web, "package.json")).resolve("vite/package.json");
const viteBin = path.join(
  path.dirname(vitePkg),
  JSON.parse(readFileSync(vitePkg, "utf8")).bin.vite,
);

const before = readFileSync(routeTree, "utf8");
// --manifest only here: the chunk map is for this check, not for the deployable dist/.
const build = spawnSync(process.execPath, [viteBin, "build", "--manifest"], {
  cwd: web,
  stdio: "inherit",
});
if (build.error) console.error(`build:web: couldn't start Vite: ${build.error.message}`);
if (build.status !== 0) process.exit(build.status ?? 1);

let failed = false;
if (readFileSync(routeTree, "utf8") !== before) {
  console.error(
    "build:web: apps/web/src/routeTree.gen.ts was stale and has been regenerated. Commit it.",
  );
  failed = true;
}

const dist = path.join(web, "dist");
const manifestDir = path.join(dist, ".vite");
const manifest = JSON.parse(readFileSync(path.join(manifestDir, "manifest.json"), "utf8"));
rmSync(manifestDir, { recursive: true, force: true });

let total = 0;
for (const file of initialChunks(manifest)) {
  const gz = gzipSync(readFileSync(path.join(dist, file))).length;
  total += gz;
  console.log(`  ${file}  ${formatKb(gz)} gzip`);
}
const verdict = overBudget(total) ? "OVER" : "within";
console.log(
  `build:web: initial JS ${formatKb(total)} gzip, ${verdict} the ${formatKb(BUDGET_BYTES)} budget`,
);
if (overBudget(total)) failed = true;

process.exit(failed ? 1 : 0);
