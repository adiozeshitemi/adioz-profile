import { describe, expect, it } from "vitest";
import ActivityPanel from "../src/components/Activity/ActivityPanel.astro";
import ExperienceSection from "../src/components/Experience/ExperienceSection.astro";
import { activity, experience } from "../src/data/index";
import {
  formatDay,
  formatShare,
  formatSpan,
  getActivity,
  languageSegments,
  yearColumns,
} from "../src/lib/activity";
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
      { name: "Rust", share: 0.5 },
      { name: "Go", share: 0.3 },
      { name: "Other", share: 0.2 },
    ]);
    expect(languageSegments(languages, 4, "Other")).toHaveLength(4);
    expect(languageSegments([], 6, "Other")).toEqual([]);
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

  it("is a region named by its label, with the read day in its title bar", async () => {
    const doc = await render(ActivityPanel);
    const panel = doc.querySelector(".activity");
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel?.getAttribute("aria-label")).toBe(labels.label);
    expect(text(panel!.querySelector(".activity-bar"))).toContain(labels.title);
    expect(
      panel!.querySelector(".activity-meta time")?.getAttribute("datetime"),
    ).toBe(activity.fetchedAt);
  });

  it("reads out the total and both streaks as text", async () => {
    const doc = await render(ActivityPanel);
    const readouts = [...doc.querySelectorAll(".readout")];
    expect(
      readouts.map((readout) => text(readout.querySelector("dt"))),
    ).toEqual([labels.total, labels.currentStreak, labels.longestStreak]);
    expect(text(readouts[0]!.querySelector(".figure"))).toBe(
      activity.total.toLocaleString("en-US"),
    );
    const longest = activity.longestStreak;
    expect(text(readouts[2]!.querySelector("dd"))).toContain(
      String(longest.length),
    );
  });

  it("lists every year with its total, the latest last and gold", async () => {
    const doc = await render(ActivityPanel);
    const years = [...doc.querySelectorAll(".years > li")];
    expect(years.map((year) => text(year.querySelector(".year-name")))).toEqual(
      activity.years.map((year) => String(year.year)),
    );
    expect(years.at(-1)?.classList.contains("latest")).toBe(true);
    expect(
      years.filter((year) => year.querySelector(".year-fill")),
    ).toHaveLength(activity.years.filter((year) => year.total > 0).length);
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

  it("names each language share in the legend, the bar hidden from assistive technology", async () => {
    const doc = await render(ActivityPanel);
    const legend = [...doc.querySelectorAll(".lang-legend li")];
    const segments = doc.querySelectorAll(".lang-segment");
    expect(segments).toHaveLength(legend.length);
    expect(doc.querySelector(".lang-bar")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(text(legend[0]!.querySelector(".lang-name"))).toBe(
      activity.languages[0]!.name,
    );
    expect(legend.at(-1)?.querySelector(".swatch")?.className).toContain(
      "metal-other",
    );
  });

  it("sits in the experience section under both views", async () => {
    const doc = await render(ExperienceSection);
    const inner = doc.querySelector(".experience .inner");
    expect(inner?.lastElementChild?.classList.contains("activity")).toBe(true);
  });
});
