/*
 * Writes src/data/activity.json, the snapshot builds use without a token,
 * from the GraphQL API with the GITHUB_ACTIVITY_TOKEN environment variable.
 * Exits with status 1 when the variable is unset or the request fails.
 */
import { writeFile } from "node:fs/promises";
import { fetchActivity } from "../src/lib/github.ts";

const token = process.env.GITHUB_ACTIVITY_TOKEN;
if (!token) {
  console.error("GITHUB_ACTIVITY_TOKEN is not set.");
  process.exit(1);
}

const activity = await fetchActivity(token);
const file = new URL("../src/data/activity.json", import.meta.url);
await writeFile(file, `${JSON.stringify(activity, null, 2)}\n`);
console.log(
  `Wrote activity.json: ${activity.total} contributions since ${activity.firstContribution}, ${activity.languages.length} languages.`,
);
