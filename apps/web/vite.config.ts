// The @/ alias lives once, in tsconfig.json `paths` (ADR-0004); Vite and Vitest read it natively.
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Only the procedures the app calls are proxied, each matched exactly (a query string is allowed,
// for Connect GET), never "/" or a service prefix: either would hand the dev server's LAN exposure
// to every API route, including ones added later. 127.0.0.1, not localhost, because Node may
// resolve localhost to ::1 while the API listens on IPv4.
const apiTarget = "http://127.0.0.1:8080";
const apiProxyRoutes = ["^/earlii\\.v1\\.HealthService/Check(\\?|$)"];

// The private, gitignored docs sit inside the pnpm workspace root, which Vite allows by default.
// `task dev:web:lan` exposes the dev server on the LAN, so anyone on the same Wi-Fi could fetch
// them through /@fs/. Allow only this app and the hoisted dependencies, and deny the private paths
// outright in case the allow list ever widens. The first six deny entries are Vite's defaults,
// which setting `deny` replaces.
const fsDeny = [
  ".env",
  ".env.*",
  "*.{crt,pem,key,p12,pfx,cer,der}",
  ".npmrc",
  ".yarnrc.yml",
  "**/.git/**",
  "**/docs/SPEC.md",
  "**/docs/project-scaffold-claude.md",
  "**/docs/learning/**",
];

export default defineConfig({
  // The router plugin must run before React's so it can rewrite route files first.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    fs: { strict: true, allow: [".", "../../node_modules"], deny: fsDeny },
    proxy: Object.fromEntries(apiProxyRoutes.map((route) => [route, { target: apiTarget }])),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
