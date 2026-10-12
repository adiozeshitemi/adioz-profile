import { describe, expect, it } from "vitest";
import ActivityPanel from "../src/components/Activity/ActivityPanel.astro";
import ExperienceSection from "../src/components/Experience/ExperienceSection.astro";
import { activity, experience } from "../src/data/index";
import { existsSync } from "node:fs";
import {
  formatDay,
  formatShare,
  formatSpan,
  getActivity,
  LANGUAGE_LOGOS,
  languageSegments,
  METALS,
  metalIndex,
  OTHER_LOGO,
  yearColumns,
} from "../src/lib/activity";
import { reelIndex } from "../src/scripts/odometer";
import { render, text } from "./render";

describe("activity layout", () => {
  it("scales each year's column to the busiest year", () => {
    expect(
      yearColumns([
        { year: 2024, total: 50 },
        { year: 2025, total: 200 },
        { year: 2026, total: 0 },
      ]).map((column) => column.height),
    ).toEqual([0.25, 1, 0]);
    expect(yearColumns([{ year: 2025, total: 0 }])[0]!.height).toBe(0);
  });

  it("names the first languages and sums the rest as other", () => {
    const languages = [
      { name: "Rust", color: null, bytes: 50 },
      { name: "Go", color: null, bytes: 30 },
      { name: "C", color: null, bytes: 15 },
      { name: "Shell", color: null, bytes: 5 },
    ];
    expect(languageSegments(languages, 2, "Other")).toEqual([
      {
        name: "Rust",
        share: 0.5,
        other: false,
        logo: { icon: "logo-rust", color: "#000000" },
      },
      {
        name: "Go",
        share: 0.3,
        other: false,
        logo: { icon: "lang-go", color: "#00ADD8" },
      },
      { name: "Other", share: 0.2, other: true, logo: OTHER_LOGO },
    ]);
    expect(languageSegments(languages, 4, "Other")).toHaveLength(4);
    expect(languageSegments([], 6, "Other")).toEqual([]);
  });

  it("has an icon file and a brand colour for every mapped language, and OTHER_LOGO for an unmapped one", () => {
    for (const { icon, color } of Object.values(LANGUAGE_LOGOS)) {
      expect(existsSync(`src/icons/${icon}.svg`)).toBe(true);
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
    const [segment] = languageSegments(
      [{ name: "Brainfuck", color: null, bytes: 1 }],
      6,
      "Other",
    );
    expect(segment).toEqual({
      name: "Brainfuck",
      share: 1,
      other: false,
      logo: OTHER_LOGO,
    });
  });

  it("gives the first six segments their own metal and the rest gunmetal", () => {
    expect([0, 5, 6].map((index) => metalIndex(index, false))).toEqual([
      0, 5, 6,
    ]);
    expect(metalIndex(2, true)).toBe(METALS.length - 1);
  });

  it("formats days, spans and shares", () => {
    expect(formatDay("2018-08-26")).toBe("26 Aug 2018");
    expect(formatDay("2026-09-04")).toBe("4 Sep 2026");
    expect(formatSpan("2026-10-12", "2026-10-12")).toBe("12 Oct 2026");
    expect(formatSpan("2026-10-11", "2026-10-12")).toBe("11 – 12 Oct 2026");
    expect(formatSpan("2026-09-04", "2026-10-02")).toBe("4 Sep – 2 Oct 2026");
    expect(formatSpan("2025-12-30", "2026-01-02")).toBe(
      "30 Dec 2025 – 2 Jan 2026",
    );
    expect(formatShare(0.32947)).toBe("32.9%");
  });

  it("reads the snapshot when the build has no token", async () => {
    await expect(getActivity()).resolves.toBe(activity);
  });
});

describe("ActivityPanel", () => {
  const labels = experience.activity;

  it("is a plate named by its label, with the read day in its head", async () => {
    const doc = await render(ActivityPanel);
    const panel = doc.querySelector(".activity");
    expect(panel?.classList.contains("plate")).toBe(true);
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel?.getAttribute("aria-label")).toBe(labels.label);
    expect(panel?.querySelectorAll(":scope > .screw")).toHaveLength(4);
    expect(
      panel!.querySelector(".activity-head time")?.getAttribute("datetime"),
    ).toBe(activity.fetchedAt);
  });

  it("reads out the total and both streaks as text behind their drums", async () => {
    const doc = await render(ActivityPanel);
    const counters = [...doc.querySelectorAll(".counter")];
    expect(
      counters.map((counter) => text(counter.querySelector("dt"))),
    ).toEqual([labels.total, labels.currentStreak, labels.longestStreak]);
    const total = activity.total.toLocaleString("en-US");
    expect(text(counters[0]!.querySelector(".sr-only"))).toBe(total);
    const drums = counters[0]!.querySelector(".window");
    expect(drums?.getAttribute("aria-hidden")).toBe("true");
    expect(
      [...drums!.querySelectorAll(".drum")]
        .map((drum) => drum.getAttribute("data-digit") ?? ",")
        .join(""),
    ).toBe(total);
    for (const reel of drums!.querySelectorAll(".reel")) {
      const digit = Number(reel.parentElement!.getAttribute("data-digit"));
      expect(reel.getAttribute("style")).toBe(`--at: ${reelIndex(digit)}`);
    }
    const longest = counters[2]!;
    expect(text(longest.querySelector(".sr-only"))).toBe(
      String(activity.longestStreak.length),
    );
    expect(longest.querySelectorAll(".drum").length).toBeGreaterThanOrEqual(3);
  });

  it("lists every year with its total in a slot, the latest last", async () => {
    const doc = await render(ActivityPanel);
    const years = [...doc.querySelectorAll(".years > li")];
    expect(years.map((year) => text(year.querySelector(".year-name")))).toEqual(
      activity.years.map((year) => String(year.year)),
    );
    expect(
      years.map((year) => text(year.querySelector(".year-total"))),
    ).toEqual(activity.years.map((year) => year.total.toLocaleString("en-US")));
    expect(years.at(-1)?.classList.contains("latest")).toBe(true);
    for (const year of years) {
      const fill = year.querySelector(".year-fill");
      if (fill) expect(fill.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("marks years without GitHub contributions as private Gitea and Bitbucket work", async () => {
    const doc = await render(ActivityPanel);
    const empty = [...doc.querySelectorAll(".years > li")].filter(
      (year) => !year.querySelector(".year-fill"),
    );
    expect(empty.length).toBeGreaterThan(0);
    for (const year of empty) {
      expect(text(year.querySelector(".year-private"))).toBe(labels.private);
    }
    expect(text(doc.querySelector(".chart-note"))).toBe(labels.privateNote);
  });

  it("leads each language with its logo in its brand colour", async () => {
    const doc = await render(ActivityPanel);
    const langs = [...doc.querySelectorAll(".langs li")];
    expect(doc.querySelectorAll(".lang-segment")).toHaveLength(langs.length);
    expect(doc.querySelector(".lang-bar")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    const first = activity.languages[0]!;
    expect(text(langs[0]!.querySelector(".lang-name"))).toBe(first.name);
    expect(langs[0]!.querySelector(".lang-icon svg")).not.toBeNull();
    expect(
      langs[0]!.querySelector(".lang-icon > span")?.getAttribute("style"),
    ).toBe(`color: ${LANGUAGE_LOGOS[first.name]!.color}`);
    expect(
      langs.at(-1)?.querySelector(".lang-icon > span")?.getAttribute("style"),
    ).toBe(`color: ${OTHER_LOGO.color}`);
  });

  it("sits in the experience section under both views", async () => {
    const doc = await render(ExperienceSection);
    const inner = doc.querySelector(".experience .inner");
    const panel = inner?.querySelector(":scope > .activity");
    expect(panel?.previousElementSibling?.classList.contains("timeline")).toBe(
      true,
    );
  });
});
