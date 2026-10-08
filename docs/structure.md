# Project Structure

The directories and files currently in the repository.

```text
adioz-dev/
├── .github/
│   └── workflows/
│       ├── ci.yml             # Quality gate: format check, unit tests, type check and build
│       └── deploy.yml         # Production deploy on every push to main
│
├── .vscode/
│   ├── extensions.json        # Recommended editor extensions (Astro)
│   └── launch.json            # Dev server launch configuration
│
├── docs/                      # 📚 Documentation
│   ├── architecture.md        # System architecture
│   └── structure.md           # This file
│
├── public/                    # 🌍 Static assets (served as-is, no processing)
│   ├── fonts/                 # Self-hosted variable fonts and their OFL licenses
│   │   ├── jetbrains-mono-OFL.txt
│   │   ├── jetbrains-mono-variable.woff2
│   │   ├── montserrat-OFL.txt
│   │   └── montserrat-variable.woff2
│   ├── images/
│   │   ├── og.png             # Social share preview image (1200×630)
│   │   └── profile_pic.svg    # Profile avatar
│   ├── favicon.ico            # Favicon fallback (16, 32, 48 px)
│   ├── favicon.svg            # AD logo mark (site icon and header brand)
│   └── resume.pdf             # Downloadable resume; source of the experience and projects data
│
├── src/
│   ├── components/            # 🧩 UI components
│   │   ├── About/             # About section: bio, focus pillar cards, philosophy
│   │   │   ├── AboutSection.astro
│   │   │   └── CoreFocusCard.astro
│   │   ├── Contact/           # Contact section: email call to action
│   │   │   └── ContactSection.astro
│   │   ├── Experience/        # Experience section: timeline of roles
│   │   │   ├── ExperienceItem.astro
│   │   │   └── ExperienceSection.astro
│   │   ├── Footer/            # Site footer: copyright, credits, source link
│   │   │   └── Footer.astro
│   │   ├── Header/            # Sticky header: brand, section links, theme knob, menu drawer
│   │   │   ├── BrandLogo.astro
│   │   │   ├── Header.astro
│   │   │   ├── MobileMenu.astro
│   │   │   ├── NavLinks.astro
│   │   │   └── ThemeToggle.astro
│   │   ├── Hero/              # First screen: copy, call-to-action links, terminal, stats
│   │   │   ├── Hero.astro
│   │   │   ├── SocialLinks.astro
│   │   │   └── Terminal.astro
│   │   ├── Projects/          # Featured projects section: project cards
│   │   │   ├── ProjectCard.astro
│   │   │   └── ProjectsSection.astro
│   │   ├── TechStack/         # Tech stack section: skill bars, tool categories
│   │   │   ├── SkillBar.astro
│   │   │   ├── TagCloud.astro
│   │   │   └── TechStackSection.astro
│   │   └── UI/                # Reusable primitives: buttons, knobs, plates, tags, lamps, badges, emphasis, engraving filters, icons, stats, sections
│   │       ├── Badge.astro
│   │       ├── Button.astro
│   │       ├── Emphasis.astro
│   │       ├── EngravingFilters.astro
│   │       ├── Icon.astro
│   │       ├── Knob.astro
│   │       ├── Lamp.astro
│   │       ├── Nameplate.astro
│   │       ├── Plate.astro
│   │       ├── Screw.astro
│   │       ├── Section.astro
│   │       ├── SectionHeader.astro
│   │       ├── StatBanner.astro
│   │       ├── StatCard.astro
│   │       └── Tag.astro
│   ├── data/                  # 🗄️ Data layer
│   │   ├── about.json         # About section: id, label, headline, bio, pillars with icons, philosophy
│   │   ├── contact.json       # Contact section: id, label, heading, body, button label and icon
│   │   ├── experience.json    # Experience section: id, label, headline and roles, from public/resume.pdf
│   │   ├── footer.json        # Copyright, credit links and source link
│   │   ├── index.ts           # Typed exports of every JSON file (checked by astro check)
│   │   ├── navigation.json    # Header section links, contact link and menu labels
│   │   ├── profile.json       # Name, role, hero copy, calls to action, resume and social links
│   │   ├── projects.json      # Projects section: id, label, headline and projects, from public/resume.pdf
│   │   ├── site.json          # Default meta description and Open Graph image
│   │   ├── stats.json         # Headline metrics (the only place their values live)
│   │   ├── techStack.json     # Stack section: id, label, headline, intro, skill bars, tools by category
│   │   ├── terminal.json      # Hero terminal window title and lines
│   │   └── types.ts           # TypeScript interfaces for the portfolio content
│   ├── icons/                 # 🖼️ SVG icons inlined by Icon.astro, with their sources and licenses
│   │   ├── activity.svg
│   │   ├── arrow-right.svg
│   │   ├── arrow-up-right.svg
│   │   ├── astro.svg
│   │   ├── box.svg
│   │   ├── cloudflare.svg
│   │   ├── code-slash.svg
│   │   ├── download.svg
│   │   ├── email.svg
│   │   ├── github.svg
│   │   ├── globe.svg
│   │   ├── LICENSE.md
│   │   ├── linkedin.svg
│   │   └── tailwindcss.svg
│   ├── layouts/               # 🏗️ Page shells
│   │   └── Layout.astro       # HTML shell: SEO and Open Graph tags, theme-color, font preload, theme script
│   ├── pages/                 # 📄 File-based routes
│   │   └── index.astro        # Landing page (/)
│   ├── scripts/               # 📜 Client scripts
│   │   ├── motion.ts          # Header scroll state, stat counters, card spotlight
│   │   ├── theme-init.js      # Pre-paint theme: saved choice or the device's scheme
│   │   └── theme.ts           # Theme switching, saving and device tracking
│   └── styles/                # 🎨 Global styling
│       ├── animations.css     # Keyframes, scroll-driven reveal and fill, card spotlight, reduced motion
│       ├── engraving.css      # Main design engraved, carved and inlaid text
│       ├── global.css         # Tailwind import, @font-face rules, base styles
│       ├── metal.css          # Shared metal finishes: spun steel
│       ├── theme.css          # Design tokens (@theme), light-scheme overrides, main design tokens
│       └── typography.css     # Main design titles, section labels and section numbers
│
├── tests/                     # 🧪 Vitest unit tests (npm test)
│   ├── fixtures/
│   │   └── BareLayout.astro   # Stand-in for Layout.astro in page tests
│   ├── data.test.ts           # Data rules and load-time errors
│   ├── engraving.test.ts      # Engraving filters and engraved text styles
│   ├── page.test.ts           # Assembled landing page
│   ├── render.ts              # Container API rendering and happy-dom parsing
│   ├── sections.test.ts       # Header, sections and footer
│   ├── theme-toggle.test.ts   # Pre-paint theme script and theme switching
│   ├── theme.test.ts          # Main design tokens and their contrast
│   ├── typography.test.ts     # Main design type tokens, fonts and text styles
│   └── ui.test.ts             # UI primitives
│
├── .editorconfig              # Editor encoding, line endings and indentation
├── .gitignore
├── .nvmrc                     # Node.js version (24)
├── .prettierignore            # Files Prettier skips
├── .prettierrc                # Prettier config (Astro plugin)
├── AGENTS.md                  # Agent instructions
├── astro.config.mjs           # ⚙️ Astro config (site URL, Tailwind Vite plugin)
├── CLAUDE.md                  # Symlink to AGENTS.md
├── package-lock.json
├── package.json               # 📦 Dependencies and scripts
├── README.md
├── tsconfig.json              # 🦕 Strict TypeScript with path aliases
├── vitest.config.ts           # 🧪 Vitest config (Astro's getViteConfig)
└── wrangler.toml              # ☁️ Cloudflare Worker config (static assets from dist/, adioz.dev Custom Domain)
```

Not listed: generated or ignored directories (`node_modules/`, `dist/`, `.astro/`, `.wrangler/`) and `_`-prefixed prototype files.
