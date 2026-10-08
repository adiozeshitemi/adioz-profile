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
│   │   └── profile_pic.svg    # Profile avatar
│   ├── apple-touch-icon.png   # Dividers mark home-screen icon (180 px)
│   ├── favicon.ico            # Dividers mark favicon fallback (16, 32, 48 px, transparent)
│   ├── favicon.svg            # Dividers mark site icon, metals follow the browser's colour scheme
│   ├── icon-192.png           # Web manifest icon
│   ├── icon-512.png           # Web manifest icon
│   ├── og.png                 # Main design link preview (1200×630)
│   ├── resume.pdf             # Downloadable resume; source of the experience and projects data
│   └── site.webmanifest       # Web app manifest: name and icons
│
├── src/
│   ├── components/            # 🧩 UI components
│   │   ├── About/             # Core Engineering Focus: portrait and pillars on a plate, service record
│   │   │   ├── AboutPortrait.astro
│   │   │   ├── AboutSection.astro
│   │   │   └── CoreFocusCard.astro
│   │   ├── Contact/           # Contact section: email nameplate, copy knob, link ports
│   │   │   └── ContactSection.astro
│   │   ├── Experience/        # Experience section: career trace and timeline, with the view switch
│   │   │   ├── CareerTrace.astro
│   │   │   ├── ExperienceItem.astro
│   │   │   └── ExperienceSection.astro
│   │   ├── Footer/            # Site footer: gunmetal strip with mark, copyright and back-to-top knob
│   │   │   └── Footer.astro
│   │   ├── Header/            # Fixed header: brand mark, rail of section links, theme knob, contact button, phone menu
│   │   │   ├── BrandLogo.astro
│   │   │   ├── Header.astro
│   │   │   ├── MobileMenu.astro
│   │   │   ├── NavLinks.astro
│   │   │   └── ThemeToggle.astro
│   │   ├── Hero/              # First screen: copy, actions, stats, 3D agent pipeline, agent log
│   │   │   ├── Hero.astro
│   │   │   ├── Pipeline3D.astro
│   │   │   └── Terminal.astro
│   │   ├── Projects/          # Featured projects section: machined cards with nameplates and link ports
│   │   │   ├── ProjectCard.astro
│   │   │   └── ProjectsSection.astro
│   │   ├── TechStack/         # Tech stack section: gauge cluster beside the tool categories
│   │   │   ├── Gauge.astro
│   │   │   ├── TagCloud.astro
│   │   │   └── TechStackSection.astro
│   │   └── UI/                # Reusable primitives: brand mark, buttons, knobs, panels, plates, ports, tags, lamps, emphasis, engraving filters, icons, stats, section titles
│   │       ├── BrandMark.astro
│   │       ├── Button.astro
│   │       ├── Emphasis.astro
│   │       ├── EngravingFilters.astro
│   │       ├── Icon.astro
│   │       ├── Knob.astro
│   │       ├── Lamp.astro
│   │       ├── Nameplate.astro
│   │       ├── Panel.astro
│   │       ├── ParticleField.astro
│   │       ├── Plate.astro
│   │       ├── Port.astro
│   │       ├── Screw.astro
│   │       ├── SectionTitle.astro
│   │       ├── StatBanner.astro
│   │       ├── StatCard.astro
│   │       └── Tag.astro
│   ├── data/                  # 🗄️ Data layer
│   │   ├── about.json         # About section: id, label, headline, bio, portrait, pillars with icons, service record
│   │   ├── contact.json       # Contact section: id, label, headline, lead, copy notes, link ports, résumé label
│   │   ├── experience.json    # Experience section: id, label, headline, view and trace labels, roles, from public/resume.pdf
│   │   ├── footer.json        # Copyright holder and back-to-top link
│   │   ├── index.ts           # Typed exports of every JSON file (checked by astro check)
│   │   ├── navigation.json    # Header section links, contact link and menu labels
│   │   ├── pipeline.json      # Agent pipeline figure label and each part's title and detail
│   │   ├── profile.json       # Name, role, hero copy, calls to action, resume and email
│   │   ├── projects.json      # Projects section: id, label, headline, new-tab words and projects, from public/resume.pdf
│   │   ├── site.json          # Page title, descriptions, link preview image and alt, new-tab words
│   │   ├── stats.json         # Headline metrics (the only place their values live)
│   │   ├── techStack.json     # Stack section: id, label, headline, intro, skills for the gauges, tools by category
│   │   ├── terminal.json      # Agent log title, window name, live word and entries
│   │   └── types.ts           # TypeScript interfaces for the portfolio content
│   ├── icons/                 # 🖼️ SVG icons inlined by Icon.astro, with their sources and licenses
│   │   ├── activity.svg
│   │   ├── arrow-right.svg
│   │   ├── arrow-up.svg
│   │   ├── box.svg
│   │   ├── code-slash.svg
│   │   ├── copy.svg
│   │   ├── download.svg
│   │   ├── email.svg
│   │   ├── file-text.svg
│   │   ├── github.svg
│   │   ├── globe.svg
│   │   ├── LICENSE.md
│   │   ├── linkedin.svg
│   │   └── send.svg
│   ├── layouts/               # 🏗️ Page shells
│   │   └── Layout.astro       # HTML shell: SEO and Open Graph tags, theme-color, font preload, theme script
│   ├── pages/                 # 📄 File-based routes
│   │   └── index.astro        # Landing page (/)
│   ├── scripts/               # 📜 Client scripts
│   │   ├── copy.ts            # Contact copy knob: Clipboard API with a textarea fallback
│   │   ├── field.ts           # Particle field: metal beads in depth layers, ripples
│   │   ├── gauges.ts          # Tech stack gauges: scale geometry, needle sweep and drag
│   │   ├── light.ts           # Pointer light: highlights, light crosses, panel glow, turning icons
│   │   ├── menu.ts            # Phone menu: closing the sheet, the knob's label and state
│   │   ├── motion.ts          # Header scroll state, stat counters
│   │   ├── pillars.ts         # About pillars: the .lit fallback and the swinging drawstrings
│   │   ├── pipeline3d.ts      # 3D agent pipeline: Three.js parts, conduits, pulse and labels
│   │   ├── rail.ts            # Header scroll spy and the rail's sliding gold plate
│   │   ├── terminal.ts        # Agent log: typing the entries and the window buttons
│   │   ├── theme-init.js      # Pre-paint theme: saved choice or the device's scheme
│   │   ├── theme.ts           # Theme switching, saving and device tracking
│   │   ├── tilt.ts            # Project cards swivelling toward the pointer
│   │   ├── timeline.ts        # Experience rail: span and gold fill as the page scrolls
│   │   ├── trace.ts           # Career trace: scale, tabs, span draw-in, view switch
│   │   └── view.ts            # View turn: raised parts lean away from the pointer
│   └── styles/                # 🎨 Global styling
│       ├── animations.css     # Reduced-motion override
│       ├── engraving.css      # Main design engraved, carved and inlaid text
│       ├── global.css         # Tailwind import, @font-face rules, base styles
│       ├── metal.css          # Shared metal finishes: spun steel
│       ├── theme.css          # Design tokens (@theme), light-scheme overrides, main design tokens
│       └── typography.css     # Main design titles, section labels and section numbers
│
├── tests/                     # 🧪 Vitest unit tests (npm test)
│   ├── fixtures/
│   │   └── BareLayout.astro   # Stand-in for Layout.astro in page tests
│   ├── brand.test.ts          # Brand files: sizes, favicon scheme switch, manifest
│   ├── copy.test.ts           # Copy action, its fallback and the knob's notes
│   ├── data.test.ts           # Data rules and load-time errors
│   ├── engraving.test.ts      # Engraving filters and engraved text styles
│   ├── field.test.ts          # Particle field helpers and drawing
│   ├── gauges.test.ts         # Gauge scale, needle springs, sweep and drag
│   ├── light.test.ts          # Pointer light helpers and frames
│   ├── menu.test.ts           # Phone menu sheet states
│   ├── page.test.ts           # Assembled landing page
│   ├── pillars.test.ts        # Pillar .lit fallback and drawstring physics
│   ├── pipeline.test.ts       # Agent pipeline markup, runs and WebGL fallback
│   ├── rail.test.ts           # Scroll spy, springs and the rail's plate
│   ├── render.ts              # Container API rendering and happy-dom parsing
│   ├── sections.test.ts       # Header, sections and footer
│   ├── terminal.test.ts       # Agent log typing and window buttons
│   ├── theme-toggle.test.ts   # Pre-paint theme script and theme switching
│   ├── theme.test.ts          # Main design tokens and their contrast
│   ├── tilt.test.ts           # Card tilt limits and motion
│   ├── timeline.test.ts       # Experience rail fill and passed stops
│   ├── trace.test.ts          # Career trace scale, tabs and view switch
│   ├── typography.test.ts     # Main design type tokens, fonts and text styles
│   ├── ui.test.ts             # UI primitives
│   └── view.test.ts           # View turn helpers and frames
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
