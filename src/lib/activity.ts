import { activity as snapshot } from "../data/index";
import type {
  ContributionYear,
  GitHubActivity,
  LanguageShare,
} from "../data/types";
import { loadActivity } from "./github";

let pending: Promise<GitHubActivity> | undefined;

/**
 * The GitHub activity for this build, read once per build: from the GraphQL
 * API with the `GITHUB_ACTIVITY_TOKEN` environment variable, or the
 * `activity.json` snapshot when it is unset or the API fails.
 */
export function getActivity(): Promise<GitHubActivity> {
  pending ??= loadActivity({
    token: import.meta.env.GITHUB_ACTIVITY_TOKEN,
    snapshot,
  });
  return pending;
}

/** A year's column in the activity panel. */
export interface YearColumn extends ContributionYear {
  /** Column height as a fraction of the busiest year's, 0 to 1. */
  height: number;
}

/** Each year's column, scaled so the busiest year reaches 1; all 0 when no year has contributions. */
export function yearColumns(years: ContributionYear[]): YearColumn[] {
  const most = Math.max(0, ...years.map((year) => year.total));
  return years.map((year) => ({
    ...year,
    height: most === 0 ? 0 : year.total / most,
  }));
}

/** One segment of the language bar. */
export interface LanguageSegment {
  /** The language's name, or the `other` label for the languages after the first `limit`. */
  name: string;
  /** Share of all bytes, 0 to 1. */
  share: number;
}

/**
 * The first `limit` languages of `languages` (most bytes first) with their
 * shares of all bytes, then one `other` segment summing the rest when there
 * is a rest. Empty when there are no bytes.
 */
export function languageSegments(
  languages: LanguageShare[],
  limit: number,
  other: string,
): LanguageSegment[] {
  const total = languages.reduce((sum, language) => sum + language.bytes, 0);
  if (total === 0) return [];
  const segments = languages.slice(0, limit).map((language) => ({
    name: language.name,
    share: language.bytes / total,
  }));
  const rest = languages
    .slice(limit)
    .reduce((sum, language) => sum + language.bytes, 0);
  if (rest > 0) segments.push({ name: other, share: rest / total });
  return segments;
}

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

/** The day, month and year of a `YYYY-MM-DD` day. */
function parts(day: string): { day: number; month: string; year: string } {
  const [year, month, date] = day.split("-");
  return {
    day: Number(date),
    month: MONTHS[Number(month) - 1]!,
    year: year!,
  };
}

/** A `YYYY-MM-DD` day as "26 Aug 2018". */
export function formatDay(day: string): string {
  const { day: date, month, year } = parts(day);
  return `${date} ${month} ${year}`;
}

/**
 * The days from `start` to `end` (`YYYY-MM-DD`), naming a month or year once
 * when both days share it: "4 Sep – 2 Oct 2026", "11 – 12 Oct 2026", or one
 * day alone when `start` is `end`.
 */
export function formatSpan(start: string, end: string): string {
  if (start === end) return formatDay(start);
  const from = parts(start);
  const to = parts(end);
  if (from.year !== to.year) return `${formatDay(start)} – ${formatDay(end)}`;
  if (from.month !== to.month) {
    return `${from.day} ${from.month} – ${formatDay(end)}`;
  }
  return `${from.day} – ${formatDay(end)}`;
}

/** A share from 0 to 1 as a percentage with one decimal, e.g. "37.1%". */
export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
