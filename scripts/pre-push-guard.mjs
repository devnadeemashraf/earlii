#!/usr/bin/env node
// git pre-push hook: refuses pushes that update or delete main.
// The human can bypass once with EARLII_ALLOW_MAIN_PUSH=1 (agents are blocked from using it).

import { readFileSync } from "node:fs";
import { protectedRefsTouched } from "./lib/prepush.mjs";

const stdin = (() => {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
})();

const touched = protectedRefsTouched(stdin);
if (touched.length > 0 && process.env.EARLII_ALLOW_MAIN_PUSH !== "1") {
  console.error(`pre-push: refusing to push to ${touched.join(", ")}.`);
  console.error("  Push a feature branch (<type>/<ID>-<slug>) and open a PR.");
  process.exit(1);
}
