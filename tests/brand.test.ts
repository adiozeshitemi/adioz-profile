import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
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

  it("ships a favicon.ico holding 16px, 32px and 48px icons", () => {
    const bytes = readFileSync(publicFile("favicon.ico"));
    expect(bytes.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: bytes.readUInt16LE(4) }, (_, index) =>
      bytes.readUInt8(6 + index * 16),
    );
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48]));
  });

  it("draws each favicon.ico icon on a transparent background", () => {
    const bytes = readFileSync(publicFile("favicon.ico"));
    for (let index = 0; index < bytes.readUInt16LE(4); index++) {
      const entry = 6 + index * 16;
      const start = bytes.readUInt32LE(entry + 12);
      const png = bytes.subarray(start, start + bytes.readUInt32LE(entry + 8));
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      // IHDR colour type 6: truecolour with alpha.
      expect(png.readUInt8(25)).toBe(6);
      const idat: Buffer[] = [];
      for (let at = 8; at < png.length;) {
        const length = png.readUInt32BE(at);
        if (png.subarray(at + 4, at + 8).toString("ascii") === "IDAT") {
          idat.push(png.subarray(at + 8, at + 8 + length));
        }
        at += length + 12;
      }
      // The first scanline's filter byte, then its first pixel's RGBA: no
      // filter type changes the first pixel of the first row.
      const pixels = inflateSync(Buffer.concat(idat));
      expect(pixels.readUInt8(4), `icon ${index}`).toBe(0);
    }
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
