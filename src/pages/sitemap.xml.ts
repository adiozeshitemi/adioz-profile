/*
 * /sitemap.xml: the home page and every workflow page, as absolute URLs on
 * site.json's origin, each page path ending in a slash as the build writes
 * it.
 */
import type { APIRoute } from "astro";
import { site } from "../data/index";
import { allWorkflows } from "../lib/workflows";

/** The sitemap's page paths: the home page, then each workflow's. */
export const sitemapPaths = () => [
  "/",
  ...allWorkflows.map((workflow) => workflow.path),
];

export const GET: APIRoute = () => {
  const urls = sitemapPaths()
    .map((path) => `  <url><loc>${new URL(path, site.url).href}</loc></url>`)
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
