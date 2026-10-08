import { describe, expect, it } from "vitest";
import AboutSection from "../src/components/About/AboutSection.astro";
import ContactSection from "../src/components/Contact/ContactSection.astro";
import ExperienceSection from "../src/components/Experience/ExperienceSection.astro";
import Footer from "../src/components/Footer/Footer.astro";
import Header from "../src/components/Header/Header.astro";
import Hero from "../src/components/Hero/Hero.astro";
import ProjectsSection from "../src/components/Projects/ProjectsSection.astro";
import TechStackSection from "../src/components/TechStack/TechStackSection.astro";
import {
  about,
  contact,
  experience,
  footer,
  navigation,
  profile,
  projects,
  stats,
  techStack,
  terminal,
} from "../src/data/index";
import { render, text } from "./render";

/** Text and href of each link in `elements`. */
function links(elements: Iterable<Element>) {
  return [...elements].map((link) => [text(link), link.getAttribute("href")]);
}

/** Text of each element in `elements`. */
function texts(elements: Iterable<Element>) {
  return [...elements].map((element) => text(element));
}

describe("Header", () => {
  const navTargets = [...navigation.links, navigation.cta].map((link) => [
    link.title,
    link.url,
  ]);

  it("links every section from navigation.json in order as key caps on the rail", async () => {
    const doc = await render(Header);
    const nav = doc.querySelector("nav.links");
    expect(nav?.getAttribute("aria-label")).toBe(navigation.label);
    const rail = nav?.querySelector("ul.rail");
    expect(links(rail?.querySelectorAll("a") ?? [])).toEqual(
      navigation.links.map((link) => [link.title, link.url]),
    );
    for (const link of rail?.querySelectorAll("a") ?? []) {
      expect(link.querySelector(".key-cap")).not.toBeNull();
    }
  });

  it("lays the gold plate on the rail, hidden from assistive technology", async () => {
    const doc = await render(Header);
    const plate = doc.querySelector(".rail > .rail-plate");
    expect(plate?.getAttribute("aria-hidden")).toBe("true");
    expect(plate?.querySelector("a")).toBeNull();
  });

  it("links the contact section from a machined accent button", async () => {
    const doc = await render(Header);
    const contact = doc.querySelector(".controls a.contact");
    expect(contact?.getAttribute("href")).toBe(navigation.cta.url);
    expect([...(contact?.classList ?? [])]).toEqual(
      expect.arrayContaining(["accent", "machined", "compact"]),
    );
    expect(text(contact)).toBe(navigation.cta.title);
  });

  it("links the brand mark alone to the top of the page", async () => {
    const doc = await render(Header);
    const brand = doc.querySelector("a.brand");
    expect(brand?.getAttribute("href")).toBe("#top");
    expect(brand?.getAttribute("aria-label")).toBe("adioz.dev, back to top");
    expect(
      brand?.querySelector("svg.brand-mark")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(text(brand)).toBe("");
  });

  it("keeps the fixed header's height in the page flow", async () => {
    const doc = await render(Header);
    expect(
      doc.querySelector("header + .header-space")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("wires the menu knob to the popover sheet, closed and labelled to open it", async () => {
    const doc = await render(Header);
    const toggle = doc.querySelector("button.knob.menu-toggle");
    expect(toggle?.getAttribute("aria-label")).toBe(navigation.menuLabel.open);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("data-label-close")).toBe(
      navigation.menuLabel.close,
    );
    const sheet = doc.getElementById(
      toggle?.getAttribute("popovertarget") ?? "",
    );
    expect(toggle?.getAttribute("aria-controls")).toBe(sheet?.id);
    expect(sheet?.tagName.toLowerCase()).toBe("nav");
    expect(sheet?.classList.contains("menu-sheet")).toBe(true);
    expect(sheet?.hasAttribute("popover")).toBe(true);
    expect(sheet?.getAttribute("aria-label")).toBe(navigation.label);
  });

  it("lists every section in the sheet with its engraved, hidden number", async () => {
    const doc = await render(Header);
    const items = [...doc.querySelectorAll("#site-menu ol > li > a")];
    expect(
      items.map((link) => [
        text(link).replace(/^\d+ /, ""),
        link.getAttribute("href"),
      ]),
    ).toEqual(navTargets);
    expect(items.map((link) => text(link.querySelector(".menu-no")))).toEqual(
      navTargets.map((_, index) => String(index + 1).padStart(2, "0")),
    );
    for (const link of items) {
      expect(link.querySelector(".menu-no")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
  });

  it("renders the theme knob as a button named by both themes' labels", async () => {
    const doc = await render(Header);
    const toggle = doc.querySelector("button.theme-toggle");
    expect(toggle?.getAttribute("type")).toBe("button");
    expect(texts(toggle?.querySelectorAll(".label") ?? [])).toEqual([
      "Switch to light theme",
      "Switch to dark theme",
    ]);
    expect(toggle?.querySelector(".face")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("hides the scroll progress bar from assistive technology", async () => {
    const doc = await render(Header);
    expect(
      doc.querySelector(".progress")?.closest("[aria-hidden]")?.className,
    ).toContain("edge");
  });
});

describe("Hero", () => {
  it("renders the availability pill, gold headline and lede from profile.json", async () => {
    const doc = await render(Hero);
    const pill = doc.querySelector("p.pill.panel.gold");
    expect(text(pill)).toBe(profile.availability);
    expect(pill?.querySelector(".lamp.status")).not.toBeNull();
    const title = doc.querySelector("h1.display");
    expect(title?.id).toBe("hero-title");
    expect(text(title?.querySelector(".gilt") ?? null)).toBe(
      `${profile.name} ${profile.headline}`,
    );
    const lede = text(doc.querySelector(".lede"));
    expect(lede.startsWith(`${profile.role} / ${profile.specialty}. `)).toBe(
      true,
    );
    expect(doc.querySelectorAll(".lede strong")).toHaveLength(
      (profile.summary.split("**").length - 1) / 2,
    );
  });

  it("renders the actions as machined accent buttons with turning caps", async () => {
    const doc = await render(Hero);
    const actions = [...doc.querySelectorAll(".actions a.btn")];
    expect(links(actions)).toEqual([
      ["View selected work", "#work"],
      ["Get in touch", "#contact"],
    ]);
    for (const action of actions) {
      expect(action.classList.contains("accent")).toBe(true);
      expect(action.querySelector("[data-rest]")).not.toBeNull();
    }
  });

  it("downloads the résumé from the knob under a named file", async () => {
    const doc = await render(Hero);
    const knob = doc.querySelector(".resume a.knob");
    expect(knob?.getAttribute("href")).toBe("/resume.pdf");
    expect(knob?.getAttribute("download")).toBe(profile.resume.file);
    expect(knob?.getAttribute("aria-label")).toBe(profile.resume.label);
    expect(profile.resume.label).toContain(profile.resume.title);
    expect(text(doc.querySelector(".resume-title"))).toBe(profile.resume.title);
  });

  it("names each social link and opens only https: links in a new tab", async () => {
    const doc = await render(Hero);
    const socials = [...doc.querySelectorAll(".socials a")];
    expect(socials).toHaveLength(profile.links.length);
    socials.forEach((link, index) => {
      const item = profile.links[index]!;
      expect(link.getAttribute("href")).toBe(item.url);
      expect(link.querySelector("svg")?.getAttribute("aria-label")).toBe(
        item.title,
      );
      expect(link.getAttribute("target")).toBe(
        item.url.startsWith("https:") ? "_blank" : null,
      );
    });
  });

  it("sets the 3D pipeline above the agent log beside the copy", async () => {
    const doc = await render(Hero);
    const system = doc.querySelector(".grid > .system");
    expect(
      [...(system?.children ?? [])]
        .filter((child) => child.tagName !== "SCRIPT")
        .map((child) => child.classList[0]),
    ).toEqual(["pipeline", "terminal"]);
  });

  it("engraves the log title beside the window buttons and the live lamp", async () => {
    const doc = await render(Hero);
    const log = doc.querySelector(".terminal figure.log");
    const title = log?.querySelector(".log-bar #log-title.engraved");
    expect(text(title ?? null)).toBe(terminal.title);
    expect(log?.getAttribute("aria-labelledby")).toBe("log-title");
    expect(text(log?.querySelector(".live") ?? null)).toBe(terminal.live);
    expect(log?.querySelector(".live .lamp.live")).not.toBeNull();
    const buttons = [
      ...(log?.querySelectorAll(".window-controls button") ?? []),
    ];
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      `Close ${terminal.name}`,
      `Minimise ${terminal.name}`,
      `Zoom ${terminal.name}`,
    ]);
    for (const button of buttons)
      expect(button.hasAttribute("disabled")).toBe(true);
    const reopen = doc.querySelector(".terminal .log-reopen");
    expect(reopen?.hasAttribute("hidden")).toBe(true);
    expect(text(reopen)).toBe(`Open ${terminal.name}`);
    expect(doc.querySelector(".log-shade")?.getAttribute("popover")).toBe(
      "manual",
    );
  });

  it("renders every terminal.json entry in order with its writer and tone", async () => {
    const doc = await render(Hero);
    const entries = [...doc.querySelectorAll(".log .screen li")];
    expect(
      entries.map((entry) => [
        text(entry.querySelector(".who")),
        text(entry.querySelector(".message")),
      ]),
    ).toEqual(terminal.lines.map((line) => [line.who, line.text]));
    entries.forEach((entry, index) => {
      const tone = terminal.lines[index]!.tone;
      const message = entry.querySelector(".message")!;
      expect(message.classList.contains("good")).toBe(tone === "good");
      expect(message.classList.contains("bad")).toBe(tone === "bad");
    });
  });

  it("renders the stats panel from stats.json under the actions", async () => {
    const doc = await render(Hero);
    const panel = doc.querySelector(".actions + dl.stats.panel");
    expect(texts(panel?.querySelectorAll("dt") ?? [])).toEqual(
      stats.map((stat) => stat.label),
    );
    const values = [...(panel?.querySelectorAll("dd.gilt") ?? [])];
    expect(values.map((dd) => text(dd).replace(/\s/g, ""))).toEqual(
      stats.map((stat) => `${stat.value}${stat.suffix}`),
    );
  });
});

describe("AboutSection", () => {
  it("numbers the eyebrow and renders the gold headline and the bio", async () => {
    const doc = await render(AboutSection);
    const section = doc.querySelector("section");
    expect(section?.id).toBe(about.id);
    expect(section?.getAttribute("aria-labelledby")).toBe(`${about.id}-title`);
    expect(text(doc.querySelector(".eyebrow .eyebrow-no"))).toBe("01");
    expect(text(doc.querySelector(".eyebrow"))).toBe(`01 ${about.label}`);
    const title = doc.querySelector(`h2#${about.id}-title.h2`);
    expect(text(title?.querySelector(".gilt") ?? null)).toBe(about.headline);
    expect(about.headline.endsWith(".")).toBe(true);
    expect(texts(doc.querySelectorAll(".sub p"))).toEqual(about.bio);
  });

  it("sets the portrait and a numbered pillar per about.json pillar on one screwed plate", async () => {
    const doc = await render(AboutSection);
    const board = doc.querySelector(".plate.board");
    expect(board?.querySelectorAll(":scope > .screw")).toHaveLength(4);
    const pillars = [...(board?.querySelectorAll(".pillars > .pillar") ?? [])];
    expect(pillars[0]?.classList.contains("pillar-portrait")).toBe(true);
    const cards = pillars.slice(1);
    expect(
      cards.map((card) => [
        text(card.querySelector(".pillar-no")),
        text(card.querySelector("h3")),
        text(card.querySelector("p")),
      ]),
    ).toEqual(
      about.pillars.map((pillar, index) => [
        String(index + 1).padStart(2, "0"),
        pillar.title,
        pillar.description,
      ]),
    );
    cards.forEach((card, index) => {
      expect(card.querySelector(".instrument .coin svg")).not.toBeNull();
      expect(
        card.querySelector(".pillar-media")?.getAttribute("aria-hidden"),
      ).toBe("true");
      expect(texts(card.querySelectorAll(".tags li.tag"))).toEqual(
        about.pillars[index]!.tags,
      );
    });
    expect(
      cards.map((card) =>
        card.querySelector(".coin")!.classList.contains("gold"),
      ),
    ).toEqual([false, true, false]);
  });

  it("gives the portrait one text alternative and hides its engraved copy", async () => {
    const doc = await render(AboutSection);
    const portrait = doc.querySelector("figure.pillar-portrait");
    const named = [...(portrait?.querySelectorAll("[role=img]") ?? [])];
    expect(named).toHaveLength(1);
    expect(named[0]?.getAttribute("aria-label")).toBe(about.portrait.alt);
    const cut = portrait?.querySelector(".portrait-cut");
    expect(cut?.getAttribute("aria-hidden")).toBe("true");
    expect(cut?.querySelector("image")?.getAttribute("href")).toBe(
      about.portrait.src,
    );
    expect(portrait?.querySelector("filter#portrait-cut")).not.toBeNull();
    expect(portrait?.querySelectorAll(".hood-cord")).toHaveLength(2);
    expect(
      portrait
        ?.querySelector(".hood-mark .brand-mark")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(texts(portrait?.querySelectorAll(".hood-print text") ?? [])).toEqual(
      ["CODE", "TRAIN", "SHIP", "EST 2018"],
    );
  });

  it("lists the service record's traits on the steel plaque", async () => {
    const doc = await render(AboutSection);
    const plaque = doc.querySelector("figure.plaque");
    expect(plaque?.querySelectorAll(":scope > .screw")).toHaveLength(4);
    expect(text(plaque?.querySelector("figcaption") ?? null)).toBe(
      about.record.title,
    );
    expect(
      [...(plaque?.querySelectorAll(".record > div") ?? [])].map((trait) => [
        text(trait.querySelector("dt")),
        text(trait.querySelector("dd")),
      ]),
    ).toEqual(about.record.traits.map((trait) => [trait.name, trait.detail]));
    expect(about.record.traits.map((trait) => trait.name)).toEqual([
      "Robust",
      "Fluent",
      "Equipped",
      "Seasoned",
    ]);
  });
});

describe("TechStackSection", () => {
  it("renders each skill's label, level and bar width", async () => {
    const doc = await render(TechStackSection);
    expect(doc.querySelector("section")?.id).toBe(techStack.id);
    const skills = [...doc.querySelectorAll(".skill")];
    expect(skills).toHaveLength(techStack.skills.length);
    skills.forEach((skill, index) => {
      const item = techStack.skills[index]!;
      expect(text(skill.querySelector("dt"))).toBe(item.label);
      expect(text(skill.querySelector(".level"))).toBe(item.level);
      expect(skill.querySelector(".bar")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
      expect(skill.querySelector("[data-fill]")?.getAttribute("style")).toBe(
        `width: ${item.percent}%`,
      );
    });
  });

  it("renders each tool category as a heading and chips", async () => {
    const doc = await render(TechStackSection);
    const clouds = [...doc.querySelectorAll(".cloud")];
    expect(texts(clouds.map((cloud) => cloud.querySelector("h3")!))).toEqual(
      techStack.categories.map((category) => category.name),
    );
    clouds.forEach((cloud, index) => {
      expect(texts(cloud.querySelectorAll(".chip"))).toEqual(
        techStack.categories[index]!.tools,
      );
    });
  });
});

describe("ExperienceSection", () => {
  it("renders each role with its years, highlights and technologies", async () => {
    const doc = await render(ExperienceSection);
    expect(doc.querySelector("section")?.id).toBe(experience.id);
    const roles = [...doc.querySelectorAll("article.role")];
    expect(texts(roles.map((role) => role.querySelector("h3")!))).toEqual(
      experience.roles.map((role) => role.role),
    );
    roles.forEach((role, index) => {
      const item = experience.roles[index]!;
      const years = [...role.querySelectorAll(".when time")].map((time) =>
        time.getAttribute("datetime"),
      );
      expect(years[0]).toBe(String(item.period.start));
      if (item.period.end === null) {
        expect(text(role.querySelector(".when"))).toBe(
          `${item.period.start} — ${experience.ongoing}`,
        );
      } else {
        expect(years[1]).toBe(String(item.period.end));
      }
      expect(text(role.querySelector(".company"))).toBe(item.company);
      expect(role.querySelectorAll(".highlights li")).toHaveLength(
        item.highlights.length,
      );
      expect(texts(role.querySelectorAll(".tags .badge"))).toEqual(
        item.technologies,
      );
    });
  });
});

describe("ProjectsSection", () => {
  it("renders a card for each featured project with its links", async () => {
    const doc = await render(ProjectsSection);
    expect(doc.querySelector("section")?.id).toBe(projects.id);
    const featured = projects.projects.filter((project) => project.featured);
    const cards = [...doc.querySelectorAll("article.card")];
    expect(texts(cards.map((card) => card.querySelector("h3")!))).toEqual(
      featured.map((project) => project.title),
    );
    cards.forEach((card, index) => {
      const project = featured[index]!;
      expect(text(card.querySelector(".metric"))).toBe(project.metric);
      expect(texts(card.querySelectorAll(".tags .badge"))).toEqual(
        project.tags,
      );
      const anchors = [...card.querySelectorAll(".links a")];
      expect(links(anchors)).toEqual(
        project.links.map((link) => [link.title, link.url]),
      );
      for (const anchor of anchors) {
        expect(anchor.getAttribute("target")).toBe("_blank");
        expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
      }
    });
  });
});

describe("ContactSection", () => {
  it("links the email button and address to the profile's mailto: link", async () => {
    const doc = await render(ContactSection);
    const email = profile.links.find((link) => link.url.startsWith("mailto:"))!;
    expect(doc.querySelector("section")?.id).toBe(contact.id);
    expect(text(doc.querySelector(".label"))).toBe(`05 — ${contact.label}`);
    expect(text(doc.querySelector("h2"))).toBe(contact.heading);
    expect(text(doc.querySelector(".intro"))).toBe(contact.body);
    const button = doc.querySelector("a.btn");
    expect(button?.getAttribute("href")).toBe(email.url);
    expect(text(button)).toBe(contact.ctaLabel);
    const address = doc.querySelector(".address a");
    expect(address?.getAttribute("href")).toBe(email.url);
    expect(text(address)).toBe(email.url.slice("mailto:".length));
  });
});

describe("Footer", () => {
  it("renders the copyright with the build year, the credits and the source link", async () => {
    const doc = await render(Footer);
    expect(text(doc.querySelector("footer p"))).toBe(
      `© ${new Date().getFullYear()} ${footer.copyright}`,
    );
    const anchors = [...doc.querySelectorAll("footer a")];
    expect(links(anchors)).toEqual([
      ...footer.credits.flatMap((group) =>
        group.links.map((link) => [link.title, link.url]),
      ),
      [footer.source.title, footer.source.url],
    ]);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
    }
  });
});
