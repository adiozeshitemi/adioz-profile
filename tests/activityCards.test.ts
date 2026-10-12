import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { activity, experience } from "../src/data/index";
import type { GitHubActivity } from "../src/data/types";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  contributionsCard,
  escapeXml,
  languagesCard,
} from "../src/lib/activityCards";
import { LANGUAGE_LOGOS } from "../src/lib/activity";
import { GET as contributionsRoute } from "../src/pages/activity/contributions.svg";
import { GET as languagesRoute } from "../src/pages/activity/languages.svg";

const labels = experience.activity;

/** Parses `svg` as an SVG document; a parse error leaves a `parsererror` element. */
function parse(svg: string): Document {
  return new new Window().DOMParser().parseFromString(
    svg,
    "image/svg+xml",
  ) as unknown as Document;
}

/** Every text node of the SVG, trimmed, in document order. */
function texts(doc: Document): string[] {
  return [...doc.querySelectorAll("text")].map((node) =>
    (node.textContent ?? "").trim(),
  );
}

const FIXTURE: GitHubActivity = {
  login: "octo",
  fetchedAt: "2026-10-12",
  firstContribution: "2024-03-02",
  total: 1234,
  years: [
    { year: 2024, total: 0 },
    { year: 2025, total: 1000 },
    { year: 2026, total: 234 },
  ],
  currentStreak: { length: 0, start: null, end: null },
  longestStreak: { length: 1, start: "2025-05-05", end: "2025-05-05" },
  languages: [{ name: "C & <C++>", color: null, bytes: 10 }],
};

describe("activity cards", () => {
  it("escapes XML special characters", () => {
    expect(escapeXml(`a & <b> "c"`)).toBe("a &amp; &lt;b&gt; &quot;c&quot;");
  });

  for (const [name, render] of [
    ["contributions", contributionsCard],
    ["languages", languagesCard],
  ] as const) {
    it(`renders the ${name} card as a self-contained SVG named by its alt text`, () => {
      const svg = render(activity, labels);
      const doc = parse(svg);
      const root = doc.documentElement;
      expect(root.tagName.toLowerCase()).toBe("svg");
      expect(doc.querySelector("parsererror")).toBeNull();
      expect(root.getAttribute("width")).toBe(String(CARD_WIDTH));
      expect(root.getAttribute("height")).toBe(String(CARD_HEIGHT));
      expect(root.getAttribute("role")).toBe("img");
      expect(doc.querySelector("title")?.textContent).toBe(labels.cards[name]);
      expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(
        /https?:|<image|@import|@font-face|href=/,
      );
    });
  }

  it("shows the total, both streaks and every year on the contributions card", () => {
    const doc = parse(contributionsCard(activity, labels));
    const all = texts(doc);
    expect(all).toContain(activity.total.toLocaleString("en-US"));
    expect(all).toContain(labels.currentStreak.toUpperCase());
    expect(all).toContain(labels.longestStreak.toUpperCase());
    for (const { year } of activity.years) {
      expect(all).toContain(String(year));
    }
  });

  it("fills only years with contributions, the latest in gold", () => {
    const doc = parse(contributionsCard(FIXTURE, labels));
    const fills = [...doc.querySelectorAll("rect")].filter((rect) =>
      /url\(#(gold|steel)\)/.test(rect.getAttribute("fill") ?? ""),
    );
    expect(fills.map((rect) => rect.getAttribute("fill"))).toEqual([
      "url(#steel)",
      "url(#gold)",
    ]);
    const all = texts(doc);
    expect(all).toContain(labels.noStreak);
    expect(all.some((text) => text.startsWith(`1${labels.day}`))).toBe(true);
  });

  it("draws each mapped language's logo in its brand colour on brushed steel", () => {
    const doc = parse(languagesCard(activity, labels));
    const icons = [...doc.querySelectorAll("svg svg path")];
    const mapped = activity.languages
      .slice(0, 6)
      .filter((language) => LANGUAGE_LOGOS[language.name]);
    expect(icons.map((icon) => icon.getAttribute("fill"))).toEqual(
      mapped.map((language) => LANGUAGE_LOGOS[language.name]!.color),
    );
    expect(doc.querySelector("rect")?.getAttribute("fill")).toBe("url(#steel)");
    expect(
      parse(languagesCard(FIXTURE, labels)).querySelector("svg svg"),
    ).toBeNull();
  });

  it("names each language with its share, escaping its name", () => {
    const svg = languagesCard(FIXTURE, labels);
    expect(svg).toContain("C &amp; &lt;C++&gt;");
    const all = texts(parse(svg));
    expect(all).toContain("C & <C++>");
    expect(all).toContain("100.0%");
  });

  it("serves both cards as SVG", async () => {
    for (const route of [contributionsRoute, languagesRoute]) {
      const response = await route({} as never);
      expect(response.headers.get("Content-Type")).toBe(
        "image/svg+xml; charset=utf-8",
      );
      expect(await response.text()).toMatch(/^<svg /);
    }
  });
});
