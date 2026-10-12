/*
 * Renders the GitHub profile README (the README.md of
 * adiozeshitemi/adiozeshitemi) from the site's data: the hero's headline,
 * role and summary, the tool categories, the featured projects, the activity
 * cards served from the site, and the contact links. Text inside `**` pairs
 * stays Markdown strong emphasis.
 */
import type {
  ActivityLabels,
  ContactContent,
  Profile,
  ProjectsContent,
  SiteMeta,
  TechStack,
} from "../data/types";

/** The data the README is rendered from. */
export interface ProfileReadmeData {
  profile: Profile;
  techStack: TechStack;
  projects: ProjectsContent;
  contact: ContactContent;
  activity: ActivityLabels;
  site: SiteMeta;
  /** A day as `YYYY-MM-DD` that versions the card URLs, so GitHub's image proxy fetches new cards on a new day. */
  day: string;
}

/** The first line of the README, marking it as generated. */
export const GENERATED_NOTE =
  "<!-- Generated from adioz.dev's src/data by scripts/profile-readme.ts on each deploy; edits here are overwritten. -->";

/** The section of the page the activity cards link to. */
const ACTIVITY_ANCHOR = "#experience";

/** `text` with `&`, `<`, `>` and `"` escaped for an HTML attribute in Markdown. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** The absolute URL of `path` on `origin`. */
function absolute(origin: string, path: string): string {
  return new URL(path, origin).href;
}

/** The README as Markdown, ending with a newline. */
export function renderProfileReadme(data: ProfileReadmeData): string {
  const { profile, techStack, projects, contact, activity, site, day } = data;
  const card = (name: "contributions" | "languages") => {
    const src = `${absolute(site.url, `/activity/${name}.svg`)}?v=${day}`;
    return `<a href="${absolute(site.url, `/${ACTIVITY_ANCHOR}`)}"><img src="${src}" width="495" alt="${escapeHtml(activity.cards[name])}"></a>`;
  };
  const featured = projects.projects.filter((project) => project.featured);
  const links = [
    ...contact.links.map((link) => `[${link.title}](${link.url})`),
    `[${new URL(site.url).host}](${site.url})`,
    `[${profile.email.url.replace(/^mailto:/, "")}](${profile.email.url})`,
  ];

  return [
    GENERATED_NOTE,
    "",
    `# ${profile.name} ${profile.headline}`,
    "",
    `**${profile.role} · ${profile.specialty}**`,
    "",
    profile.summary,
    "",
    `🟢 ${profile.availability}`,
    "",
    `## 🛠️ ${techStack.label}`,
    "",
    ...techStack.categories.map(
      (category) => `- **${category.name}**: ${category.tools.join(" · ")}`,
    ),
    "",
    `## 🚀 ${projects.label}`,
    "",
    ...featured.map((project) => {
      const link = project.links[0];
      const title = link ? `[${project.title}](${link.url})` : project.title;
      return `- **${title}**: ${project.description} ${project.metric}.`;
    }),
    "",
    `## 📈 ${activity.label}`,
    "",
    "<p>",
    `  ${card("contributions")}`,
    `  ${card("languages")}`,
    "</p>",
    "",
    `## 🌐 ${contact.label}`,
    "",
    links.join(" · "),
    "",
  ].join("\n");
}
