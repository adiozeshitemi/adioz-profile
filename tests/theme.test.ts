import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../src/styles/theme.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** The custom properties declared by rules whose selector names `selector`, later rules winning. */
function tokens(selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, prelude, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!prelude.includes(selector)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      found[name] = value.trim();
    }
  }
  return found;
}

/** The WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** The WCAG contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT_TOKENS = ["--text", "--body", "--label", "--gold-text", "--ember"];
const THEMED_TOKENS = [
  "--bg",
  ...TEXT_TOKENS,
  "--steel",
  "--gold",
  "--plate-metal",
  "--plate-wall-1",
  "--plate-wall-5",
  "--plate-lip",
  "--plate-ink",
  "--metal-outline",
  "--metal-drop",
  "--metal-contact",
  "--metal-contact-lift",
  "--inlay-gold",
  "--inlay-steel",
  "--cut-shade",
  "--cut-lip",
  "--cut-lip-deep",
  ...Array.from({ length: 10 }, (_, index) => `--slab-${index + 1}`),
  "--slab-contact",
  "--slab-ambient",
];

describe("main theme tokens", () => {
  for (const theme of ["dark", "light"]) {
    const values = tokens(`[data-theme="${theme}"]`);

    it(`defines every themed token for the ${theme} theme`, () => {
      expect(Object.keys(values)).toEqual(
        expect.arrayContaining(THEMED_TOKENS),
      );
    });

    it(`keeps --plate-ink at WCAG AA on every --plate-metal stop in the ${theme} theme`, () => {
      const plate = values["--plate-metal"].replace(
        /var\((--[\w-]+)\)/,
        (_, name: string) => tokens(":root")[name],
      );
      const stops = plate.match(/#[0-9a-f]{6}/gi) ?? [];
      expect(stops.length).toBeGreaterThan(0);
      for (const stop of stops) {
        expect(contrast(values["--plate-ink"], stop)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });

    for (const name of TEXT_TOKENS) {
      it(`keeps ${name} at WCAG AA on --bg in the ${theme} theme`, () => {
        expect(contrast(values[name], values["--bg"])).toBeGreaterThanOrEqual(
          4.5,
        );
      });
    }
  }

  it("gives every prototype color token a light and a dark value", () => {
    const theme = css.match(/@theme static\s*\{([^}]*)\}/)?.[1] ?? "";
    const colors = [...theme.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)];
    expect(colors.length).toBeGreaterThan(0);
    for (const [, name, value] of colors) {
      expect(value, name).toMatch(/^light-dark\(/);
    }
  });

  it("sets the color scheme from data-theme on <html>", () => {
    expect(css).toMatch(
      /:root\[data-theme="dark"\]\s*\{\s*color-scheme: dark;/,
    );
    expect(css).toMatch(
      /:root\[data-theme="light"\]\s*\{\s*color-scheme: light;/,
    );
  });

  it("gives the dark values to :root", () => {
    const root = tokens(":root");
    const dark = tokens('[data-theme="dark"]');
    expect(root["--bg"]).toBe(dark["--bg"]);
  });

  it("defines the shared metals, brushing noise and view tokens", () => {
    expect(Object.keys(tokens(":root"))).toEqual(
      expect.arrayContaining([
        "--bronze-metal",
        "--steel-brushed",
        "--brush-noise",
        "--brush-noise-soft",
        "--slant",
        "--display-wght",
        "--track",
      ]),
    );
    expect(css).toMatch(/@property --lean\s*\{[^}]*initial-value: -1;/);
    expect(css).toMatch(/@property --lx\s*\{[^}]*initial-value: 70%;/);
  });

  it("builds --slab-wall from all ten slab tones and --slab-drop on .slab", () => {
    const slab = tokens(".slab");
    for (let step = 1; step <= 10; step++) {
      expect(slab["--slab-wall"]).toContain(`var(--slab-${step})`);
    }
    expect(slab["--slab-drop"]).toContain("var(--slab-contact)");
    expect(slab["--slab-drop"]).toContain("var(--slab-ambient)");
  });
});
