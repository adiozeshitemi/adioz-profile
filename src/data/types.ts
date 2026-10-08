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
  /**
   * An `https:` URL, a `mailto:` URL for email, a `#` link to a section of the
   * page, or the path of a file in public/, e.g. "/resume.pdf".
   */
  url: string;
  /** Icon name, e.g. "github". */
  icon: string;
}

/** A file in public/ that its link downloads. */
export interface ResumeLink extends LinkItem {
  /** Accessible name of the link, naming the file type, e.g. "Download resume (PDF)". */
  label: string;
  /** File name the download is saved under, e.g. "Adioz-Eshitemi-resume.pdf". */
  file: string;
}

/** The site owner's identity, shown in the hero. */
export interface Profile {
  /** Display name, e.g. "Adioz". */
  name: string;
  /** Job title, e.g. "Full-stack AI engineer". */
  role: string;
  /** Specialty shown after the role, e.g. "Agents & Resource-aware AI". */
  specialty: string;
  /** Hero headline that follows the name, e.g. "takes AI into production.". */
  headline: string;
  /** Hero summary paragraph; text inside `**` pairs renders as strong emphasis. */
  summary: string;
  /** Availability badge text, e.g. "Available for Senior/Staff Engineering Roles". */
  availability: string;
  /** Hero call-to-action buttons in display order. */
  actions: LinkItem[];
  /** The résumé in public/, downloaded from the knob after the hero's call-to-action buttons. */
  resume: ResumeLink;
  /** The email address as a `mailto:` link, carved into the contact section's nameplate. */
  email: LinkItem;
}

/** A link to a section of the page, e.g. "About" to "#about". */
export interface NavLink {
  /** Visible label and accessible name. */
  title: string;
  /** `#` followed by the id of the target section. */
  url: string;
}

/** The header navigation: a rail of links on wide screens, a menu sheet on narrow ones. */
export interface Navigation {
  /** Accessible name of the navigation landmarks, e.g. "Primary". */
  label: string;
  /** Accessible names of the menu knob while the sheet is closed and open. */
  menuLabel: { open: string; close: string };
  /** Section links in display order. */
  links: NavLink[];
  /** Contact link after the section links, styled as a button in the header bar. */
  cta: NavLink;
}

/** Site-wide copy: the page head's defaults (the default title is `Profile.name | Profile.role`) and the new-tab note. */
export interface SiteMeta {
  /** Default meta and Open Graph description. */
  description: string;
  /** Open Graph image path under public/, e.g. "/images/og.png". */
  image: string;
  /** Alt text for the Open Graph image. */
  imageAlt: string;
  /** Read after the label of a link that opens in a new tab, e.g. "(opens in a new tab)". */
  newTab: string;
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

/** A log message's tone: good shows in gold, bad in ember; omitted, it is plain. */
export type TerminalTone = "good" | "bad";

/** One entry of the hero's agent log. */
export interface TerminalLine {
  /** The part of the agent pipeline that wrote the entry, e.g. "guardrail". */
  who: string;
  /** The message, e.g. "✓ gates passed". */
  text: string;
  tone?: TerminalTone;
}

/** Content of the hero's agent log terminal. */
export interface TerminalContent {
  /** Text engraved in the title bar, e.g. "adioz — agent.log". */
  title: string;
  /** The window's name in its buttons' accessible names, e.g. "agent.log" in "Close agent.log". */
  name: string;
  /** The word engraved beside the red live lamp. */
  live: string;
  /** Entries in the order the log types them, cycling back to the first. */
  lines: TerminalLine[];
}

/** Content of the about section. */
export interface AboutContent {
  /** Section id, the target of its navigation.json link, e.g. "about". */
  id: string;
  /** Section name after its number, e.g. "Core Engineering Focus". */
  label: string;
  /** Section headline, a sentence ending in a full stop. */
  headline: string;
  /** Bio paragraphs in reading order. */
  bio: string[];
  /** The portrait engraved into pillar 00 and its text alternative. */
  portrait: { src: string; alt: string };
  /** Core focus pillars in display order, numbered from 01 after the portrait. */
  pillars: FocusPillar[];
  /** The service record plaque under the pillars. */
  record: ServiceRecord;
}

/** One core focus area in the about section. */
export interface FocusPillar {
  title: string;
  /** Icon name, e.g. "code-slash". */
  icon: string;
  description: string;
  /** Topic labels shown as tags, e.g. "Quantization". */
  tags: string[];
}

/** A plaque of traits, each an engraved word over a stamped line. */
export interface ServiceRecord {
  /** The plaque's caption, e.g. "Service record". */
  title: string;
  /** Traits in display order, e.g. "Robust" over "99% uptime held". */
  traits: { name: string; detail: string }[];
}

/** Content of the tech stack section. */
export interface TechStack {
  /** Section id, the target of its navigation.json link, e.g. "stack". */
  id: string;
  /** Section name after its number, e.g. "Tech Stack". */
  label: string;
  /** Section headline, e.g. "Architectural toolkit". */
  headline: string;
  /** Intro paragraph under the headline. */
  intro: string;
  /** Skills in display order, one gauge each. */
  skills: SkillItem[];
  /** Tool groups in display order. */
  categories: TechStackCategory[];
}

/** One skill in the tech stack's gauge cluster. */
export interface SkillItem {
  /** Skill name, e.g. "Rust Systems & Tokio Async". */
  label: string;
  /** Proficiency level, read as text and inlaid in the dial, e.g. "Expert". */
  level: string;
  /** The value the gauge needle settles on, an integer from 0 to 100. */
  percent: number;
}

/** A named group of tools in the tech stack section. */
export interface TechStackCategory {
  /** Category name, e.g. "AI & ML". */
  name: string;
  /** Tool names in display order. */
  tools: string[];
}

/** Content of the experience section. */
export interface ExperienceContent {
  /** Section id, the target of its navigation.json link, e.g. "experience". */
  id: string;
  /** Section name after its number, e.g. "Experience". */
  label: string;
  /** Section headline, a sentence ending in a full stop. */
  headline: string;
  /** Accessible name of the timeline's list of roles. */
  timelineLabel: string;
  /** The view switch: its accessible name and the Trace and Timeline button labels. */
  views: { label: string; trace: string; timeline: string };
  /** The career trace window: its engraved title, the accessible name of its tabs, the axis label of the present, and the word beside the live lamp. */
  trace: { title: string; rolesLabel: string; now: string; live: string };
  /** Text in place of the end year of an ongoing role, e.g. "Present". */
  ongoing: string;
  /** Roles in display order, most recent first. */
  roles: ExperienceItem[];
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

/** Content of the featured projects section. */
export interface ProjectsContent {
  /** Section id, the target of its navigation.json link, e.g. "projects". */
  id: string;
  /** Section name after its number, e.g. "Featured Projects". */
  label: string;
  /** Section headline, a sentence ending in a full stop. */
  headline: string;
  /** Projects in display order; the section shows those with `featured` set. */
  projects: ProjectItem[];
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
  /** One-line outcome shown under the tags beside a lamp; text inside `**` pairs renders as strong emphasis. */
  metric: string;
}

/** Copy for the contact section; the email button opens the `mailto:` link in `Profile.links`. */
export interface ContactContent {
  /** Section id, the target of its navigation.json link, e.g. "contact". */
  id: string;
  /** Section name after its number, e.g. "Contact". */
  label: string;
  /** Section headline, a sentence ending in a full stop. */
  headline: string;
  /** The paragraph above the email nameplate. */
  lead: string;
  /** The copy knob's accessible name and the status notes after a copy succeeds or fails. */
  copy: { label: string; copied: string; failed: string };
  /** Link ports in display order, each opening in a new tab, e.g. GitHub. */
  links: LinkItem[];
  /** Label of the last port, which downloads `Profile.resume`, e.g. "Résumé (PDF)". */
  resume: string;
}

/** Content of the site footer strip. */
export interface FooterContent {
  /** The rights holder engraved after "© <year> ", e.g. "Adioz D Eshitemi". */
  copyright: string;
  /** The back-to-top knob: its accessible name, its target and its icon. */
  top: LinkItem;
}

/** The parts of the hero's agent pipeline, in the order a request reaches them. */
export type PipelinePartName =
  "request" | "agent" | "model" | "tool" | "guard" | "pass" | "fail";

/** A part's label under it in the pipeline. */
export interface PipelinePart {
  /** The part's name, e.g. "Guardrail". */
  title: string;
  /** A short note under the name, e.g. "fail-closed gates". */
  detail: string;
}

/** The hero's agent pipeline. */
export interface PipelineContent {
  /** Accessible name of the pipeline figure, describing what it shows. */
  label: string;
  parts: Record<PipelinePartName, PipelinePart>;
}
