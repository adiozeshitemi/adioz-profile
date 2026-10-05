import { describe, expect, it, vi } from "vitest";
import { navigation } from "../src/data/index";
import Index from "../src/pages/index.astro";
import { render } from "./render";

vi.mock(
  "../src/layouts/Layout.astro",
  () => import("./fixtures/BareLayout.astro"),
);

describe("landing page", () => {
  it("renders a section for every navigation link", async () => {
    const doc = await render(Index);
    for (const link of [...navigation.links, navigation.cta]) {
      const target = doc.getElementById(link.url.slice(1));
      expect(target?.tagName.toLowerCase(), link.url).toBe("section");
    }
  });

  it("has one h1 and the header, main and footer landmarks", async () => {
    const doc = await render(Index);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelectorAll("body > header")).toHaveLength(1);
    expect(doc.querySelectorAll("body > main")).toHaveLength(1);
    expect(doc.querySelectorAll("body > footer")).toHaveLength(1);
  });

  it("gives every id on the page a single element", async () => {
    const doc = await render(Index);
    const ids = [...doc.querySelectorAll("[id]")].map((element) => element.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
