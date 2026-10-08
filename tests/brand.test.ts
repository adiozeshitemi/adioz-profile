import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicFile = (path: string) =>
  new URL(`../public/${path}`, import.meta.url);

/** The width and height in a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(publicFile(path));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("brand assets", () => {
  it("ships the icons and link preview at their sizes", () => {
    expect(pngSize("apple-touch-icon.png")).toEqual([180, 180]);
    expect(pngSize("icon-192.png")).toEqual([192, 192]);
    expect(pngSize("icon-512.png")).toEqual([512, 512]);
    expect(pngSize("og.png")).toEqual([1200, 630]);
  });

  it("ships a favicon.ico holding 16px and 32px icons", () => {
    const bytes = readFileSync(publicFile("favicon.ico"));
    expect(bytes.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: bytes.readUInt16LE(4) }, (_, index) =>
      bytes.readUInt8(6 + index * 16),
    );
    expect(sizes).toEqual(expect.arrayContaining([16, 32]));
  });

  it("switches the favicon's metals with the browser's colour scheme", () => {
    const svg = readFileSync(publicFile("favicon.svg"), "utf8");
    expect(svg).toMatch(/viewBox="9 8 46 46"/);
    expect(svg).toMatch(/@media \(prefers-color-scheme: light\)/);
  });

  it("lists icons in the web manifest that exist", () => {
    const manifest = JSON.parse(
      readFileSync(publicFile("site.webmanifest"), "utf8"),
    ) as { icons: { src: string; sizes: string }[] };
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    for (const icon of manifest.icons) {
      expect(existsSync(publicFile(icon.src.slice(1))), icon.src).toBe(true);
    }
  });
});
