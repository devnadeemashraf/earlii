// AbortSignal.any needs Chrome 116, Safari 17.4 and Firefox 124 (MDN browser-compat-data), but
// Vite's default build target goes back to Chrome 111 and Safari 16.4. Use the native one where it
// exists, and this small equivalent elsewhere.

export function anySignalFallback(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const already = signals.find((s) => s.aborted);
  if (already) {
    controller.abort(already.reason);
    return controller.signal;
  }
  const cleanups: Array<() => void> = [];
  for (const s of signals) {
    const onAbort = () => {
      controller.abort(s.reason);
      // Detach from the others so a long-lived input doesn't keep this controller reachable.
      for (const cleanup of cleanups) cleanup();
    };
    s.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => s.removeEventListener("abort", onAbort));
  }
  return controller.signal;
}

export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  // Looked up on every call (not cached at import), so tests can remove it.
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([...signals])
    : anySignalFallback(signals);
}
