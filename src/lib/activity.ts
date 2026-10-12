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

/**
 * Gradient stops of the language metals, top to bottom, in segment order:
 * gold, steel, bronze, copper, dark steel and pale gold for the first six
 * languages, then gunmetal (the last) for `other`. The activity panel's
 * `.metal-0` to `.metal-5` and `.metal-other` paint the same metals in CSS.
 */
export const METALS: [number, string][][] = [
  [
    [0, "#fbe7a6"],
    [0.44, "#e2bb57"],
    [0.56, "#c4952f"],
    [1, "#f0d27f"],
  ],
  [
    [0, "#f1f3f5"],
    [0.46, "#d3d7dc"],
    [0.56, "#b8bec5"],
    [1, "#e1e4e8"],
  ],
  [
    [0, "#f2c08a"],
    [0.46, "#c27f42"],
    [0.64, "#b8743a"],
    [1, "#e8b072"],
  ],
  [
    [0, "#f0b08c"],
    [0.52, "#b8643e"],
    [1, "#d98a63"],
  ],
  [
    [0, "#8f98a3"],
    [0.52, "#5a616b"],
    [1, "#7d8590"],
  ],
  [
    [0, "#f7efcf"],
    [0.52, "#c9b47a"],
    [1, "#e6d8a6"],
  ],
  [
    [0, "#4a515a"],
    [0.52, "#2b3138"],
    [1, "#3a4048"],
  ],
];

/** The index in `METALS` of the segment at `index`: its own metal, or gunmetal for `other` and past the sixth. */
export function metalIndex(index: number, isOther: boolean): number {
  return isOther || index >= METALS.length - 1 ? METALS.length - 1 : index;
}

/** A language's logo: its icon in src/icons/ and its brand colour. */
export interface LanguageLogo {
  /** File name in src/icons/ without ".svg", e.g. "lang-rust". */
  icon: string;
  /** The brand colour Simple Icons gives the logo, as `#RRGGBB`. */
  color: string;
}

/**
 * The logo of each language name GitHub reports, from Simple Icons 16.30.0
 * with its brand colour; a language missing here shows its metal swatch
 * alone.
 */
export const LANGUAGE_LOGOS: Record<string, LanguageLogo> = {
  Astro: { icon: "lang-astro", color: "#BC52EE" },
  C: { icon: "lang-c", color: "#A8B9CC" },
  "C++": { icon: "lang-cplusplus", color: "#00599C" },
  CSS: { icon: "lang-css", color: "#663399" },
  Dart: { icon: "lang-dart", color: "#0175C2" },
  Dockerfile: { icon: "lang-docker", color: "#2496ED" },
  Go: { icon: "lang-go", color: "#00ADD8" },
  Groovy: { icon: "lang-groovy", color: "#4298B8" },
  HTML: { icon: "lang-html", color: "#E34F26" },
  Java: { icon: "lang-java", color: "#000000" },
  JavaScript: { icon: "lang-javascript", color: "#F7DF1E" },
  "Jupyter Notebook": { icon: "lang-jupyter", color: "#F37626" },
  Kotlin: { icon: "lang-kotlin", color: "#7F52FF" },
  PHP: { icon: "lang-php", color: "#777BB4" },
  PLpgSQL: { icon: "lang-postgresql", color: "#4169E1" },
  Python: { icon: "lang-python", color: "#3776AB" },
  Ruby: { icon: "lang-ruby", color: "#CC342D" },
  Rust: { icon: "lang-rust", color: "#000000" },
  SCSS: { icon: "lang-sass", color: "#CC6699" },
  Scala: { icon: "lang-scala", color: "#DC322F" },
  Shell: { icon: "lang-shell", color: "#4EAA25" },
  Swift: { icon: "lang-swift", color: "#F05138" },
  TypeScript: { icon: "lang-typescript", color: "#3178C6" },
};

/** One segment of the language bar. */
export interface LanguageSegment {
  /** The language's name, or the `other` label for the languages after the first `limit`. */
  name: string;
  /** Share of all bytes, 0 to 1. */
  share: number;
  /** The language's logo; absent for `other` and for languages without one. */
  logo?: LanguageLogo;
  /** Whether the segment sums the languages after the first `limit`. */
  other: boolean;
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
  const segments: LanguageSegment[] = languages
    .slice(0, limit)
    .map((language) => {
      const logo = LANGUAGE_LOGOS[language.name];
      return {
        name: language.name,
        share: language.bytes / total,
        other: false,
        ...(logo && { logo }),
      };
    });
  const rest = languages
    .slice(limit)
    .reduce((sum, language) => sum + language.bytes, 0);
  if (rest > 0) {
    segments.push({ name: other, share: rest / total, other: true });
  }
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
