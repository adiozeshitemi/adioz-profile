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
  it("numbers the eyebrow and renders the gold headline and intro", async () => {
    const doc = await render(TechStackSection);
    const section = doc.querySelector("section");
    expect(section?.id).toBe(techStack.id);
    expect(section?.getAttribute("aria-labelledby")).toBe(
      `${techStack.id}-title`,
    );
    expect(text(doc.querySelector(".eyebrow"))).toBe(`02 ${techStack.label}`);
    expect(text(doc.querySelector("h2 .gilt"))).toBe(techStack.headline);
    expect(text(doc.querySelector(".sub p"))).toBe(techStack.intro);
  });

  it("renders a gauge per skill with its label, value and level as text", async () => {
    const doc = await render(TechStackSection);
    const cluster = doc.querySelector(".plate.cluster");
    expect(cluster?.querySelectorAll(":scope > .screw")).toHaveLength(4);
    const gauges = [...(cluster?.querySelectorAll("dl.gauges > .gauge") ?? [])];
    expect(
      gauges.map((gauge) => [
        text(gauge.querySelector("dt")),
        gauge.getAttribute("data-value"),
        text(gauge.querySelector("dd .sr-only")),
        text(gauge.querySelector(".readout b")),
        text(gauge.querySelector(".readout small")),
      ]),
    ).toEqual(
      techStack.skills.map((skill) => [
        skill.label,
        String(skill.percent),
        skill.level,
        String(skill.percent),
        skill.level,
      ]),
    );
  });

  it("hides each dial from assistive technology and seats its needle on the value", async () => {
    const doc = await render(TechStackSection);
    const gauges = [...doc.querySelectorAll(".gauge")];
    gauges.forEach((gauge, index) => {
      const percent = techStack.skills[index]!.percent;
      const dial = gauge.querySelector(".dial");
      expect(dial?.getAttribute("aria-hidden")).toBe("true");
      expect(dial?.querySelectorAll(".dial-ticks line")).toHaveLength(21);
      expect(dial?.querySelectorAll(".dial-ticks line.major")).toHaveLength(5);
      expect(dial?.querySelector(".rotor")?.getAttribute("style")).toBe(
        `transform: rotate(${-135 + 2.7 * percent}deg)`,
      );
      expect(dial?.querySelector(".dial-fill")?.getAttribute("style")).toBe(
        `stroke-dasharray: ${percent} 200`,
      );
    });
  });

  it("renders each tool category as a heading over its tools as tags", async () => {
    const doc = await render(TechStackSection);
    const cats = [...doc.querySelectorAll(".kit .categories > .cat")];
    expect(cats.map((cat) => text(cat.querySelector("h3")))).toEqual(
      techStack.categories.map((category) => category.name),
    );
    cats.forEach((cat, index) => {
      expect(texts(cat.querySelectorAll("ul.tools > li.tag"))).toEqual(
        techStack.categories[index]!.tools,
      );
    });
  });

  it("sets the gauge cluster and the categories side by side in one kit", async () => {
    const doc = await render(TechStackSection);
    const kit = doc.querySelector(".kit");
    expect(
      [...(kit?.children ?? [])].map((child) =>
        child.classList.contains("cluster")
          ? "cluster"
          : child.className.split(" ")[0],
      ),
    ).toEqual(["cluster", "categories"]);
  });
});

describe("ExperienceSection", () => {
  it("numbers the eyebrow and renders the gold headline over the timeline", async () => {
    const doc = await render(ExperienceSection);
    const section = doc.querySelector("section");
    expect(section?.id).toBe(experience.id);
    expect(section?.getAttribute("aria-labelledby")).toBe(
      `${experience.id}-title`,
    );
    expect(text(doc.querySelector(".eyebrow"))).toBe(`03 ${experience.label}`);
    expect(text(doc.querySelector("h2 .gilt"))).toBe(experience.headline);
    expect(doc.querySelector(".sub")).toBeNull();
    expect(doc.querySelector("ol.timeline")?.getAttribute("aria-label")).toBe(
      experience.timelineLabel,
    );
  });

  it("lists the roles most recent first, as in experience.json", async () => {
    const doc = await render(ExperienceSection);
    const stops = [...doc.querySelectorAll("ol.timeline > li.stop")];
    expect(stops.map((stop) => text(stop.querySelector("h3")))).toEqual(
      experience.roles.map((role) => role.role),
    );
    const starts = experience.roles.map((role) => role.period.start);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  it("gives each role a rivet and a machined card with its years, company, tags and highlights", async () => {
    const doc = await render(ExperienceSection);
    const stops = [...doc.querySelectorAll("li.stop")];
    stops.forEach((stop, index) => {
      const item = experience.roles[index]!;
      const live = item.period.end === null;
      expect(stop.classList.contains("live")).toBe(live);
      const rivet = stop.querySelector(":scope > .rivet");
      expect(rivet?.getAttribute("aria-hidden")).toBe("true");
      expect(rivet?.classList.contains("spun")).toBe(!live);
      const card = stop.querySelector("article.panel.stop-card");
      const years = [...(card?.querySelectorAll(".when time") ?? [])].map(
        (time) => time.getAttribute("datetime"),
      );
      expect(years[0]).toBe(String(item.period.start));
      if (live) {
        expect(text(card?.querySelector(".when") ?? null)).toBe(
          `${item.period.start} — ${experience.ongoing}`,
        );
      } else {
        expect(years[1]).toBe(String(item.period.end));
      }
      expect(text(card?.querySelector(".company") ?? null)).toBe(item.company);
      expect(texts(card?.querySelectorAll(".tags li.tag") ?? [])).toEqual(
        item.technologies,
      );
      expect(card?.querySelectorAll(".highlights li")).toHaveLength(
        item.highlights.length,
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
