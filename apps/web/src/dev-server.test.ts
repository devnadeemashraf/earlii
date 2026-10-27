// @vitest-environment node
// `task dev:web:lan` exposes the Vite dev server to the local network. These tests start the real
// server from vite.config.ts and attack it the way another device on the same Wi-Fi could.
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer, normalizePath, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

let server: ViteDevServer;
let port: number;

beforeAll(async () => {
  server = await createServer({
    root: appRoot,
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("dev server isn't listening on TCP");
  port = address.port;
});

afterAll(async () => {
  await server?.close();
});

function get(path: string, host = `127.0.0.1:${port}`): Promise<number> {
  return fetchRaw(path, host).then((r) => r.status);
}

// node:http sends the path exactly as written, so traversal sequences reach Vite unnormalised.
function fetchRaw(path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => {
        body += c;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

// AGENTS.md opens with this line; a response containing it means the file leaked.
const agentsMarker = "# AGENTS.md";

const fsUrl = (abs: string) => `/@fs/${normalizePath(abs).replace(/^\//, "")}`;

describe("dev server", () => {
  it("serves the app (control)", async () => {
    expect(await get("/")).toBe(200);
  });

  it("refuses files elsewhere in the repo through /@fs/", async () => {
    expect(await get(fsUrl(`${repoRoot}AGENTS.md`))).toBe(403);
    expect(await get(fsUrl(`${repoRoot}docs/HANDBOOK.md`))).toBe(403);
    expect(await get(fsUrl(`${repoRoot}docs/learning/README.md`))).toBe(403);
    expect(await get(fsUrl(`${repoRoot}docs/SPEC.md`))).toBe(403);
  });

  it("refuses path traversal out of the app root", async () => {
    // Vite normalises these to /AGENTS.md, which isn't in the app, so its SPA fallback answers
    // with index.html (a 200). What matters is that the file's contents never come back.
    for (const path of ["/../../AGENTS.md", "/%2e%2e/%2e%2e/AGENTS.md", "/..%2f..%2fAGENTS.md"]) {
      const { body } = await fetchRaw(path, `127.0.0.1:${port}`);
      expect(body, path).not.toContain(agentsMarker);
    }
    expect(await get(fsUrl(`${appRoot}../../AGENTS.md`))).toBe(403);
  });

  it("keeps Vite's default deny list and adds the private docs", () => {
    expect(server.config.server.fs.deny).toEqual(
      expect.arrayContaining([
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        "**/.git/**",
        "**/docs/SPEC.md",
        "**/docs/learning/**",
      ]),
    );
    expect(server.config.server.fs.strict).toBe(true);
  });

  it("leaks nothing through /@fs/ variants (case, raw imports, backslashes, NTFS streams)", async () => {
    const agents = fsUrl(`${repoRoot}AGENTS.md`);
    const variants = [
      agents.replace("AGENTS.md", "agents.md"), // case-insensitive file systems (Windows, macOS)
      `${agents}?raw`,
      `${agents}?import&raw`,
      `${agents}::$DATA`, // NTFS default data stream
      agents.replaceAll("/", "%5C").replace("%5C@fs%5C", "/@fs/"),
      `${fsUrl(`${appRoot}node_modules`)}/../../../AGENTS.md`,
    ];
    for (const path of variants) {
      const { body } = await fetchRaw(path, `127.0.0.1:${port}`);
      expect(body, path).not.toContain(agentsMarker);
    }
  });

  it("refuses requests for an unknown Host (DNS rebinding)", async () => {
    expect(await get("/", "evil.example")).toBe(403);
    expect(server.config.server.allowedHosts).not.toBe(true);
  });

  it("proxies only the readiness probe, to IPv4 loopback", () => {
    const proxy = server.config.server.proxy ?? {};
    expect(Object.keys(proxy)).toEqual(["^/readyz$"]);
    expect(proxy["^/readyz$"]).toMatchObject({ target: "http://127.0.0.1:8080" });
  });
});
