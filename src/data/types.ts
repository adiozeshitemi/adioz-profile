/*
 * Content types for the portfolio's data layer. Every type holds only
 * JSON-compatible values: strings, numbers, booleans, null, arrays and plain
 * objects. Every link is a LinkItem, so link labels, URLs and icon names live
 * in the data.
 */

/** A labelled link with an icon. */
export interface LinkItem {
  /** Visible label and accessible name, e.g. "GitHub". */
  title: string;
  /** An `https:` URL, or a `mailto:` URL for email. */
  url: string;
  /** Icon name, e.g. "github". */
  icon: string;
}

/** The site owner's identity, shown in the hero. */
export interface Profile {
  /** Display name, e.g. "Adioz". */
  name: string;
  /** Job title, e.g. "Full-stack AI engineer". */
  role: string;
  /** Hero headline that follows the name, e.g. "takes AI into production.". */
  headline: string;
  /** Hero summary paragraph; text inside `**` pairs renders as strong emphasis. */
  summary: string;
  /** Availability badge text, e.g. "Available for Senior/Staff Engineering Roles". */
  availability: string;
  /** GitHub, LinkedIn and email links in display order; the email link is the only `mailto:` URL. */
  links: LinkItem[];
}

/** A link to a section of the page, e.g. "About" to "#about". */
export interface NavLink {
  /** Visible label and accessible name. */
  title: string;
  /** `#` followed by the id of the target section. */
  url: string;
}

/** The header navigation: inline links on wide screens, a menu drawer on narrow ones. */
export interface Navigation {
  /** Accessible name of the navigation landmark, e.g. "Primary". */
  label: string;
  /** Accessible name of the button that opens the menu drawer, e.g. "Menu". */
  menuLabel: string;
  /** Section links in display order. */
  links: NavLink[];
  /** Contact link after the section links, styled as a button in the header bar. */
  cta: NavLink;
}

/** Site-wide defaults for the page head; the default title is `Profile.name | Profile.role`. */
export interface SiteMeta {
  /** Default meta and Open Graph description. */
  description: string;
  /** Open Graph image path under public/, e.g. "/images/og.png". */
  image: string;
  /** Alt text for the Open Graph image. */
  imageAlt: string;
}

/** One headline metric in the hero stats banner. */
export interface StatItem {
  /** Number the counter animates to. */
  value: number;
  /** Fraction digits shown for `value`; 0 when omitted. */
  decimals?: number;
  /** Text after the number, e.g. "+", "k+" or "%". */
  suffix: string;
  /** Caption under the number. */
  label: string;
}

/**
 * Hero terminal line styles: `cmd` is a command including its "$ " prompt,
 * `out` is muted output, `ok` is success output and `key` is an
 * accent-coloured note.
 */
export type TerminalLineKind = "cmd" | "out" | "ok" | "key";

/** One line the hero terminal prints, in array order. */
export interface TerminalLine {
  kind: TerminalLineKind;
  text: string;
}

/** Content of the about section. */
export interface AboutContent {
  /** Section headline, e.g. "AI as efficient as it is intelligent". */
  headline: string;
  /** Bio paragraphs in reading order. */
  bio: string[];
  /** Core focus pillars in display order. */
  pillars: FocusPillar[];
  /** Engineering philosophy statement. */
  philosophy: string;
}

/** One core focus area in the about section. */
export interface FocusPillar {
  title: string;
  description: string;
  /** Topic labels shown as tags, e.g. "Quantization". */
  tags: string[];
}

/** Content of the tech stack section. */
export interface TechStack {
  /** Proficiency bars in display order. */
  skills: SkillItem[];
  /** Tool groups in display order. */
  categories: TechStackCategory[];
}

/** One proficiency bar in the tech stack section. */
export interface SkillItem {
  /** Skill name, e.g. "Rust Systems & Tokio Async". */
  label: string;
  /** Proficiency label shown beside the bar, e.g. "Expert". */
  level: string;
  /** Bar fill as an integer from 0 to 100. */
  percent: number;
}

/** A named group of tools in the tech stack section. */
export interface TechStackCategory {
  /** Category name, e.g. "AI & ML". */
  name: string;
  /** Tool names in display order. */
  tools: string[];
}

/** One role in the experience timeline. */
export interface ExperienceItem {
  role: string;
  company: string;
  /** Work location, e.g. "Nairobi / Remote"; omitted when not stated. */
  location?: string;
  period: YearRange;
  /** Description bullet points; text inside `**` pairs renders as strong emphasis. */
  highlights: string[];
  /** Technologies used in the role. */
  technologies: string[];
}

/** An inclusive span of calendar years. */
export interface YearRange {
  /** First year, e.g. 2021. */
  start: number;
  /** Last year, or null while the role is ongoing. */
  end: number | null;
}

/** One project card in the featured projects section. */
export interface ProjectItem {
  title: string;
  description: string;
  /** Technology and domain labels shown as tags. */
  tags: string[];
  /** Source repository and public site links in display order, e.g. a "Source" link with the "github" icon. */
  links: LinkItem[];
  /** Whether the project is listed under Featured Projects. */
  featured: boolean;
  /** One-line outcome shown under the tags, e.g. "Sub-15ms ML recommendation latency". */
  metric: string;
}

/** Copy for the contact section; the email button opens the `mailto:` link in `Profile.links`. */
export interface ContactContent {
  heading: string;
  body: string;
  /** Label of the email button, e.g. "Send an email". */
  ctaLabel: string;
}

/** Content of the site footer. */
export interface FooterContent {
  /** Rights holder and statement shown after "© <year> ", e.g. "Adioz. All rights reserved.". */
  copyright: string;
  /** Credit groups in display order, separated by " · ". */
  credits: CreditGroup[];
  /** Link to the site's source repository. */
  source: LinkItem;
}

/** A footer credit, e.g. "Built with" followed by links to the Astro and Tailwind CSS docs. */
export interface CreditGroup {
  /** Text before the links, e.g. "Built with". */
  label: string;
  /** Links to each tool's documentation. */
  links: LinkItem[];
}
