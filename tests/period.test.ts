import { describe, expect, it } from "vitest";
import {
  periodFrom,
  periodLabel,
  periodPoint,
  periodPoints,
  periodTo,
} from "../src/lib/period";

describe("periodPoint", () => {
  it("reads a year alone as the year", () => {
    expect(periodPoint(2025)).toEqual({ label: "2025", datetime: "2025" });
  });

  it("reads a year with a month as the month's abbreviation and the year", () => {
    expect(periodPoint(2026, 4)).toEqual({
      label: "Apr 2026",
      datetime: "2026-04",
    });
    expect(periodPoint(2026, 12).label).toBe("Dec 2026");
  });
});

describe("periodLabel", () => {
  it("joins the start and end with a dash", () => {
    expect(
      periodLabel({ start: 2025, end: 2026, endMonth: 4 }, "Present"),
    ).toBe("2025 — Apr 2026");
  });

  it("ends an ongoing role with the ongoing text", () => {
    expect(
      periodLabel({ start: 2026, startMonth: 4, end: null }, "Present"),
    ).toBe("Apr 2026 — Present");
    expect(periodPoints({ start: 2026, end: null }).end).toBeNull();
  });

  it("shows a period that starts and ends on the same label once", () => {
    expect(periodLabel({ start: 2024, end: 2024 }, "Present")).toBe("2024");
    expect(
      periodLabel(
        { start: 2024, startMonth: 3, end: 2024, endMonth: 9 },
        "Present",
      ),
    ).toBe("Mar 2024 — Sep 2024");
  });
});

describe("period bounds", () => {
  it("starts at the start of the first month, or of the first year", () => {
    expect(periodFrom({ start: 2026, startMonth: 4, end: null })).toBeCloseTo(
      2026 + 3 / 12,
    );
    expect(periodFrom({ start: 2025, end: null })).toBe(2025);
  });

  it("ends at the end of the last month, or of the last year, or at now", () => {
    expect(
      periodTo({ start: 2025, end: 2026, endMonth: 4 }, 2026.8),
    ).toBeCloseTo(2026 + 4 / 12);
    expect(periodTo({ start: 2018, end: 2024 }, 2026.8)).toBe(2025);
    expect(periodTo({ start: 2026, end: null }, 2026.8)).toBe(2026.8);
  });
});
