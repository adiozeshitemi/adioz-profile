# Project Structure

The directories and files currently in the repository.

```text
adioz-dev/
├── .github/
│   └── workflows/
│       ├── ci.yml             # Quality gate: format check, type check and build
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
│   │   ├── Header/            # Sticky header: brand, section links, menu drawer
│   │   │   ├── BrandLogo.astro
│   │   │   ├── Header.astro
│   │   │   ├── MobileMenu.astro
│   │   │   └── NavLinks.astro
│   │   ├── Hero/              # First screen: copy, call-to-action links, terminal, stats
│   │   │   ├── Hero.astro
│   │   │   ├── SocialLinks.astro
│   │   │   └── Terminal.astro
│   │   └── UI/                # Reusable primitives: buttons, badges, emphasis, icons, stats, sections
│   │       ├── Badge.astro
│   │       ├── Button.astro
│   │       ├── Emphasis.astro
│   │       ├── Icon.astro
│   │       ├── Section.astro
│   │       ├── SectionHeader.astro
│   │       ├── StatBanner.astro
│   │       └── StatCard.astro
│   ├── data/                  # 🗄️ Data layer
│   │   ├── about.json         # About section: id, label, headline, bio, pillars with icons, philosophy
│   │   ├── contact.json       # Contact section heading, body and button label
│   │   ├── experience.json    # Career timeline, from public/resume.pdf
│   │   ├── footer.json        # Copyright, credit links and source link
│   │   ├── index.ts           # Typed exports of every JSON file (checked by astro check)
│   │   ├── navigation.json    # Header section links, contact link and menu labels
│   │   ├── profile.json       # Name, role, hero copy, calls to action, resume and social links
│   │   ├── projects.json      # Key projects and their links, from public/resume.pdf
│   │   ├── site.json          # Default meta description and Open Graph image
│   │   ├── stats.json         # Headline metrics (the only place their values live)
│   │   ├── techStack.json     # Proficiency bars and tools grouped by category
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
│   │   └── Layout.astro       # HTML shell: SEO and Open Graph tags, theme-color, font preload
│   ├── pages/                 # 📄 File-based routes
│   │   └── index.astro        # Landing page (/)
│   └── styles/                # 🎨 Global styling
│       ├── animations.css     # Keyframes, reveal transition, reduced-motion rules
│       ├── global.css         # Tailwind import, @font-face rules, base styles
│       └── theme.css          # Design tokens (@theme) and light-scheme overrides
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
└── wrangler.toml              # ☁️ Cloudflare Worker config (static assets from dist/, adioz.dev Custom Domain)
```

Not listed: generated or ignored directories (`node_modules/`, `dist/`, `.astro/`, `.wrangler/`) and `_`-prefixed prototype files.
