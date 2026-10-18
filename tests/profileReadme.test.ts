import { describe, expect, it } from "vitest";
import * as data from "../src/data/index";
import type { ProfileReadmeData } from "../src/lib/profileReadme";
import { GENERATED_NOTE, renderProfileReadme } from "../src/lib/profileReadme";

const link = (title: string, url: string, icon = "globe") => ({
  title,
  url,
  icon,
});

const FIXTURE: ProfileReadmeData = {
  profile: {
    name: "Octo",
    role: "Platform engineer",
    specialty: "Queues & Caches",
    headline: "ships queues.",
    summary: "Builds **durable queues** for payments.",
    availability: "Open to staff roles",
    location: "Lisbon (Remote)",
    actions: [],
    resume: {
      ...link("Résumé", "/resume.pdf", "download"),
      label: "Résumé (PDF)",
      file: "octo.pdf",
    },
    email: link("Email", "mailto:octo@example.com", "email"),
  },
  techStack: {
    id: "stack",
    label: "Tools",
    headline: "Kit.",
    intro: "",
    skills: [],
    categories: [
      { name: "Backend", tools: ["Go", "Java"] },
      { name: "Data", tools: ["Redis"] },
    ],
  },
  projects: {
    id: "projects",
    label: "Work",
    headline: "Built.",
    projects: [
      {
        title: "Relay",
        description: "A queue relay.",
        tags: [],
        links: [link("Website", "https://relay.example.com/")],
        featured: true,
        metric: "Moves **1M** messages a day",
      },
      {
        title: "Draft",
        description: "Unlisted.",
        tags: [],
        links: [],
        featured: false,
        metric: "None",
      },
      {
        title: "Notes",
        description: "No site.",
        tags: [],
        links: [],
        featured: true,
        metric: "Private",
      },
    ],
  },
  contact: {
    id: "contact",
    label: "Reach me",
    headline: "Hi.",
    lead: "",
    copy: { label: "", copied: "", failed: "" },
    links: [link("GitHub", "https://github.com/octo", "github")],
    resume: "",
  },
  activity: {
    ...data.experience.activity,
    label: "Activity",
    cards: { contributions: 'Octo\'s "contributions"', languages: "Langs" },
  },
  site: { ...data.site, url: "https://octo.example.com" },
  day: "2026-10-12",
};

describe("renderProfileReadme", () => {
  const readme = renderProfileReadme(FIXTURE);
  const lines = readme.split("\n");

  it("starts with the generated note and ends with one newline", () => {
    expect(lines[0]).toBe(GENERATED_NOTE);
    expect(readme.endsWith("\n")).toBe(true);
    expect(readme.endsWith("\n\n")).toBe(false);
  });

  it("opens with the hero's headline, role, summary, availability and location", () => {
    expect(lines).toContain("# Octo ships queues.");
    expect(lines).toContain("**Platform engineer · Queues & Caches**");
    expect(lines).toContain("Builds **durable queues** for payments.");
    expect(lines).toContain("🟢 Open to staff roles · 📍 Lisbon (Remote)");
  });

  it("lists each tool category with its tools", () => {
    expect(lines).toContain("## 🛠️ Tools");
    expect(lines).toContain("- **Backend**: Go · Java");
    expect(lines).toContain("- **Data**: Redis");
  });

  it("lists only featured projects, linked to their first link", () => {
    expect(lines).toContain(
      "- **[Relay](https://relay.example.com/)**: A queue relay. Moves **1M** messages a day.",
    );
    expect(lines).toContain("- **Notes**: No site. Private.");
    expect(readme).not.toContain("Draft");
  });

  it("links both activity cards from the site, versioned by day, with escaped alt text", () => {
    expect(lines).toContain("## 📈 Activity");
    expect(readme).toContain(
      '<a href="https://octo.example.com/#experience"><img src="https://octo.example.com/activity/contributions.svg?v=2026-10-12" width="495" alt="Octo\'s &quot;contributions&quot;"></a>',
    );
    expect(readme).toContain(
      'src="https://octo.example.com/activity/languages.svg?v=2026-10-12"',
    );
  });

  it("ends with the contact links, the site and the email address", () => {
    expect(lines).toContain("## 🌐 Reach me");
    expect(lines).toContain(
      "[GitHub](https://github.com/octo) · [octo.example.com](https://octo.example.com) · [octo@example.com](mailto:octo@example.com)",
    );
  });

  it("renders the site's own data", () => {
    const real = renderProfileReadme({
      profile: data.profile,
      techStack: data.techStack,
      projects: data.projects,
      contact: data.contact,
      activity: data.experience.activity,
      site: data.site,
      day: "2026-10-12",
    });
    expect(real).toContain(`# ${data.profile.name} ${data.profile.headline}`);
    expect(real).toContain(`${data.site.url}/activity/contributions.svg`);
  });
});
