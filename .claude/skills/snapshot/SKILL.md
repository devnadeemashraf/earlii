---
name: snapshot
description: Take accessibility-tree snapshots and screenshots of the local web app with the Playwright MCP at mobile and desktop sizes, to check a UI change (layout, skeletons, empty states, touch targets, dark mode). Use after any UI change or when the user says "snapshot" or "how does it look".
argument-hint: "[route, e.g. /feed]"
---

Skip with "skip: no web app yet (P0-03)" if `apps/web` doesn't exist.

1. Make sure the dev server is running (`task dev:web`; start it in the background if needed) and note its URL.
2. With the `playwright` MCP, open `<url>$ARGUMENTS` and capture:
   - at 390×844 (phone): an accessibility snapshot and a screenshot, in light and dark;
   - at 1280×800 (desktop): a screenshot.
3. Check against SPEC section 4 and section O:
   - no blank screen (skeletons, not spinners);
   - primary actions within thumb reach;
   - touch targets at least 44 px;
   - visible focus;
   - reduced motion respected;
   - WCAG AA contrast in the active theme preset;
   - empty states suggest something.
4. Report the findings with a severity each. Don't commit screenshots unless asked.
