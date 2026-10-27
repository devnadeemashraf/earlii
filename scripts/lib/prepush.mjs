// Logic for the pre-push hook: refuse any push that updates or deletes main.

const PROTECTED = new Set(["refs/heads/main", "refs/heads/master"]);

/**
 * Parses git's pre-push stdin ("<local ref> <local sha> <remote ref> <remote sha>" per line)
 * and returns the protected remote refs that this push would touch.
 */
export function protectedRefsTouched(stdin) {
  return stdin
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4)
    .map(([, , remoteRef]) => remoteRef)
    .filter((ref) => PROTECTED.has(ref));
}
