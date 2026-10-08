# System Architecture

## Overview

This portfolio is a statically generated site built with Astro and Tailwind CSS v4. Every page is pre-rendered at build time into static HTML and CSS; the only client-side JavaScript is a pre-paint theme script in `<head>` and short scripts for the theme knob, the mobile menu and motion effects, and every section is complete without them. GitHub Actions deploy `main` to Cloudflare Workers as static assets, served at `adioz.dev`. The colors follow the device's light or dark color scheme until the visitor picks a theme with the header's theme knob.

## Architecture Flow

```mermaid
flowchart LR
    %% Define invisible styling for subgraphs to remove backgrounds and borders
    classDef transparent fill:none,stroke:none;

    subgraph Src ["📁 src/"]
        direction TB
        Data["data/ (JSON content, typed exports)"]
        Styles["styles/ (theme, typography, engraving, metal, animations, global)"]
        Scripts["scripts/ (motion, theme)"]
        Icons["icons/ (SVG icons)"]
        UI["components/UI/ (primitives)"]
        Sections["components/ (header, page sections, footer)"]
        Layout["layouts/Layout.astro"]
        Page["pages/index.astro"]
    end

    Icons ==>|Inlined by| UI
    Data ==>|Imported by| UI
    Data ==>|Imported by| Sections
    UI ==>|Used by| Sections
    Data ==>|Imported by| Layout
    Styles ==>|Imported by| Layout
    Scripts ==>|Loaded by| Layout
    Sections ==>|Rendered in| Page
    Layout ==>|Wraps| Page
    Page ==>|astro check, astro build| Dist["⚡ dist/ (static HTML/CSS)"]
    Public["🌍 public/ (fonts, images, favicons, resume)"] ==>|Copied as-is| Dist
    Dist ==>|deploy.yml on push to main| Workers["☁️ Cloudflare Workers (adioz.dev)"]

    %% Apply transparent class to subgraphs
    class Src transparent;
```

## 1. Pages, Components and Data

- **`src/pages/index.astro`**: The only route (`/`). It renders `Header`; `Hero`, `AboutSection`, `TechStackSection`, `ExperienceSection`, `ProjectsSection` and `ContactSection` inside `<main>`; and `Footer`, all inside `Layout`.
- **`src/layouts/Layout.astro`**: The HTML shell. Its `title`, `description`, `image` and `imageAlt` props default to `profile.json` (title `<name> | <role>`) and `site.json`. It sets the canonical URL and the Open Graph and Twitter card tags as absolute URLs from `site` in `astro.config.mjs`, a `theme-color` for each color scheme (marked with `data-theme-color`), preloads the Montserrat and JetBrains Mono fonts, links the SVG and ICO favicons, imports `global.css`, inlines `src/scripts/theme-init.js` at the end of `<head>`, renders `EngravingFilters` at the start of `<body>`, and loads `src/scripts/motion.ts`.
- **`src/components/Header/`**: The site header, built from `navigation.json` and `profile.json`:
  - `Header.astro`: a sticky bar across the top of the page with a translucent, blurred background, transparent while the page is within 40px of the top (`data-at-top`, set by `motion.ts`). It holds the brand link, the section links (from 760px), the theme knob, the menu button (below 760px), and a scroll progress bar along its top edge.
  - `BrandLogo.astro`: a link to the top of the page with the logo mark, `public/favicon.svg` (the same file as the site icon), and `Profile.name` as a lowercase wordmark.
  - `NavLinks.astro`: the section links followed by the contact link, as an inline `bar` (the contact link styled as a button) or a stacked `drawer` list.
  - `ThemeToggle.astro`: the theme knob, a compact `Knob` whose face shows the theme a press switches to (the sun on the dark theme, the moon on the light one). Its accessible name is whichever of its two visually hidden labels ("Switch to light theme", "Switch to dark theme") matches `data-theme`, so it needs no script; a press calls `toggleTheme` from `src/scripts/theme.ts`. Without JavaScript the knob is hidden.
  - `MobileMenu.astro`: the menu button and the menu drawer, an HTML popover. While closed, the drawer is not rendered, so keyboard and screen-reader users cannot reach its links; `Escape` or a click outside closes it, and the browser exposes the button's expanded state. A short inline script closes the drawer when one of its links is followed or the viewport widens to 760px.
- **`src/components/Hero/`**: The first screen, built from `profile.json`, `terminal.json` and `stats.json`:
  - `Hero.astro`: the availability badge, the name and gradient headline, the role and specialty, the summary, the call-to-action buttons (the first one primary), the resume download link and the social links, beside the terminal from 1040px, with `StatBanner` underneath.
  - `SocialLinks.astro`: `Profile.links` as icon links named by their titles; `https:` links open in a new tab.
  - `Terminal.astro`: the window title, the lines as output, and an input line with a blinking caret, in one component. CSS animation delays print the lines 400ms apart after 600ms; the text is in the HTML from the start, and with reduced motion every line shows at once. The terminal keeps the dark palette in both color schemes (`data-scheme="dark"`) and is the only text set in JetBrains Mono.
- **`src/components/About/`**: The about section, built from `about.json`:
  - `AboutSection.astro`: a `Section` with the bio paragraphs under the headline, a `CoreFocusCard` per pillar (one column, two from 760px, three from 1040px), and the philosophy statement after the cards.
  - `CoreFocusCard.astro`: one pillar's icon, title, description and tags.
- **`src/components/TechStack/`**: The tech stack section, built from `techStack.json`:
  - `TechStackSection.astro`: a `Section` with the skills and the tool categories. The categories form two columns from 760px; from 1040px the skills sit beside them and stay in view below the sticky header while the categories scroll.
  - `SkillBar.astro`: a skill's label and level as a `<dt>`/`<dd>` pair, and a bar filled to its percent that is hidden from assistive technology.
  - `TagCloud.astro`: a category's name as an `<h3>` and its tools as chip badges.
- **`src/components/Experience/`**: The experience section, built from `experience.json`:
  - `ExperienceSection.astro`: a `Section` with an `ExperienceItem` per role, most recent first, along a vertical timeline rail.
  - `ExperienceItem.astro`: a role's years in `<time>` elements (an ongoing role ends with `ExperienceContent.ongoing`), its role, company and location, its highlights rendered with `Emphasis`, and its technologies as tags.
- **`src/components/Projects/`**: The featured projects section, built from `projects.json`:
  - `ProjectsSection.astro`: a `Section` with a `ProjectCard` per project with `featured` set, in two columns from 760px.
  - `ProjectCard.astro`: a project's title and links (`https:` links open in a new tab), description, tags and metric line. The description grows to fill the card, so the cards in a row align their tags and metric lines.
- **`src/components/Contact/ContactSection.astro`**: The contact section from `contact.json`: a centred panel with the numbered heading and body, a button that opens the `mailto:` link in `profile.json`, and the address it writes to. A `profile.json` without a `mailto:` link fails the build.
- **`src/components/Footer/Footer.astro`**: The site footer from `footer.json`: `©`, the build year and the copyright statement, then each credit group and the source link, with their icons. The items stack below 760px and share one line, separated by `·`, from 760px. The links are underlined and open in a new tab.
- **`src/components/UI/`**: Reusable primitives that render static HTML:
  - `Button.astro`: a `primary` (cyan-to-violet gradient) or `ghost` (outlined) button with an optional trailing icon, or a main design machined slab, `accent` (brushed gold on the dark theme, bronze on the light one) or `steel`: a brushed face with a highlight band at `--lx`, a 5px stepped wall slanted by `--lean`, an engraved label, and, with an `icon`, a spun steel cap holding it engraved (`data-rest` gives its angle at rest). `compact` sets the nav's size. Hover lifts a machined button 2px and press sinks it 3px; hover and focus light the cap's icon in `--accent-line`. With `href` it renders an `<a>`, and `external` opens the link in a new tab with `rel="noopener noreferrer"`; without `href` it renders a `<button>` whose `type` defaults to `button`.
  - `Badge.astro`: a `tag` (outlined label), `chip` (tool label) or `status` (pill with a pulsing success dot).
  - `EngravingFilters.astro`: the main design's SVG filters in one hidden, zero-size SVG that `Layout.astro` renders once per page: `#engrave` (small shapes cut into metal), `#carve` (large text cut into a plate), `#dial-groove` (a gauge arc shaded by its cut's upper wall) and `#dial-raise` (gauge ticks standing off the face).
  - `Emphasis.astro`: renders text with each `**` pair as `<strong>`; an unpaired `**` fails the build.
  - `Knob.astro`: the main design's round steel knob: a chamfered bezel on a 6px wall (3px when `compact`, 36px across instead of 62px) around a spun face holding an engraved `icon`, or the default slot's content. It renders an `<a>` with `href`, otherwise a `<button>` of type `button`; `label` is its accessible name, or a `label` slot outside the hidden face names it. Hover lifts it, press sinks it, and hover and focus light its icon in `--accent-line`.
  - `Icon.astro`: inlines `src/icons/<name>.svg` at a given pixel size. The icon is hidden from assistive technology unless it has a `label`, and a name with no SVG file fails the build.
  - `StatCard.astro`: one `stats.json` entry as a `<dt>` label and a `<dd>` value with its suffix, shown value first. The number carries `data-count` and `data-decimals` for the counter in `motion.ts`.
  - `StatBanner.astro`: a `<dl>` of `StatCard`s, every `stats.json` entry by default. It has one column on narrow screens, two from 420px (an odd last stat spans both), and one column per stat from 760px.
  - `Section.astro`: a numbered page section: the `<section>` with its id and accessible name, the page-width container, and a `SectionHeader` numbered by `sectionNumber`, with the paragraphs of its `intro` slot under the title.
  - `SectionHeader.astro`: a section's number and name (for example `01 — Core Engineering Focus`), its `<h2>` title and an optional intro, given as a string or as paragraphs in its default slot; `align="center"` centres it.
- **`src/icons/`**: One SVG per icon name used in the data (`LinkItem.icon`). Each file keeps only its path data, filled with `currentColor`, so an icon takes the color of the text around it. `LICENSE.md` lists the sources: Bootstrap Icons (MIT) and Simple Icons (CC0).
- **`src/data/types.ts`**: TypeScript interfaces for the portfolio content: profile, header navigation, stats, terminal lines, about, tech stack, experience, projects, contact and footer. Every type holds JSON-compatible values only, and every link is a `LinkItem` with a title, URL and icon name. In `Profile.summary` and `ExperienceItem.highlights`, text inside `**` pairs marks strong emphasis, which `Emphasis.astro` renders.
- **`src/data/*.json`**: The portfolio content, one file per type: `profile.json` (`Profile`: the name, role, hero copy, call-to-action, resume and social links), `navigation.json` (`Navigation`: the section links, the contact link and the accessible names of the navigation landmark and menu button), `stats.json` (`StatItem[]`, the only place the headline metric values live), `terminal.json` (`TerminalContent`: the window title and the lines), `about.json` (`AboutContent`: the section id and label, the headline, bio, pillars with their icons, and the philosophy), `techStack.json` (`TechStack`: the section id, label, headline and intro, the proficiency bars, and tools grouped by category), `experience.json` (`ExperienceContent`: the section id, label and headline, the text for an ongoing role's end year, and the roles), `projects.json` (`ProjectsContent`: the section id, label and headline, and the projects), `contact.json` (`ContactContent`: the section id and label, the heading, the body, and the email button's label and icon), `footer.json` (`FooterContent`) and `site.json` (`SiteMeta`: the default meta description and Open Graph image). The experience, projects, stats and tech stack categories follow the resume in `public/resume.pdf`.
- **`src/data/index.ts`**: Exports each JSON file typed by its interface, so `astro check` (run by `npm run build` and CI) rejects a file whose structure no longer matches. JSON imports type strings as `string`, so it checks `TerminalLine.kind` when it loads and throws on an unknown kind; it also throws on a skill percent that is not an integer from 0 to 100. `Layout.astro` imports `profile` and `site` from it, so either error fails the build. It also exports `sectionNumber(id)`, a section's position among the `navigation.json` links from 1, which throws when no link targets the section.

## 2. Styling

Tailwind CSS v4 runs through the `@tailwindcss/vite` plugin registered in `astro.config.mjs`; there is no `tailwind.config.*` file.

- **`src/styles/theme.css`**: Design tokens in an `@theme` block (colors, fonts, radius, page width, header height, easing, breakpoints). Each color token is `light-dark(light, dark)`, resolved by the `color-scheme` of the element using it: `:root[data-theme="dark"]` and `:root[data-theme="light"]` set it from the theme, and `[data-scheme="dark"]` keeps an element dark in both themes. With no `data-theme` (JavaScript off) `global.css`'s `color-scheme: light dark` follows the device. Text colors meet WCAG AA (4.5:1) in both schemes. Each token is a CSS variable on `:root` and drives a Tailwind utility.
  Beside them, as plain CSS variables read with `var()`, are the main design's tokens:
  - colours (`--bg`, `--text`, `--body`, `--label`, `--gold-text`, `--ember`), metal gradients (`--steel`, `--gold`, `--plate-metal`), the plate's wall, lip and ink (`--plate-wall-1` to `--plate-wall-5`, `--plate-lip`, `--plate-ink`, at 4.5:1 on every `--plate-metal` stop), metal outlines, drops and contact shadows (`--metal-outline`, `--metal-drop`, `--metal-contact`, `--metal-contact-lift`) and slab tones (`--slab-1` to `--slab-10`, `--slab-contact`, `--slab-ambient`), dark on `:root` and `[data-theme="dark"]`, light on `[data-theme="light"]`;
  - theme-independent metals and brushing noise (`--bronze-metal`, `--steel-brushed`, `--brush-noise`, `--brush-noise-soft`), the display weight and tracking (`--display-wght: 650`, `--track`) and the view tokens: `--lean` (registered, inherited, -1 at rest), `--slant` and `--lx` (registered, 70% at rest);
  - `.slab`, which builds `--slab-wall` (ten stepped box-shadows) and `--slab-drop` from the element's own `--depth` (6px unless set) and `--lean`.
- **`src/styles/typography.css`**: The main design's text styles: `.display` (hero title) and `.h2` (section title) in Montserrat at `--display-wght` with `--track`; `.eyebrow`, a section label in gold spaced capitals; and `.eyebrow-no`, the section number in JetBrains Mono engraved into a small brushed `--plate-metal` plate on a 3px wall.
- **`src/styles/engraving.css`**: The main design's text cut into metal, each a fill clipped to the glyphs under its lips: `.engraved` (cut into dark gunmetal: a shaded steel floor, a shadowed top lip and a lit bottom lip), `.carved` (large text cut into `--plate-metal` through `#carve`), `.inlaid` (gold, `--inlay-gold`, in a deep cut) and `.inlaid-steel` (steel, `--inlay-steel`, in a shallow cut), and `.engraved-icon` (an icon cut in through `#engrave`). The cut tokens (`--inlay-gold`, `--inlay-steel`, `--cut-shade`, `--cut-lip`, `--cut-lip-deep`) are in `theme.css`, per theme, with the button metal (`--button-metal`, `--button-shine`, `--button-wall-1` to `--button-wall-5`, `--button-tint`), `--accent-line` and the shared `--gold-brushed`.
- **`src/styles/metal.css`**: Metal finishes shared by components: `.spun`, circularly brushed steel (fine rings over a two-fold light cross starting at `--light`), the face of knobs and button caps.
- **`src/styles/animations.css`**: Keyframes exposed as `animate-*` utilities, the scroll-driven `[data-reveal]` and `[data-fill]` animations, the `.spot` card spotlight, and reduced-motion rules.
- **`src/styles/global.css`**: Imports Tailwind and the five files above, declares `@font-face` rules for the self-hosted fonts, and sets base element styles, including `color-scheme: light dark` and a `scroll-padding-top` of the header height, so a section reached through a link starts below the sticky header.
- **Component styles**: the components in `src/components/` use scoped `<style>` blocks that read the tokens as CSS variables (for example `var(--color-ink)`), so they follow both color schemes. Their media queries use the `--breakpoint-*` widths.

### Motion

Motion adds to markup that is complete without it. Where a browser lacks the features, or the visitor prefers reduced motion, every element shows in its final state.

- **Scroll-driven CSS**: inside `@supports (animation-timeline: view())` and `prefers-reduced-motion: no-preference`, `[data-reveal]` elements (section headers, cards, timeline roles, tool groups, the terminal and the contact panel) fade and rise into place as they enter the viewport, and the skill bars' `[data-fill]` grows from zero. The header's progress bar scales with `animation-timeline: scroll(root)` and is hidden where scroll timelines are unsupported.
- **`src/scripts/motion.ts`**: one small script, inlined into the page, for the effects CSS cannot express:
  - the header's `data-at-top` state, with its transitions enabled only after the first frame;
  - stat counters, which count up to each `data-count` value over one second the first time it enters the viewport, and are skipped for reduced motion;
  - the card spotlight, which writes the pointer position into `--mx` and `--my` on each `.spot` element.

### Theme

- **`src/scripts/theme-init.js`**: inlined at the end of `<head>`, so it runs before first paint. It sets `data-theme` on `<html>` to the theme saved in `localStorage` under `theme`, or to the device's color scheme when none is saved or storage is unavailable. A saved theme also sets `data-theme-saved` and gives both `theme-color` metas that theme's color.
- **`src/scripts/theme.ts`**: `currentTheme`, `setTheme` (shows a theme; with `save`, stores it, sets `data-theme-saved` and recolors the `theme-color` metas), `toggleTheme` (saves and shows the opposite theme) and `followDevice` (tracks the device's scheme while no theme is saved). Storage errors leave the choice applied to the page.

## 3. Static Assets

`public/` is served as-is: the self-hosted Montserrat and JetBrains Mono variable fonts with their licenses, the avatar and Open Graph image, the SVG and ICO favicons, and the resume PDF.

## 4. Rendering

The site is pre-rendered at build time (SSG). `npm run build` runs `astro check` (strict TypeScript) and then `astro build`, writing static HTML and CSS to `dist/`.

## 5. Tooling

- **Formatting:** Prettier with the Astro plugin (`npm run format`, `npm run format:check`).
- **CI:** `.github/workflows/ci.yml` runs the format check, the unit tests, the type check and the build on pull requests into `main`; `deploy.yml` also runs it before every deployment.
- **Tests:** `npm test` runs Vitest, configured in `vitest.config.ts` through Astro's `getViteConfig`, so `.astro` components, JSON imports and `import.meta.glob` resolve as they do in a build. `tests/render.ts` renders components with the Astro Container API and parses the HTML with happy-dom, so tests query elements and attributes:
  - `data.test.ts`: the data rules (an SVG for every icon name, terminal line kinds, paired `**` markers, one `mailto:` link, section numbering) and the load-time errors for an unknown terminal line kind and an out-of-range skill percent.
  - `ui.test.ts`: the UI primitives, including the machined `Button` variants and `Knob`.
  - `theme.test.ts`: the main design tokens in `theme.css`: every themed token in both themes, WCAG AA contrast of each text colour on `--bg` and of `--plate-ink` on every `--plate-metal` stop, the shared metals, type and view tokens, `.slab`'s wall and drop, a `light-dark()` value for every prototype color token, and the `color-scheme` set from `data-theme`.
  - `theme-toggle.test.ts` (happy-dom environment): `theme-init.js` with no saved theme, a saved theme, an unknown value and blocked storage, and `theme.ts`'s toggling, saving, `theme-color` recoloring and device tracking.
  - `engraving.test.ts`: the four filters in one hidden SVG rendered once by the layout, CSS references only to those filters, the import order, and each engraved style's fill, lips and filter.
  - `typography.test.ts`: the 650 display weight, the self-hosted weight ranges, the import order, and the title, label and section-number styles.
  - `sections.test.ts`: the header, each section and the footer against their data.
  - `page.test.ts`: the assembled landing page: a section for every navigation link, one `h1`, the landmarks and unique ids. `tests/fixtures/BareLayout.astro` stands in for `Layout.astro`, whose head needs `Astro.site`, which the Container API leaves unset.
- **Deploy:** `.github/workflows/deploy.yml` runs on every push to `main` and calls `ci.yml` first. Once that passes, the deploy job builds the site and runs `wrangler deploy` through the official Wrangler action (Wrangler 4.147.0), authenticating with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. It writes the production URL to the run summary. Deployments never overlap: a newer push waits for the running deployment to finish.
- **Wrangler:** `wrangler.toml` configures the `adioz-dev` Cloudflare Worker to serve `dist/` as static assets at the `adioz.dev` Custom Domain, with the `workers.dev` URL and preview URLs disabled; `npx wrangler dev` serves the build locally.
- **Domain:** the `adioz.dev` zone is on Cloudflare DNS. Deploying the Worker creates the Custom Domain's DNS record and certificate. `www.adioz.dev` has a proxied placeholder record (`AAAA 100::`) and a Redirect Rule that sends `https://www.*` to `https://${1}` with a 301. Always Use HTTPS redirects plain-HTTP requests to HTTPS before that rule runs, and the edge accepts TLS 1.2 and 1.3 only. The Email Routing MX and TXT records forward `contact@adioz.dev`.
