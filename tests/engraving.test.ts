import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import EngravingFilters from "../src/components/UI/EngravingFilters.astro";
import { render } from "./render";

const read = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const engraving = read("styles/engraving.css");
const global = read("styles/global.css");
const layout = read("layouts/Layout.astro");

const FILTERS = ["engrave", "carve", "dial-groove", "mark-raise", "dial-raise"];
const GRADIENTS = [
  "mark-steel",
  "mark-gold",
  "mark-steel-bright",
  "mark-gold-bright",
];

/** The declarations of the rule in engraving.css whose selector list is exactly `selector`. */
function rule(selector: string): string {
  for (const [, prelude, body] of engraving.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = prelude
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((part) => part.trim());
    if (selectors.join(", ") === selector) return body;
  }
  return "";
}

describe("engraving filters", () => {
  it("renders the filters and the mark's gradients in one hidden, zero-size SVG", async () => {
    const doc = await render(EngravingFilters);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("width")).toBe("0");
    expect(svg?.getAttribute("height")).toBe("0");
    expect(
      [...doc.querySelectorAll("filter")].map((filter) => filter.id),
    ).toEqual(FILTERS);
    expect(
      [...doc.querySelectorAll("linearGradient")].map(
        (gradient) => gradient.id,
      ),
    ).toEqual(GRADIENTS);
    for (const filter of doc.querySelectorAll("filter")) {
      expect(filter.children.length, filter.id).toBeGreaterThan(0);
      expect(filter.getAttribute("color-interpolation-filters")).toBe("sRGB");
    }
  });

  it("is rendered once by the layout", () => {
    expect(layout).toMatch(/import EngravingFilters from/);
    expect(layout.match(/<EngravingFilters \/>/g)).toHaveLength(1);
  });

  it("refers only to filters the SVG defines", () => {
    for (const [, id] of engraving.matchAll(/url\(#([\w-]+)\)/g)) {
      expect(FILTERS).toContain(id);
    }
  });
});

describe("engraved text styles", () => {
  it("imports the styles after the tokens", () => {
    expect(global.indexOf('@import "./engraving.css"')).toBeGreaterThan(
      global.indexOf('@import "./theme.css"'),
    );
  });

  it("clips each fill to the glyphs", () => {
    for (const selector of [".engraved", ".carved", ".inlaid, .inlaid-steel"]) {
      const body = rule(selector);
      expect(body, selector).toContain("background-clip: text");
      expect(body, selector).toContain("-webkit-text-fill-color: transparent");
    }
  });

  it("gives engraved text a shadowed top lip and a lit bottom lip", () => {
    const filter = rule(".engraved").match(/filter:([^;]+);/)?.[1] ?? "";
    expect(filter).toMatch(/drop-shadow\(0 -1px 0 #000\)/);
    expect(filter).toMatch(/drop-shadow\(0 1px 0 rgb\(255 255 255/);
  });

  it("carves into the plate metal through #carve", () => {
    const body = rule(".carved");
    expect(body).toContain("var(--plate-metal)");
    expect(body).toContain("filter: url(#carve)");
  });

  it("inlays gold under a deep cut and steel under a shallow one", () => {
    expect(rule(".inlaid")).toContain("var(--inlay-gold)");
    expect(rule(".inlaid")).toContain("var(--cut-lip-deep)");
    expect(rule(".inlaid-steel")).toContain("var(--inlay-steel)");
    expect(rule(".inlaid-steel")).toContain("var(--cut-lip)");
  });

  it("engraves icons through #engrave", () => {
    expect(rule(".engraved-icon")).toContain("filter: url(#engrave)");
  });
});
