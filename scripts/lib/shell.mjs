// A deliberately small shell-ish parser: good enough to classify the commands
// an agent runs, not a full POSIX parser. Quotes are respected; unquoted
// `;`, `&`, `|` and newlines separate commands.

/** Splits a command line into separate command segments. */
export function splitCommands(command) {
  const segments = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && quote === '"' && i + 1 < command.length) {
        current += command[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === ";" || ch === "&" || ch === "|" || ch === "\n") {
      if (current.trim() !== "") segments.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") segments.push(current.trim());
  return segments;
}

/** Splits one command segment into words, removing quotes. */
export function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;
  let inToken = false;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < segment.length) {
        current += segment[++i];
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
    } else {
      current += ch;
      inToken = true;
    }
  }
  if (inToken) tokens.push(current);
  return tokens;
}

/** Drops leading `VAR=value` assignments and wrappers like `env`, `command`, `sudo`. */
export function stripPrefixes(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || ["env", "command", "sudo", "exec"].includes(t)) {
      i++;
    } else {
      break;
    }
  }
  return tokens.slice(i);
}
