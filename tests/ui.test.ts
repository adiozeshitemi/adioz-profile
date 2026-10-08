import { describe, expect, it } from "vitest";
import Badge from "../src/components/UI/Badge.astro";
import Button from "../src/components/UI/Button.astro";
import Emphasis from "../src/components/UI/Emphasis.astro";
import Icon from "../src/components/UI/Icon.astro";
import Knob from "../src/components/UI/Knob.astro";
import Lamp from "../src/components/UI/Lamp.astro";
import Nameplate from "../src/components/UI/Nameplate.astro";
import Panel from "../src/components/UI/Panel.astro";
import Plate from "../src/components/UI/Plate.astro";
import Screw from "../src/components/UI/Screw.astro";
import Section from "../src/components/UI/Section.astro";
import SectionHeader from "../src/components/UI/SectionHeader.astro";
import StatBanner from "../src/components/UI/StatBanner.astro";
import StatCard from "../src/components/UI/StatCard.astro";
import Tag from "../src/components/UI/Tag.astro";
import { stats } from "../src/data/index";
import { render, text } from "./render";

describe("Button", () => {
  it("renders a primary link when href is set", async () => {
    const doc = await render(Button, {
      props: { href: "#work" },
      slots: { default: "View work" },
    });
    const link = doc.querySelector("a.btn");
    expect(link?.getAttribute("href")).toBe("#work");
    expect(link?.classList.contains("primary")).toBe(true);
    expect(link?.hasAttribute("target")).toBe(false);
    expect(text(link)).toBe("View work");
    expect(doc.querySelector("button")).toBeNull();
  });

  it("opens an external link in a new tab without an opener", async () => {
    const doc = await render(Button, {
      props: { href: "https://example.com", external: true },
    });
    const link = doc.querySelector("a.btn");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders a button of type button without href", async () => {
    const doc = await render(Button, { slots: { default: "Open" } });
    const button = doc.querySelector("button.btn");
    expect(button?.getAttribute("type")).toBe("button");
    expect(doc.querySelector("a")).toBeNull();
  });

  it("keeps a type passed to the button", async () => {
    const doc = await render(Button, { props: { type: "submit" } });
    expect(doc.querySelector("button")?.getAttribute("type")).toBe("submit");
  });

  it("applies the ghost variant and a trailing decorative icon", async () => {
    const doc = await render(Button, {
      props: { href: "#work", variant: "ghost", icon: "arrow-up-right" },
      slots: { default: "View work" },
    });
    const link = doc.querySelector("a.btn");
    expect(link?.classList.contains("ghost")).toBe(true);
    expect(link?.lastElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(link?.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("renders a machined accent button with an engraved label and a spun cap", async () => {
    const doc = await render(Button, {
      props: {
        href: "#work",
        variant: "accent",
        icon: "arrow-right",
        rest: 90,
      },
      slots: { default: "View selected work" },
    });
    const link = doc.querySelector("a.btn");
    expect([...(link?.classList ?? [])]).toEqual(
      expect.arrayContaining(["accent", "machined", "capped"]),
    );
    expect(text(link?.querySelector(".engrave") ?? null)).toBe(
      "View selected work",
    );
    const cap = link?.querySelector(".cap");
    expect(cap?.getAttribute("aria-hidden")).toBe("true");
    const turn = cap?.querySelector(".spun.turn");
    expect(turn?.getAttribute("data-rest")).toBe("90");
    expect(
      turn?.querySelector("svg")?.classList.contains("engraved-icon"),
    ).toBe(true);
  });

  it("renders a compact steel button without a cap when it has no icon", async () => {
    const doc = await render(Button, {
      props: { variant: "steel", compact: true },
      slots: { default: "Open" },
    });
    const button = doc.querySelector("button.btn");
    expect(button?.getAttribute("type")).toBe("button");
    expect([...(button?.classList ?? [])]).toEqual(
      expect.arrayContaining(["steel", "machined", "compact"]),
    );
    expect(button?.classList.contains("capped")).toBe(false);
    expect(button?.querySelector(".cap")).toBeNull();
  });

  it("ignores compact on the prototype variants", async () => {
    const doc = await render(Button, {
      props: { compact: true },
      slots: { default: "Open" },
    });
    expect(doc.querySelector("button.btn")?.classList.contains("compact")).toBe(
      false,
    );
  });
});

describe("Knob", () => {
  it("renders a labelled link with an engraved icon on a hidden spun face", async () => {
    const doc = await render(Knob, {
      props: {
        href: "/resume.pdf",
        label: "Download resume",
        icon: "download",
        rest: 180,
      },
    });
    const knob = doc.querySelector("a.knob");
    expect(knob?.getAttribute("href")).toBe("/resume.pdf");
    expect(knob?.getAttribute("aria-label")).toBe("Download resume");
    expect(knob?.classList.contains("compact")).toBe(false);
    const face = knob?.querySelector(".face");
    expect(face?.getAttribute("aria-hidden")).toBe("true");
    expect(face?.querySelector(".spun.turn")?.getAttribute("data-rest")).toBe(
      "180",
    );
    expect(
      face?.querySelector("svg")?.classList.contains("engraved-icon"),
    ).toBe(true);
  });

  it("renders a compact button of type button without href", async () => {
    const doc = await render(Knob, {
      props: { label: "Copy email address", icon: "email", compact: true },
    });
    const knob = doc.querySelector("button.knob");
    expect(knob?.getAttribute("type")).toBe("button");
    expect(knob?.classList.contains("compact")).toBe(true);
    expect(doc.querySelector("a")).toBeNull();
    expect(knob?.querySelector(".turn")?.hasAttribute("data-rest")).toBe(false);
  });

  it("fills the face from the default slot and names the knob from the label slot", async () => {
    const doc = await render(Knob, {
      slots: {
        default: '<svg class="custom"></svg>',
        label: '<span class="name">Switch theme</span>',
      },
    });
    const knob = doc.querySelector("button.knob");
    expect(knob?.hasAttribute("aria-label")).toBe(false);
    expect(knob?.querySelector(".face svg.custom")).not.toBeNull();
    expect(text(knob?.querySelector(".name") ?? null)).toBe("Switch theme");
    expect(knob?.querySelector(".face .name")).toBeNull();
  });
});

describe("Badge", () => {
  it("renders a tag by default", async () => {
    const doc = await render(Badge, { slots: { default: "Rust" } });
    const badge = doc.querySelector(".badge");
    expect(badge?.classList.contains("tag")).toBe(true);
    expect(text(badge)).toBe("Rust");
  });

  it("renders a chip", async () => {
    const doc = await render(Badge, {
      props: { variant: "chip" },
      slots: { default: "Kafka" },
    });
    expect(doc.querySelector(".badge")?.classList.contains("chip")).toBe(true);
  });

  it("renders a status pill with a decorative dot", async () => {
    const doc = await render(Badge, {
      props: { variant: "status" },
      slots: { default: "Available" },
    });
    const dot = doc.querySelector(".badge.status .dot");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(text(doc.querySelector(".badge"))).toBe("Available");
  });
});

describe("Icon", () => {
  it("renders a decorative SVG in currentColor at the given size", async () => {
    const doc = await render(Icon, { props: { name: "github", size: 24 } });
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.hasAttribute("role")).toBe(false);
    expect(svg?.getAttribute("fill")).toBe("currentColor");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });

  it("names a labelled icon for assistive technology", async () => {
    const doc = await render(Icon, {
      props: { name: "github", label: "GitHub" },
    });
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("GitHub");
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("throws for a name with no SVG file", async () => {
    await expect(render(Icon, { props: { name: "missing" } })).rejects.toThrow(
      'Icon "missing" has no file src/icons/missing.svg',
    );
  });
});

describe("Emphasis", () => {
  it("renders each ** pair as strong emphasis", async () => {
    const doc = await render(Emphasis, {
      props: { text: "Builds **backend systems** and **small models**." },
    });
    const strong = [...doc.querySelectorAll("strong")].map((element) =>
      text(element),
    );
    expect(strong).toEqual(["backend systems", "small models"]);
    expect(text(doc.body)).toBe("Builds backend systems and small models.");
  });

  it("throws for an unpaired **", async () => {
    await expect(
      render(Emphasis, { props: { text: "Builds **backend systems." } }),
    ).rejects.toThrow('Unpaired "**" in: Builds **backend systems.');
  });
});

describe("StatCard", () => {
  it("formats the value with its decimals and keeps the counter data", async () => {
    const doc = await render(StatCard, {
      props: {
        stat: { value: 99.5, decimals: 1, suffix: "%", label: "Uptime held" },
      },
    });
    const number = doc.querySelector("[data-count]");
    expect(text(number)).toBe("99.5");
    expect(number?.getAttribute("data-count")).toBe("99.5");
    expect(number?.getAttribute("data-decimals")).toBe("1");
    expect(text(doc.querySelector(".suffix"))).toBe("%");
    expect(text(doc.querySelector("dt"))).toBe("Uptime held");
  });

  it("shows whole numbers when decimals is omitted", async () => {
    const doc = await render(StatCard, {
      props: { stat: { value: 8, suffix: "+", label: "Years experience" } },
    });
    expect(text(doc.querySelector("[data-count]"))).toBe("8");
    expect(
      doc.querySelector("[data-count]")?.getAttribute("data-decimals"),
    ).toBe("0");
  });
});

describe("StatBanner", () => {
  it("renders every stats.json entry in order", async () => {
    const doc = await render(StatBanner);
    const list = doc.querySelector("dl.stats");
    expect(list?.getAttribute("style")).toContain(
      `--stat-count: ${stats.length}`,
    );
    const labels = [...doc.querySelectorAll("dt")].map((dt) => text(dt));
    expect(labels).toEqual(stats.map((stat) => stat.label));
  });
});

describe("SectionHeader", () => {
  it("numbers the label with two digits and ids the heading", async () => {
    const doc = await render(SectionHeader, {
      props: {
        index: 3,
        label: "Experience",
        title: "Production Trace",
        id: "x-title",
      },
    });
    expect(text(doc.querySelector(".label"))).toBe("03 — Experience");
    expect(doc.querySelector("h2")?.id).toBe("x-title");
    expect(doc.querySelector(".intro")).toBeNull();
  });

  it("renders the intro string and slotted paragraphs", async () => {
    const doc = await render(SectionHeader, {
      props: { index: 1, label: "About", title: "Title", intro: "First." },
      slots: { default: "<p>Second.</p>" },
    });
    const paragraphs = [...doc.querySelectorAll(".intro p")].map((p) =>
      text(p),
    );
    expect(paragraphs).toEqual(["First.", "Second."]);
  });

  it("centres the header when aligned to the center", async () => {
    const doc = await render(SectionHeader, {
      props: { index: 5, label: "Contact", title: "Title", align: "center" },
    });
    expect(doc.querySelector("header")?.classList.contains("center")).toBe(
      true,
    );
  });
});

describe("Section", () => {
  it("links the section to its heading and numbers it from navigation.json", async () => {
    const doc = await render(Section, {
      props: { id: "stack", label: "Tech Stack", title: "Toolkit" },
      slots: { intro: "<p>Intro.</p>", default: "<p>Content.</p>" },
    });
    const section = doc.querySelector("section");
    expect(section?.id).toBe("stack");
    expect(section?.getAttribute("aria-labelledby")).toBe("stack-title");
    expect(doc.querySelector("h2")?.id).toBe("stack-title");
    expect(text(doc.querySelector(".label"))).toBe("02 — Tech Stack");
    expect(text(doc.querySelector(".intro"))).toBe("Intro.");
    expect(text(doc.querySelector(".inner > p"))).toBe("Content.");
  });

  it("throws for a section that no navigation link targets", async () => {
    await expect(
      render(Section, { props: { id: "missing", label: "X", title: "X" } }),
    ).rejects.toThrow('navigation.json: no link targets section "missing"');
  });
});

describe("Screw", () => {
  it("renders a hidden spun head with its slot angle", async () => {
    const doc = await render(Screw, { props: { angle: -52 } });
    const screw = doc.querySelector(".screw");
    expect(screw?.classList.contains("spun")).toBe(true);
    expect(screw?.getAttribute("aria-hidden")).toBe("true");
    expect(screw?.getAttribute("style")).toContain("--slot: -52deg");
  });
});

describe("Plate", () => {
  it("screws a div down at its four corners around its content", async () => {
    const doc = await render(Plate, { slots: { default: "<p>Gauges</p>" } });
    const plate = doc.querySelector("div.plate");
    const screws = [...(plate?.querySelectorAll(":scope > .screw") ?? [])];
    expect(
      screws.map((screw) =>
        ["top-left", "top-right", "bottom-left", "bottom-right"].find((place) =>
          screw.classList.contains(place),
        ),
      ),
    ).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
    expect(text(plate?.querySelector("p") ?? null)).toBe("Gauges");
  });

  it("renders another element and leaves out the screws on request", async () => {
    const doc = await render(Plate, {
      props: { as: "section", screws: false, id: "board" },
    });
    const plate = doc.querySelector("section.plate");
    expect(plate?.id).toBe("board");
    expect(plate?.querySelector(".screw")).toBeNull();
  });
});

describe("Nameplate", () => {
  it("carves the name as a heading between two screws", async () => {
    const doc = await render(Nameplate, { props: { name: "BBRaiN" } });
    const plate = doc.querySelector("div.nameplate");
    expect(plate?.querySelectorAll(":scope > .screw")).toHaveLength(2);
    const name = plate?.querySelector("h3.carved");
    expect(text(name ?? null)).toBe("BBRaiN");
    expect(doc.querySelector("a")).toBeNull();
  });

  it("sets the heading level", async () => {
    const doc = await render(Nameplate, {
      props: { name: "Hisiya", level: 2 },
    });
    expect(text(doc.querySelector("h2.carved"))).toBe("Hisiya");
  });

  it("renders a link with the carved name and no heading when href is set", async () => {
    const doc = await render(Nameplate, {
      props: { name: "contact@adioz.dev", href: "mailto:contact@adioz.dev" },
    });
    const link = doc.querySelector("a.nameplate");
    expect(link?.getAttribute("href")).toBe("mailto:contact@adioz.dev");
    expect(text(link?.querySelector(".carved") ?? null)).toBe(
      "contact@adioz.dev",
    );
    expect(link?.querySelector("h1, h2, h3, h4")).toBeNull();
  });
});

describe("Tag", () => {
  it("renders its text in a span by default", async () => {
    const doc = await render(Tag, { slots: { default: "Typed tools" } });
    expect(text(doc.querySelector("span.tag"))).toBe("Typed tools");
  });

  it("renders a list item inside a list of tags", async () => {
    const doc = await render(Tag, {
      props: { as: "li" },
      slots: { default: "Rust" },
    });
    expect(text(doc.querySelector("li.tag"))).toBe("Rust");
  });
});

describe("Lamp", () => {
  it("renders the gold status lamp by default, hidden from assistive technology", async () => {
    const doc = await render(Lamp);
    const lamp = doc.querySelector(".lamp");
    expect(lamp?.classList.contains("status")).toBe(true);
    expect(lamp?.getAttribute("aria-hidden")).toBe("true");
    expect(text(lamp)).toBe("");
  });

  it("renders the red live lamp", async () => {
    const doc = await render(Lamp, { props: { variant: "live" } });
    expect(doc.querySelector(".lamp")?.classList.contains("live")).toBe(true);
  });
});

describe("Panel", () => {
  it("renders a steel-rimmed slab around its content", async () => {
    const doc = await render(Panel, { slots: { default: "<p>Card</p>" } });
    const panel = doc.querySelector("div.panel");
    expect(panel?.classList.contains("slab")).toBe(true);
    expect(panel?.classList.contains("gold")).toBe(false);
    expect(text(panel?.querySelector("p") ?? null)).toBe("Card");
  });

  it("renders another element with a gold rim for featured cards", async () => {
    const doc = await render(Panel, {
      props: { as: "article", gold: true, id: "featured" },
    });
    const panel = doc.querySelector("article.panel");
    expect(panel?.classList.contains("gold")).toBe(true);
    expect(panel?.id).toBe("featured");
  });
});
