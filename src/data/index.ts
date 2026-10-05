/*
 * Typed exports of the portfolio content. Each JSON file is assigned to its
 * interface from types.ts, so `astro check` rejects a file whose structure no
 * longer matches. JSON imports type every string as `string`, so the
 * TerminalLineKind union is checked when this module loads instead.
 */
import aboutJson from "./about.json";
import contactJson from "./contact.json";
import experienceJson from "./experience.json";
import footerJson from "./footer.json";
import navigationJson from "./navigation.json";
import profileJson from "./profile.json";
import projectsJson from "./projects.json";
import siteJson from "./site.json";
import statsJson from "./stats.json";
import techStackJson from "./techStack.json";
import terminalJson from "./terminal.json";
import type {
  AboutContent,
  ContactContent,
  ExperienceItem,
  FooterContent,
  Navigation,
  Profile,
  ProjectItem,
  SiteMeta,
  StatItem,
  TechStack,
  TerminalContent,
  TerminalLine,
  TerminalLineKind,
} from "./types";

/** Every TerminalLineKind; the Record type makes the compiler require each one. */
const TERMINAL_LINE_KINDS: Record<TerminalLineKind, true> = {
  cmd: true,
  out: true,
  ok: true,
  key: true,
};

function isTerminalLineKind(kind: string): kind is TerminalLineKind {
  return Object.hasOwn(TERMINAL_LINE_KINDS, kind);
}

/** Returns the line with its kind narrowed to TerminalLineKind; throws on any other kind. */
function toTerminalLine(line: { kind: string; text: string }): TerminalLine {
  if (!isTerminalLineKind(line.kind)) {
    throw new Error(`terminal.json: unknown kind "${line.kind}"`);
  }
  return { kind: line.kind, text: line.text };
}

export const about: AboutContent = aboutJson;
export const contact: ContactContent = contactJson;
export const experience: ExperienceItem[] = experienceJson;
export const footer: FooterContent = footerJson;
export const navigation: Navigation = navigationJson;
export const profile: Profile = profileJson;
export const projects: ProjectItem[] = projectsJson;
export const site: SiteMeta = siteJson;
export const stats: StatItem[] = statsJson;
export const techStack: TechStack = techStackJson;
export const terminal: TerminalContent = {
  title: terminalJson.title,
  lines: terminalJson.lines.map(toTerminalLine),
};
