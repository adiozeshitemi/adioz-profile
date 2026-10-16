import { describe, expect, it, vi } from "vitest";
import Header from "../src/components/Header/Header.astro";
import { navigation, sectionNumber, workflows } from "../src/data/index";
import type { Workflow } from "../src/data/types";
import { ownWorkflows, peerWorkflows } from "../src/lib/workflows";
import { stepHops } from "../src/scripts/flow";
import PeerPage, {
  getStaticPaths as peerPaths,
} from "../src/pages/workflows/peers/[slug].astro";
import OwnPage, {
  getStaticPaths as ownPaths,
} from "../src/pages/workflows/[slug].astro";
import { render, text } from "./render";

vi.mock(
  "../src/layouts/Layout.astro",
  () => import("./fixtures/BareLayout.astro"),
);

const pages = [
  ...ownWorkflows.map((workflow) => ({ workflow, Page: OwnPage })),
  ...peerWorkflows.map((workflow) => ({ workflow, Page: PeerPage })),
];

const pad = (value: number) => String(value).padStart(2, "0");

const renderPage = (workflow: Workflow, Page: typeof OwnPage) =>
  render(Page, {
    params: { slug: workflow.slug },
    props: { workflow },
    request: new Request(`https://example.com${workflow.path}`),
  });

describe("workflow page routes", () => {
  it("generates a page per workflow, peers under /workflows/peers/", () => {
    expect(ownPaths()).toEqual(
      ownWorkflows.map((workflow) => ({
        params: { slug: workflow.slug },
        props: { workflow },
      })),
    );
    expect(peerPaths()).toEqual(
      peerWorkflows.map((workflow) => ({
        params: { slug: workflow.slug },
        props: { workflow },
      })),
    );
    expect(peerWorkflows.every((w) => w.path.startsWith("/workflows/peers/")));
  });
});

describe.each(pages)("$workflow.path", ({ workflow, Page }) => {
  it("is titled and described by the workflow", async () => {
    const doc = await renderPage(workflow, Page);
    const layout = doc.querySelector("template")!;
    expect(layout.dataset.title).toBe(
      `${workflow.title} · ${workflows.page.titleSuffix}`,
    );
    expect(layout.dataset.description).toBe(workflow.summary);
    expect(layout.dataset.previewDescription).toBe(workflow.summary);
  });

  it("has the section's eyebrow, one h1, the landmarks, and a single element per id", async () => {
    const doc = await renderPage(workflow, Page);
    expect(text(doc.querySelector(".head .eyebrow"))).toBe(
      `${pad(sectionNumber(workflows.id))} ${workflows.label}`,
    );
    expect(text(doc.querySelector("h1"))).toBe(workflow.title);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelectorAll("body > header")).toHaveLength(1);
    expect(doc.querySelectorAll("body > main")).toHaveLength(1);
    expect(doc.querySelectorAll("body > footer")).toHaveLength(1);
    const ids = [...doc.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const link of [...navigation.links, navigation.cta]) {
      expect(ids, link.url).not.toContain(link.url.slice(1));
    }
  });

  it("lists every step in order, with its hops and failure mode, readable without JavaScript", async () => {
    const doc = await renderPage(workflow, Page);
    const items = [...doc.querySelectorAll("ol.steps > li")];
    expect(items.map((item) => text(item.querySelector("h3")))).toEqual(
      workflow.steps.map((step) => step.title),
    );
    const hops = stepHops(workflow.steps, workflow.edges);
    items.forEach((item, index) => {
      const step = workflow.steps[index]!;
      expect(item.closest("[hidden]")).toBeNull();
      expect(item.getAttribute("data-lights")).toBe(step.lights.join(" "));
      expect(item.getAttribute("data-hops")).toBe(hops[index]!.join(" "));
      expect(item.querySelectorAll(".step-hops").length).toBe(
        hops[index]!.length > 0 ? 1 : 0,
      );
      expect(text(item.querySelector(".step-failure"))).toBe(
        step.failure ? `${workflows.page.failure} ${step.failure}` : "",
      );
    });
  });

  it("draws each node in its cell and each edge as a channel of line and head paths, the figure named for assistive technology", async () => {
    const doc = await renderPage(workflow, Page);
    const flow = doc.querySelector("figure.flow")!;
    expect(flow.getAttribute("role")).toBe("img");
    expect(flow.getAttribute("aria-label")).toBe(workflows.page.diagram);
    const nodes = [
      ...flow.querySelectorAll<HTMLElement>(".flow-stage > [data-node]"),
    ];
    expect(nodes.map((node) => node.dataset.node)).toEqual(
      workflow.nodes.map((node) => node.id),
    );
    nodes.forEach((node, index) => {
      const { col, row } = workflow.nodes[index]!;
      expect(node.getAttribute("style")).toBe(
        `grid-column: ${col + 1}; grid-row: ${row + 1}`,
      );
    });
    const wires = [...flow.querySelectorAll<SVGGElement>(".flow-wires .wire")];
    expect(wires.map((wire) => [wire.dataset.from, wire.dataset.to])).toEqual(
      workflow.edges.map((edge) => [edge.from, edge.to]),
    );
    for (const wire of wires) {
      expect(
        wire.querySelectorAll('path[data-shape="line"]').length,
      ).toBeGreaterThan(0);
      expect(
        wire.querySelectorAll('path[data-shape="head"]').length,
      ).toBeGreaterThan(0);
    }
  });

  it("pairs each weak point with its compensation, when the workflow names any", async () => {
    const doc = await renderPage(workflow, Page);
    const rows = [...doc.querySelectorAll(".compensations li")];
    const { compensations: labels } = workflows.page;
    expect(
      rows.map((row) => [
        text(row.querySelector(".weakness")),
        text(row.querySelector(".compensation")),
      ]),
    ).toEqual(
      (workflow.compensations ?? []).map((item) => [
        `${labels.weakness} ${item.weakness.replaceAll("**", "")}`,
        `${labels.compensation} ${item.compensation.replaceAll("**", "")}`,
      ]),
    );
  });

  it("renders the step dial hidden, as a slider across the steps", async () => {
    const doc = await renderPage(workflow, Page);
    const dial = doc.querySelector<HTMLElement>(".step-dial")!;
    expect(dial.hasAttribute("hidden")).toBe(true);
    const slider = dial.querySelector("[role=slider]")!;
    expect(slider.getAttribute("aria-valuemax")).toBe(
      String(workflow.steps.length),
    );
    expect(slider.getAttribute("aria-valuetext")).toBe(
      `1 ${workflows.page.dial.of} ${workflow.steps.length}: ${workflow.steps[0]!.title}`,
    );
    expect(dial.querySelectorAll(".dial-ticks line")).toHaveLength(
      workflow.steps.length,
    );
  });

  it("points the header home, marks Workflows current, and links back to the section", async () => {
    const doc = await renderPage(workflow, Page);
    const rail = [...doc.querySelectorAll(".site-header .rail a")];
    expect(rail.map((link) => link.getAttribute("href"))).toEqual(
      navigation.links.map((link) => `/${link.url}`),
    );
    expect(
      rail
        .filter((link) => link.hasAttribute("aria-current"))
        .map((link) => link.getAttribute("href")),
    ).toEqual([`/#${workflows.id}`]);
    expect(
      [...doc.querySelectorAll("#site-menu a")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([...navigation.links, navigation.cta].map((l) => `/${l.url}`));
    expect(
      doc.querySelector(".site-header a.contact")?.getAttribute("href"),
    ).toBe(`/${navigation.cta.url}`);
    expect(doc.querySelector("a.brand")?.getAttribute("href")).toBe("/");
    expect(doc.querySelector(".back a")?.getAttribute("href")).toBe(
      `/#${workflows.id}`,
    );
  });

  it("credits a peer's author with their links, and no one else", async () => {
    const doc = await renderPage(workflow, Page);
    const credit = doc.querySelector(".credit");
    if (!workflow.author) {
      expect(credit).toBeNull();
      return;
    }
    expect(text(credit!.querySelector(".credit-label"))).toBe(
      workflows.contributedBy,
    );
    expect(text(credit!.querySelector(".credit-name"))).toBe(
      workflow.author.name,
    );
    expect(
      [...credit!.querySelectorAll("a")].map((a) => [
        a.getAttribute("href"),
        a.getAttribute("target"),
      ]),
    ).toEqual(workflow.author.links.map((link) => [link.url, "_blank"]));
  });
});

describe("Header on the home page", () => {
  it("keeps same-page section links, the back-to-top mark and no current link", async () => {
    const doc = await render(Header);
    expect(
      [...doc.querySelectorAll(".rail a")].map((a) => a.getAttribute("href")),
    ).toEqual(navigation.links.map((link) => link.url));
    expect(doc.querySelectorAll(".rail a[aria-current]")).toHaveLength(0);
    expect(doc.querySelector("a.brand")?.getAttribute("href")).toBe("#top");
  });
});
