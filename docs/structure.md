# Project Structure

The directories and files currently in the repository.

```text
adioz-dev/
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
│   ├── favicon.svg            # AD logo mark
│   └── resume.pdf             # Downloadable resume
│
├── src/
│   ├── components/            # 🧩 UI components
│   │   └── Hero.astro         # Hero section
│   ├── layouts/               # 🏗️ Page shells
│   │   └── Layout.astro       # HTML shell, meta tags, global CSS import
│   ├── pages/                 # 📄 File-based routes
│   │   └── index.astro        # Landing page (/)
│   └── styles/                # 🎨 Global styling
│       ├── animations.css     # Keyframes, reveal transition, reduced-motion rules
│       ├── global.css         # Tailwind import, @font-face rules, base styles
│       └── theme.css          # Design tokens (@theme)
│
├── .gitignore
├── AGENTS.md                  # Agent instructions
├── astro.config.mjs           # ⚙️ Astro config (Tailwind Vite plugin)
├── CLAUDE.md                  # Symlink to AGENTS.md
├── package-lock.json
├── package.json               # 📦 Dependencies and scripts
├── README.md
└── tsconfig.json              # 🦕 Strict TypeScript with path aliases
```

Not listed: generated or ignored directories (`node_modules/`, `dist/`, `.astro/`) and `_`-prefixed prototype files.
