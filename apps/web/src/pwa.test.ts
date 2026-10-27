// @vitest-environment node
// The install contract: what index.html and the web app manifest promise, checked statically.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";

const app = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const html = readFileSync(app("index.html"), "utf8");
const manifest: unknown = JSON.parse(readFileSync(app("public/manifest.webmanifest"), "utf8"));

type Icon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = Record<string, unknown> & { icons: Icon[] };

function asManifest(m: unknown): Manifest {
  if (typeof m !== "object" || m === null || !Array.isArray((m as Manifest).icons)) {
    throw new Error("manifest has no icons array");
  }
  return m as Manifest;
}

function pngSize(file: string): string {
  const png = readFileSync(file);
  expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  const m = asManifest(manifest);

  it("names the app and opens standalone at the root", () => {
    expect(m.name).toBe(copy.appName);
    expect(m.short_name).toBe(copy.appName);
    expect(m.display).toBe("standalone");
  });

  it("keeps id, start_url and scope same-origin and root-relative (never protocol-relative)", () => {
    for (const key of ["id", "start_url", "scope"]) {
      const v = m[key];
      expect(typeof v, key).toBe("string");
      expect(v, key).toMatch(/^\/(?!\/)/);
    }
  });

  it("matches the inline first paint's light background, so the splash doesn't flash", () => {
    expect(m.background_color).toBe("#ffffff");
    expect(html).toContain("--boot-bg: #ffffff");
    expect(html).toContain('<meta name="theme-color" content="#ffffff"');
  });

  it("ships 192 and 512 PNG icons, a maskable one and an SVG, all present on disk", () => {
    const pngs = m.icons.filter((i) => i.type === "image/png");
    expect(pngs.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(m.icons.some((i) => i.type === "image/svg+xml")).toBe(true);

    for (const icon of m.icons) {
      expect(icon.src).toMatch(/^\/(?!\/)/);
      const file = app(`public${icon.src}`);
      expect(existsSync(file), icon.src).toBe(true);
      if (icon.type === "image/png") expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });
});

describe("index.html", () => {
  it("links the manifest, the icons and per-scheme theme colours", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(pngSize(app("public/apple-touch-icon.png"))).toBe("180x180");
    expect(html).toMatch(/name="theme-color"[^>]*prefers-color-scheme: dark/);
  });

  it("has no inline scripts or event-handler attributes, so a strict CSP stays possible", () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.[1]).toContain('src="/src/main.tsx"');
    expect(scripts[0]?.[2]?.trim()).toBe("");
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("paints the app's name before any JS runs", () => {
    const root = /<div id="root">([\s\S]*)<\/div>\s*<script/.exec(html)?.[1] ?? "";
    expect(root).toContain(`<h1>${copy.appName}</h1>`);
    expect(root).toContain(copy.tagline);
  });
});
