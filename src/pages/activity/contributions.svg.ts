/* `/activity/contributions.svg`: the contributions card, written at build time. */
import type { APIRoute } from "astro";
import { experience } from "../../data/index";
import { getActivity } from "../../lib/activity";
import { contributionsCard } from "../../lib/activityCards";

export const GET: APIRoute = async () =>
  new Response(contributionsCard(await getActivity(), experience.activity), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
