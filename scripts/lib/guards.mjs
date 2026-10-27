// Policy for what an AI agent may do with git, gh and files in this repo.
// Pure functions: callers inject the current branch and git lookups so the
// rules are unit-testable without a repository.

import { bannedCharMessage } from "./banned.mjs";
import { findAiTraces } from "./conventional.mjs";
import { splitCommands, stripPrefixes, tokenize } from "./shell.mjs";

export const PROTECTED_BRANCHES = ["main", "master"];
export const POINTER_PATH = "docs/POINTER.md";

const allow = () => ({ decision: "allow" });
const deny = (reason) => ({ decision: "deny", reason });
const ask = (reason) => ({ decision: "ask", reason });

const GIT_GLOBAL_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

function gitSubcommand(tokens) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    i += GIT_GLOBAL_OPTS_WITH_VALUE.has(tokens[i]) ? 2 : 1;
  }
  return { sub: tokens[i], args: tokens.slice(i + 1) };
}

function isProtectedRef(ref) {
  const name = ref.replace(/^refs\/heads\//, "");
  return PROTECTED_BRANCHES.includes(name);
}

function evaluatePush(args, branch) {
  const forceFlags = ["--force", "-f", "--force-with-lease", "--force-if-includes", "--mirror"];
  if (args.some((a) => forceFlags.includes(a) || a.startsWith("--force-with-lease="))) {
    return deny("Force-pushing is never allowed. Push a new commit instead.");
  }
  if (args.includes("--no-verify")) {
    return deny("Skipping git hooks (--no-verify) is not allowed.");
  }
  if (args.includes("--all")) {
    return deny("`git push --all` would push main. Push your branch by name.");
  }

  const positional = args.filter((a) => !a.startsWith("-"));
  const refspecs = positional.slice(1);
  if (refspecs.some((r) => r.startsWith("+"))) {
    return deny("Force refspecs (+ref) are never allowed.");
  }
  for (const spec of refspecs) {
    const dst = spec.includes(":") ? spec.split(":").pop() : spec;
    const src = spec.includes(":") ? spec.split(":")[0] : spec;
    if (isProtectedRef(dst) || (dst === "HEAD" && isProtectedRef(branch))) {
      return deny("Pushing to main is not allowed. Push your feature branch and open a PR.");
    }
    if (src === "HEAD" && !spec.includes(":") && isProtectedRef(branch)) {
      return deny("You are on main. Branch first: <type>/<ID>-<slug>.");
    }
  }
  if (refspecs.length === 0 && isProtectedRef(branch)) {
    return deny("You are on main. Branch first: <type>/<ID>-<slug>.");
  }
  return allow();
}

function evaluateGit(tokens, ctx, rawSegment) {
  const { sub, args } = gitSubcommand(tokens);
  switch (sub) {
    case "commit": {
      if (isProtectedRef(ctx.branch)) {
        return deny("Never commit to main. Create a branch: <type>/<ID>-<slug>.");
      }
      if (args.includes("--no-verify") || args.includes("-n")) {
        return deny("Skipping git hooks (--no-verify) is not allowed.");
      }
      if (findAiTraces(rawSegment).length > 0) {
        return deny("AI-attribution trailers or footers are not allowed in this repo.");
      }
      if (bannedCharMessage(rawSegment)) return deny(bannedCharMessage(rawSegment));
      return allow();
    }
    case "push":
      return evaluatePush(args, ctx.branch);
    case "merge":
      if (isProtectedRef(ctx.branch)) {
        return deny("Merging into main is the human's job. Open a PR instead.");
      }
      return allow();
    default:
      return allow();
  }
}

function evaluateGh(tokens, ctx, rawSegment) {
  const [, group, action] = tokens;
  if (group === "pr" && action === "merge") {
    return deny("Never merge. The human reviews and merges every PR.");
  }
  if (group === "repo" && (action === "delete" || action === "archive")) {
    return deny("Repository deletion or archival is not allowed.");
  }
  if (
    group === "pr" &&
    ["create", "edit", "comment"].includes(action) &&
    bannedCharMessage(rawSegment)
  ) {
    return deny(bannedCharMessage(rawSegment));
  }
  if (group === "pr" && action === "create") {
    if (findAiTraces(rawSegment).length > 0) {
      return deny("AI-attribution footers are not allowed in PR descriptions.");
    }
    if (!ctx.pointerChanged()) {
      return deny(`Update ${POINTER_PATH} (run /handoff) and commit it before opening a PR.`);
    }
  }
  return allow();
}

/**
 * Decides whether a Bash command may run.
 * ctx: { branch: string, pointerChanged: () => boolean }
 */
export function evaluateBash(command, ctx) {
  if (/\bEARLII_ALLOW_MAIN_PUSH\b/.test(command)) {
    return deny("The main-push escape hatch is for the human only.");
  }
  for (const segment of splitCommands(command)) {
    const tokens = stripPrefixes(tokenize(segment));
    if (tokens.length === 0) continue;
    const program = tokens[0]
      .replace(/\.exe$/i, "")
      .split(/[\\/]/)
      .pop();
    let result = allow();
    if (program === "git") result = evaluateGit(tokens, ctx, segment);
    if (program === "gh") result = evaluateGh(tokens, ctx, segment);
    if (result.decision !== "allow") return result;
  }
  return allow();
}

const SECRET_PATTERNS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)[^/]+$/,
  /\.(pem|key|p12|pfx|jks)$/i,
  /(^|\/)secrets\//,
  /(^|\/)id_(rsa|ecdsa|ed25519)(\.pub)?$/,
];
const GENERATED_PATTERNS = [
  /(^|\/)gen\//,
  /\.pb\.go$/,
  /\.connect\.go$/,
  /_pb\.ts$/,
  /_connect\.ts$/,
  /\.gen\.ts$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)go\.sum$/,
];
const VENDORED_PATTERNS = [/(^|\/)node_modules\//, /(^|\/)vendor\//];
const APPROVAL_REQUIRED = new Map([
  [
    "docs/SPEC.md",
    "SPEC changes need an approved Spec change proposal. Approve only if the human did.",
  ],
  ["LICENSE", "The licence is owned by the human. Approve only if they asked for this change."],
]);

/** Normalises a path relative to the repo root to forward slashes. */
export function normalizeRepoPath(relPath) {
  return relPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Decides whether a file may be written. `relPath` is relative to the repo root. */
export function evaluateEdit(relPath) {
  const p = normalizeRepoPath(relPath);
  if (p.startsWith("../")) return allow();
  if (SECRET_PATTERNS.some((re) => re.test(p))) {
    return deny(`${p} looks like a secret. Agents never read or write secrets.`);
  }
  if (VENDORED_PATTERNS.some((re) => re.test(p))) {
    return deny(`${p} is vendored. Change the dependency instead.`);
  }
  if (GENERATED_PATTERNS.some((re) => re.test(p))) {
    return deny(`${p} is generated. Edit the source and re-run the generator (task gen).`);
  }
  if (APPROVAL_REQUIRED.has(p)) return ask(APPROVAL_REQUIRED.get(p));
  return allow();
}

/**
 * Decides whether new file content may be written. Accepts the Write (`content`),
 * Edit (`new_string`) and MultiEdit (`edits[].new_string`) input shapes.
 */
export function evaluateEditContent(toolInput) {
  const texts = [
    toolInput.content,
    toolInput.new_string,
    ...(toolInput.edits ?? []).map((e) => e.new_string),
  ].filter((t) => typeof t === "string");
  for (const text of texts) {
    const message = bannedCharMessage(text);
    if (message) return deny(message);
  }
  return allow();
}
