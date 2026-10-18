/*
 * Role periods (experience.json's `period`) as text, as `<time>` values and
 * as fractional years on a time scale. A year with a month reads "Apr 2026";
 * a year alone reads "2026".
 */
import type { RolePeriod } from "../data/types";

/** English month abbreviations, January first. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** One end of a role period: its text and its `<time datetime>` value. */
export interface PeriodPoint {
  /** "Apr 2026" with a month, "2026" without. */
  label: string;
  /** "2026-04" with a month, "2026" without. */
  datetime: string;
}

/** `year`, narrowed to `month` (1 to 12) when given, as a `PeriodPoint`. */
export function periodPoint(year: number, month?: number): PeriodPoint {
  if (month === undefined)
    return { label: String(year), datetime: String(year) };
  return {
    label: `${MONTHS[month - 1]} ${year}`,
    datetime: `${year}-${String(month).padStart(2, "0")}`,
  };
}

/** The first and last points of `period`; `end` is null while the role is ongoing. */
export function periodPoints(period: RolePeriod) {
  return {
    start: periodPoint(period.start, period.startMonth),
    end: period.end === null ? null : periodPoint(period.end, period.endMonth),
  };
}

/**
 * `period` as one line, e.g. "Apr 2026 — Present" with `ongoing` "Present",
 * or "2023 — 2025". A period that starts and ends on the same label shows
 * that label alone.
 */
export function periodLabel(period: RolePeriod, ongoing: string): string {
  const { start, end } = periodPoints(period);
  if (end === null) return `${start.label} — ${ongoing}`;
  return end.label === start.label
    ? start.label
    : `${start.label} — ${end.label}`;
}

/** Where `period` starts as a fractional year: the start of its first month, or of its first year. */
export const periodFrom = (period: RolePeriod) =>
  period.start + ((period.startMonth ?? 1) - 1) / 12;

/**
 * Where `period` ends as a fractional year: the end of its last month, or of
 * its last year; `now` while the role is ongoing.
 */
export const periodTo = (period: RolePeriod, now: number) =>
  period.end === null ? now : period.end + (period.endMonth ?? 12) / 12;
