import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { site } from "../src/data/index";
import { allWorkflows } from "../src/lib/workflows";
import { GET as robots } from "../src/pages/robots.txt";
import { GET as sitemap, sitemapPaths } from "../src/pages/sitemap.xml";

describe("sitemap and robots", () => {
  it("lists the home page and every workflow page on the site's origin", async () => {
    expect(sitemapPaths()).toEqual(["/", ...allWorkflows.map((w) => w.path)]);
    const xml = await (await sitemap({} as never)).text();
    const doc = new new Window().DOMParser().parseFromString(
      xml,
      "application/xml",
    );
    expect(
      [...doc.getElementsByTagName("loc")].map((loc) => loc.textContent),
    ).toEqual(sitemapPaths().map((path) => new URL(path, site.url).href));
  });

  it("allows every crawler and points to the sitemap", async () => {
    const body = await (await robots({} as never)).text();
    expect(body).toContain("User-agent: *\nAllow: /");
    expect(body).toContain(`Sitemap: ${site.url}/sitemap.xml`);
  });
});
