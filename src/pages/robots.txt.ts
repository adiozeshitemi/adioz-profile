/*
 * /robots.txt: lets every crawler read the whole site and points it to
 * /sitemap.xml on site.json's origin.
 */
import type { APIRoute } from "astro";
import { site } from "../data/index";

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", site.url).href}\n`,
    { headers: { "Content-Type": "text/plain" } },
  );
