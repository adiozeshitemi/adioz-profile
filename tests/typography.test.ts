import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../src/styles/${path}`, import.meta.url), "utf8");
const theme = read("theme.css");
const global = read("global.css");
const typography = read("typography.css");

/** The [low, high] weight range of the @font-face rule for `family` in global.css. */
function weights(family: string): [number, number] {
  const face = [...global.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map(([, body]) => body)
    .find((body) => body.includes(`"${family}"`));
  const [, low, high] = face?.match(/font-weight:\s*(\d+)\s+(\d+);/) ?? [];
  return [Number(low), Number(high)];
}

/** The declarations of the rule in typography.css whose selector list is exactly `selector`. */
function rule(selector: string): string {
  for (const [, prelude, body] of typography.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    const selectors = prelude
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((part) => part.trim());
    if (selectors.join(", ") === selector) return body;
  }
  return "";
}

describe("main typography", () => {
  it("sets the display weight to 650", () => {
    expect(theme).toMatch(/--display-wght:\s*650;/);
  });

  it("self-hosts Montserrat at the display weight and JetBrains Mono at the label weights", () => {
    const [sansLow, sansHigh] = weights("Montserrat");
    expect(sansLow).toBeLessThanOrEqual(400);
    expect(sansHigh).toBeGreaterThanOrEqual(700);
    const [monoLow, monoHigh] = weights("JetBrains Mono");
    expect(monoLow).toBeLessThanOrEqual(400);
    expect(monoHigh).toBeGreaterThanOrEqual(700);
  });

  it("imports the text styles after the tokens", () => {
    expect(global.indexOf('@import "./typography.css"')).toBeGreaterThan(
      global.indexOf('@import "./theme.css"'),
    );
  });

  it("sets the titles in Montserrat at the display weight", () => {
    for (const selector of [".display", ".h2"]) {
      expect(rule(selector), selector).toContain("font-size");
    }
    const shared = rule(".display, .h2");
    expect(shared).toContain("font-family: var(--font-sans)");
    expect(shared).toContain("font-weight: var(--display-wght)");
  });

  it("sets the section number in JetBrains Mono on the plate metal", () => {
    const body = rule(".eyebrow-no");
    expect(body).toContain("font-family: var(--font-mono)");
    expect(body).toContain("var(--plate-metal)");
    expect(body).toContain("color: var(--plate-ink)");
  });

  it("sets the label in gold spaced capitals", () => {
    const body = rule(".eyebrow");
    expect(body).toContain("color: var(--gold-text)");
    expect(body).toContain("text-transform: uppercase");
  });
});
