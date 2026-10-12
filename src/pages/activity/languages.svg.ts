/* `/activity/languages.svg`: the languages card, written at build time. */
import type { APIRoute } from "astro";
import { experience } from "../../data/index";
import { getActivity } from "../../lib/activity";
import { languagesCard } from "../../lib/activityCards";

export const GET: APIRoute = async () =>
  new Response(languagesCard(await getActivity(), experience.activity), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
