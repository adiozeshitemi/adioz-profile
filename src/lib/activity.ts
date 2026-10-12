import { activity as snapshot } from "../data/index";
import type { GitHubActivity } from "../data/types";
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
