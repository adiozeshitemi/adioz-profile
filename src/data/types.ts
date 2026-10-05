/*
 * Content types for the portfolio's data layer. Every type holds only
 * JSON-compatible values: strings, numbers, booleans, null, arrays and plain
 * objects.
 */

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
  social: SocialLinks;
}

/** Contact links for the hero icons and the contact section. */
export interface SocialLinks {
  /** GitHub profile URL. */
  github: string;
  /** LinkedIn profile URL. */
  linkedin: string;
  /** Email address without the `mailto:` scheme. */
  email: string;
}

/** One headline metric in the hero stats banner. */
export interface StatItem {
  /** Number the counter animates to, e.g. 99.99. */
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
  /** Work location, e.g. "Nairobi / Remote". */
  location: string;
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
  /** Source repository URL, or null for a closed-source project. */
  repoUrl: string | null;
  /** Public site or product URL, or null when none is public. */
  liveUrl: string | null;
  /** Whether the project is listed under Featured Projects. */
  featured: boolean;
  /** One-line outcome shown under the tags, e.g. "Sub-15ms ML recommendation latency". */
  metric: string;
}

/** Copy for the contact section; the email address is `SocialLinks.email`. */
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
  /** Credit lines joined with " · ", e.g. "Built with Astro & Tailwind CSS". */
  credits: string[];
  /** URL of the site's source repository. */
  sourceUrl: string;
}
