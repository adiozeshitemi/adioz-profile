import { describe, expect, it, vi } from "vitest";
import type { GitHubActivity } from "../src/data/types";
import {
  addDays,
  currentStreak,
  fetchActivity,
  firstContribution,
  GRAPHQL_URL,
  loadActivity,
  longestStreak,
  mergeLanguages,
  summarizeActivity,
  yearTotals,
  type ContributionDay,
  type Fetch,
} from "../src/lib/github";

/** A calendar of consecutive days from `start`, one per count. */
function calendar(start: string, counts: number[]): ContributionDay[] {
  return counts.map((count, index) => ({ date: addDays(start, index), count }));
}

const SNAPSHOT: GitHubActivity = {
  login: "snapshot",
  fetchedAt: "2026-01-01",
  firstContribution: "2018-08-26",
  total: 1,
  years: [{ year: 2018, total: 1 }],
  currentStreak: { length: 0, start: null, end: null },
  longestStreak: { length: 1, start: "2018-08-26", end: "2018-08-26" },
  languages: [],
};

/** A JSON response with `body` and HTTP `status`. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/**
 * A fake GraphQL API for login "octo": contribution years 2024 and 2025, a
 * calendar per year built from `days` (with the next year's 1 January in the
 * last week, as GitHub pads a week), and two pages of repository languages.
 */
function fakeApi(days: ContributionDay[]): Fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body)) as {
      query: string;
      variables: Record<string, string | null>;
    };
    if (query.includes("contributionYears")) {
      return json({
        data: {
          viewer: {
            login: "octo",
            contributionsCollection: { contributionYears: [2025, 2024] },
          },
        },
      });
    }
    if (query.includes("contributionCalendar")) {
      const year = variables.from!.slice(0, 4);
      const contributionDays = days
        .filter((day) => day.date.startsWith(year))
        .map((day) => ({ date: day.date, contributionCount: day.count }));
      contributionDays.push({
        date: `${Number(year) + 1}-01-01`,
        contributionCount: 99,
      });
      return json({
        data: {
          viewer: {
            contributionsCollection: {
              contributionCalendar: { weeks: [{ contributionDays }] },
            },
          },
        },
      });
    }
    const first = variables.after === null;
    return json({
      data: {
        viewer: {
          repositories: {
            pageInfo: {
              hasNextPage: first,
              endCursor: first ? "page-2" : null,
            },
            nodes: [
              {
                languages: {
                  edges: [
                    {
                      size: first ? 300 : 500,
                      node: { name: "Rust", color: "#dea584" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
  });
}

describe("contribution calculations", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });

  it("finds the longest run, latest first on a tie, across a year end", () => {
    const days = calendar("2024-12-28", [1, 1, 0, 2, 3, 0, 4, 4, 0]);
    expect(longestStreak(days)).toEqual({
      length: 2,
      start: "2025-01-03",
      end: "2025-01-04",
    });
    expect(longestStreak(calendar("2024-12-30", [1, 2, 3, 0]))).toEqual({
      length: 3,
      start: "2024-12-30",
      end: "2025-01-01",
    });
  });

  it("breaks a run on a day missing from the calendar", () => {
    const days = [
      { date: "2025-03-01", count: 1 },
      { date: "2025-03-03", count: 1 },
    ];
    expect(longestStreak(days).length).toBe(1);
  });

  it("returns an empty run when no day has contributions", () => {
    const empty = { length: 0, start: null, end: null };
    expect(longestStreak(calendar("2025-01-01", [0, 0]))).toEqual(empty);
    expect(currentStreak(calendar("2025-01-01", [0, 0]), "2025-01-02")).toEqual(
      empty,
    );
  });

  it("ends the current run today, or yesterday while today has none", () => {
    const days = calendar("2025-05-01", [1, 0, 2, 5, 1]);
    expect(currentStreak(days, "2025-05-05")).toEqual({
      length: 3,
      start: "2025-05-03",
      end: "2025-05-05",
    });
    const quietToday = calendar("2025-05-01", [1, 0, 2, 5, 0]);
    expect(currentStreak(quietToday, "2025-05-05")).toEqual({
      length: 2,
      start: "2025-05-03",
      end: "2025-05-04",
    });
    const quietTwoDays = calendar("2025-05-01", [1, 2, 0, 0]);
    expect(currentStreak(quietTwoDays, "2025-05-04").length).toBe(0);
  });

  it("totals each year and finds the first contribution", () => {
    const days = calendar("2024-12-30", [0, 3, 4, 1]);
    expect(yearTotals(days, 2025)).toEqual([
      { year: 2024, total: 3 },
      { year: 2025, total: 5 },
    ]);
    expect(yearTotals(calendar("2022-06-01", [2]), 2025)).toEqual([
      { year: 2022, total: 2 },
      { year: 2023, total: 0 },
      { year: 2024, total: 0 },
      { year: 2025, total: 0 },
    ]);
    expect(yearTotals(calendar("2025-01-01", [0]), 2025)).toEqual([]);
    expect(firstContribution(days)).toBe("2024-12-31");
    expect(firstContribution(calendar("2025-01-01", [0]))).toBeNull();
  });

  it("sums language bytes across repositories, most first", () => {
    expect(
      mergeLanguages([
        {
          edges: [
            { size: 10, node: { name: "Go", color: "#00ADD8" } },
            { size: 5, node: { name: "Rust", color: "#dea584" } },
          ],
        },
        { edges: [{ size: 20, node: { name: "Rust", color: "#dea584" } }] },
        { edges: [{ size: 10, node: { name: "Astro", color: null } }] },
      ]),
    ).toEqual([
      { name: "Rust", color: "#dea584", bytes: 25 },
      { name: "Astro", color: null, bytes: 10 },
      { name: "Go", color: "#00ADD8", bytes: 10 },
    ]);
  });

  it("summarises only the days up to today", () => {
    const days = calendar("2025-12-30", [2, 1, 7]);
    const activity = summarizeActivity("octo", days, [], "2025-12-31");
    expect(activity).toMatchObject({
      fetchedAt: "2025-12-31",
      total: 3,
      years: [{ year: 2025, total: 3 }],
      currentStreak: { length: 2, end: "2025-12-31" },
    });
  });
});

describe("fetchActivity", () => {
  const days = [
    ...calendar("2024-06-10", [1, 2, 3]),
    ...calendar("2025-03-01", [4, 0, 5]),
  ];

  it("reads every contribution year and every page of languages", async () => {
    const api = fakeApi(days);
    const activity = await fetchActivity(
      "t0ken",
      api,
      new Date("2025-03-03T12:00:00Z"),
    );
    expect(activity).toEqual({
      login: "octo",
      fetchedAt: "2025-03-03",
      firstContribution: "2024-06-10",
      total: 15,
      years: [
        { year: 2024, total: 6 },
        { year: 2025, total: 9 },
      ],
      currentStreak: { length: 1, start: "2025-03-03", end: "2025-03-03" },
      longestStreak: { length: 3, start: "2024-06-10", end: "2024-06-12" },
      languages: [{ name: "Rust", color: "#dea584", bytes: 800 }],
    });
    expect(api).toHaveBeenCalledTimes(5);
    const [url, init] = vi.mocked(api).mock.calls[0];
    expect(url).toBe(GRAPHQL_URL);
    expect(new Headers(init.headers).get("Authorization")).toBe("bearer t0ken");
  });

  it("throws on an HTTP error and on GraphQL errors", async () => {
    await expect(
      fetchActivity("t0ken", async () => json({}, 401)),
    ).rejects.toThrow("HTTP 401");
    await expect(
      fetchActivity("t0ken", async () =>
        json({ errors: [{ message: "Bad credentials" }] }),
      ),
    ).rejects.toThrow("Bad credentials");
  });
});

describe("loadActivity", () => {
  it("returns the snapshot without a request when there is no token", async () => {
    const api = vi.fn<Fetch>();
    for (const token of [undefined, ""]) {
      await expect(
        loadActivity({ token, snapshot: SNAPSHOT, fetcher: api }),
      ).resolves.toBe(SNAPSHOT);
    }
    expect(api).not.toHaveBeenCalled();
  });

  it("returns the snapshot and warns when the API fails", async () => {
    const warn = vi.fn();
    const activity = await loadActivity({
      token: "t0ken",
      snapshot: SNAPSHOT,
      fetcher: async () => {
        throw new Error("network down");
      },
      warn,
    });
    expect(activity).toBe(SNAPSHOT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("network down"));
  });

  it("returns the API's activity when the request succeeds", async () => {
    const activity = await loadActivity({
      token: "t0ken",
      snapshot: SNAPSHOT,
      fetcher: fakeApi(calendar("2025-01-01", [1])),
      now: new Date("2025-01-01T08:00:00Z"),
    });
    expect(activity.login).toBe("octo");
    expect(activity.total).toBe(1);
  });
});
