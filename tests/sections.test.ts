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
  it("renders the name, headline, role and availability from profile.json", async () => {
    const doc = await render(Hero);
    expect(text(doc.querySelector("h1"))).toBe(
      `${profile.name} ${profile.headline}`,
    );
    expect(text(doc.querySelector(".role"))).toBe(
      `${profile.role} / ${profile.specialty}`,
    );
    expect(text(doc.querySelector(".status .badge"))).toBe(
      profile.availability,
    );
    expect(texts(doc.querySelectorAll(".summary strong")).length).toBe(
      (profile.summary.split("**").length - 1) / 2,
    );
  });

  it("renders the calls to action with the first as the primary button", async () => {
    const doc = await render(Hero);
    const actions = [...doc.querySelectorAll(".actions a.btn")];
    expect(links(actions)).toEqual(
      profile.actions.map((action) => [action.title, action.url]),
    );
    expect(
      actions.map((action) => action.classList.contains("primary")),
    ).toEqual(profile.actions.map((_, index) => index === 0));
  });

  it("links the resume as a download", async () => {
    const doc = await render(Hero);
    const resume = doc.querySelector("a.resume");
    expect(resume?.getAttribute("href")).toBe(profile.resume.url);
    expect(resume?.hasAttribute("download")).toBe(true);
    expect(text(resume)).toBe(profile.resume.title);
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

  it("prints every terminal.json line in order with its kind", async () => {
    const doc = await render(Hero);
    expect(text(doc.querySelector(".terminal .title"))).toBe(terminal.title);
    const lines = [...doc.querySelectorAll(".terminal .line")];
    expect(texts(lines)).toEqual(terminal.lines.map((line) => line.text));
    lines.forEach((line, index) => {
      expect(line.classList.contains(terminal.lines[index]!.kind)).toBe(true);
    });
    expect(doc.querySelector(".terminal .input .caret")).not.toBeNull();
  });

  it("renders the stats banner under the hero", async () => {
    const doc = await render(Hero);
    expect(doc.querySelectorAll(".stats dt")).toHaveLength(stats.length);
  });
});

describe("AboutSection", () => {
  it("renders the bio, a card per pillar with its tags, and the philosophy", async () => {
    const doc = await render(AboutSection);
    expect(doc.querySelector("section")?.id).toBe(about.id);
    expect(text(doc.querySelector("h2"))).toBe(about.headline);
    expect(texts(doc.querySelectorAll(".intro p"))).toEqual(about.bio);
    const cards = [...doc.querySelectorAll("article.card")];
    expect(texts(cards.map((card) => card.querySelector("h3")!))).toEqual(
      about.pillars.map((pillar) => pillar.title),
    );
    cards.forEach((card, index) => {
      expect(card.querySelector(".icon svg")).not.toBeNull();
      expect(texts(card.querySelectorAll(".tags .badge"))).toEqual(
        about.pillars[index]!.tags,
      );
    });
    expect(text(doc.querySelector(".philosophy"))).toBe(about.philosophy);
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
