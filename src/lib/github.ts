/*
 * Reads the GitHub activity of a token's owner from the GitHub GraphQL API:
 * the contribution calendar of every year with contributions (private
 * contributions included, as the owner's profile shows them) and the language
 * bytes of the owner's non-fork repositories. The calculations are pure
 * functions over calendar days, so they run without the API.
 */
import type {
  ContributionStreak,
  ContributionYear,
  GitHubActivity,
  LanguageShare,
} from "../data/types";

/** The GitHub GraphQL endpoint. */
export const GRAPHQL_URL = "https://api.github.com/graphql";

/** One day of a contribution calendar. */
export interface ContributionDay {
  /** The day as `YYYY-MM-DD`. */
  date: string;
  /** Contributions on the day. */
  count: number;
}

/** The languages of one repository, as GitHub reports them. */
export interface RepositoryLanguages {
  edges: { size: number; node: { name: string; color: string | null } }[];
}

/** The `fetch` signature `fetchActivity` calls; tests pass a fake. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const DAY_MS = 86_400_000;

/** The `YYYY-MM-DD` day `offset` days after `date`, counted in UTC. */
export function addDays(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The `YYYY-MM-DD` UTC day of `now`. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const NO_STREAK: ContributionStreak = { length: 0, start: null, end: null };

/**
 * The longest run of consecutive days with contributions in `days`, which may
 * be in any order; a day missing from `days` breaks a run. The latest run wins
 * a tie.
 */
export function longestStreak(days: ContributionDay[]): ContributionStreak {
  const active = days
    .filter((day) => day.count > 0)
    .map((day) => day.date)
    .sort();
  let best = NO_STREAK;
  let start = "";
  active.forEach((date, index) => {
    if (index === 0 || addDays(active[index - 1], 1) !== date) start = date;
    const length =
      (Date.parse(date) - Date.parse(start)) / DAY_MS + 1;
    if (length >= best.length) best = { length, start, end: date };
  });
  return best;
}

/**
 * The run of consecutive days with contributions that ends on `today`, or on
 * the day before when `today` has none yet; days after `today` are ignored.
 */
export function currentStreak(
  days: ContributionDay[],
  today: string,
): ContributionStreak {
  const counts = new Map(days.map((day) => [day.date, day.count]));
  const active = (date: string) => (counts.get(date) ?? 0) > 0;
  const end = active(today) ? today : addDays(today, -1);
  if (!active(end)) return NO_STREAK;
  let start = end;
  while (active(addDays(start, -1))) start = addDays(start, -1);
  return {
    length: (Date.parse(end) - Date.parse(start)) / DAY_MS + 1,
    start,
    end,
  };
}

/** The earliest day in `days` with a contribution, or null when there is none. */
export function firstContribution(days: ContributionDay[]): string | null {
  return (
    days
      .filter((day) => day.count > 0)
      .map((day) => day.date)
      .sort()[0] ?? null
  );
}

/** The contributions of each year in `days`, earliest year first. */
export function yearTotals(days: ContributionDay[]): ContributionYear[] {
  const totals = new Map<number, number>();
  for (const day of days) {
    const year = Number(day.date.slice(0, 4));
    totals.set(year, (totals.get(year) ?? 0) + day.count);
  }
  return [...totals]
    .sort(([a], [b]) => a - b)
    .map(([year, total]) => ({ year, total }));
}

/** The bytes of each language summed across `repositories`, most bytes first, ties by name. */
export function mergeLanguages(
  repositories: RepositoryLanguages[],
): LanguageShare[] {
  const shares = new Map<string, LanguageShare>();
  for (const { edges } of repositories) {
    for (const { size, node } of edges) {
      const share = shares.get(node.name);
      if (share) share.bytes += size;
      else shares.set(node.name, { ...node, bytes: size });
    }
  }
  return [...shares.values()].sort(
    (a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name),
  );
}

/**
 * The activity summarised from every calendar day up to `today` (later days
 * are dropped), with the owner's `login` and `languages`.
 */
export function summarizeActivity(
  login: string,
  days: ContributionDay[],
  languages: LanguageShare[],
  today: string,
): GitHubActivity {
  const past = days.filter((day) => day.date <= today);
  const years = yearTotals(past);
  return {
    login,
    fetchedAt: today,
    firstContribution: firstContribution(past),
    total: years.reduce((sum, year) => sum + year.total, 0),
    years,
    currentStreak: currentStreak(past, today),
    longestStreak: longestStreak(past),
    languages,
  };
}

/** Sends one GraphQL query as the token's owner; throws on an HTTP or GraphQL error. */
async function query<T>(
  fetcher: Fetch,
  token: string,
  text: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetcher(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "adioz-dev",
    },
    body: JSON.stringify({ query: text, variables }),
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL: HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length || !body.data) {
    const messages = body.errors?.map((error) => error.message) ?? [];
    throw new Error(`GitHub GraphQL: ${messages.join("; ") || "no data"}`);
  }
  return body.data;
}

const YEARS_QUERY = `query {
  viewer { login contributionsCollection { contributionYears } }
}`;

const CALENDAR_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const LANGUAGES_QUERY = `query($after: String) {
  viewer {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        languages(first: 100) { edges { size node { name color } } }
      }
    }
  }
}`;

interface YearsData {
  viewer: { login: string; contributionsCollection: { contributionYears: number[] } };
}

interface CalendarData {
  viewer: {
    contributionsCollection: {
      contributionCalendar: {
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

interface LanguagesData {
  viewer: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: { languages: RepositoryLanguages }[];
    };
  };
}

/** Every calendar day of `year`, from 1 January to 31 December. */
async function yearDays(
  fetcher: Fetch,
  token: string,
  year: number,
): Promise<ContributionDay[]> {
  const data = await query<CalendarData>(fetcher, token, CALENDAR_QUERY, {
    from: `${year}-01-01T00:00:00Z`,
    to: `${year}-12-31T23:59:59Z`,
  });
  return data.viewer.contributionsCollection.contributionCalendar.weeks
    .flatMap((week) => week.contributionDays)
    .filter((day) => day.date.startsWith(`${year}-`))
    .map((day) => ({ date: day.date, count: day.contributionCount }));
}

/** The languages of every non-fork repository the token's owner owns, one page of 100 at a time. */
async function repositoryLanguages(
  fetcher: Fetch,
  token: string,
): Promise<RepositoryLanguages[]> {
  const repositories: RepositoryLanguages[] = [];
  let after: string | null = null;
  do {
    const data: LanguagesData = await query<LanguagesData>(
      fetcher,
      token,
      LANGUAGES_QUERY,
      { after },
    );
    const page = data.viewer.repositories;
    repositories.push(...page.nodes.map((node) => node.languages));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return repositories;
}

/**
 * Reads the activity of `token`'s owner from the GraphQL API, counted up to
 * the UTC day of `now`. The token needs read-only Metadata on all
 * repositories for private repositories' languages.
 */
export async function fetchActivity(
  token: string,
  fetcher: Fetch = fetch,
  now: Date = new Date(),
): Promise<GitHubActivity> {
  const { viewer } = await query<YearsData>(fetcher, token, YEARS_QUERY);
  const calendars = await Promise.all(
    viewer.contributionsCollection.contributionYears.map((year) =>
      yearDays(fetcher, token, year),
    ),
  );
  const languages = mergeLanguages(await repositoryLanguages(fetcher, token));
  return summarizeActivity(viewer.login, calendars.flat(), languages, utcDay(now));
}

/** What `loadActivity` reads the activity with. */
export interface LoadOptions {
  /** A GitHub token; when missing or empty, `snapshot` is returned without a request. */
  token: string | undefined;
  /** The activity returned when there is no token or the API fails. */
  snapshot: GitHubActivity;
  fetcher?: Fetch;
  now?: Date;
  /** Receives the reason the snapshot was returned after a failed request. */
  warn?: (message: string) => void;
}

/**
 * The activity read from the API with `token`, or `snapshot` when there is no
 * token or the request fails, so a build never fails on the API.
 */
export async function loadActivity({
  token,
  snapshot,
  fetcher = fetch,
  now = new Date(),
  warn = console.warn,
}: LoadOptions): Promise<GitHubActivity> {
  if (!token) return snapshot;
  try {
    return await fetchActivity(token, fetcher, now);
  } catch (error) {
    warn(
      `GitHub activity: using the activity.json snapshot (${error instanceof Error ? error.message : String(error)})`,
    );
    return snapshot;
  }
}
