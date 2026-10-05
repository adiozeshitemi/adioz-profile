/*
 * Typed exports of the portfolio content. Each JSON file is assigned to its
 * interface from types.ts, so `astro check` rejects a file whose structure no
 * longer matches. Rules a type cannot express are checked when this module
 * loads: each terminal line's TerminalLineKind (JSON imports type every string
 * as `string`) and each skill's percent, an integer from 0 to 100.
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
  SkillItem,
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

/** Returns the skill; throws when its percent is not an integer from 0 to 100. */
function toSkillItem(skill: SkillItem): SkillItem {
  if (
    !Number.isInteger(skill.percent) ||
    skill.percent < 0 ||
    skill.percent > 100
  ) {
    throw new Error(
      `techStack.json: percent ${skill.percent} of "${skill.label}" is not an integer from 0 to 100`,
    );
  }
  return skill;
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
export const techStack: TechStack = {
  ...techStackJson,
  skills: techStackJson.skills.map(toSkillItem),
};
export const terminal: TerminalContent = {
  title: terminalJson.title,
  lines: terminalJson.lines.map(toTerminalLine),
};

/**
 * The number shown before a section's label: its position among the
 * navigation.json links, counting the contact link last, from 1. Throws when
 * no link targets the section, so a section missing from the header
 * navigation fails the build.
 */
export function sectionNumber(id: string): number {
  const index = [...navigation.links, navigation.cta].findIndex(
    (link) => link.url === `#${id}`,
  );
  if (index === -1) {
    throw new Error(`navigation.json: no link targets section "${id}"`);
  }
  return index + 1;
}
