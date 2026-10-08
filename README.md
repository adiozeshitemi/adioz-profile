# Adioz - The Full-stack AI engineer Portfolio

## Professional Summary

<table>
<tr>
<td valign="top">
<img src="public/images/profile_pic.svg" alt="Adioz" height="179" style="border-radius: 12px;" />
</td>
<td width="560" valign="top">
Full-stack AI engineer with a background in backend systems and web applications. Takes AI into production for enterprise clients and owns each system from design to support. Builds tool-using agents that make real and auditable changes. Trains and distils models on GPU, then serves them on CPU. Believes AI should be as efficient as it is intelligent, so designs resource-aware AI: small, quantized models that meet tight latency budgets without wasted compute. Treats agents as production software, with typed tools, fail-closed guardrails and a named operator behind every change.
</td>
</tr>
</table>

## 🚀 Key Features

- **Static by Default**: Astro pre-renders the site to static HTML and CSS; the only client-side JavaScript is two short inline scripts, for the mobile menu and for motion.
- **Progressive Motion**: scroll-driven CSS reveals sections, fills the skill bars and drives a scroll progress bar where browsers support it; a small script adds the stat counters, the header's scroll state and the card spotlight. Every section is complete without them, and reduced motion turns them off.
- **Design Tokens in CSS**: Tailwind CSS v4 is configured in `src/styles/theme.css` with an `@theme` block (colors, fonts, radius, page width, header height, easing and breakpoints); there is no `tailwind.config.*` file.
- **Light and Dark Themes**: the colors follow the device's `prefers-color-scheme` setting until the visitor picks a theme with the header's theme knob; the choice is saved in `localStorage` and applied before first paint. Without JavaScript the device's setting applies. Text meets WCAG AA contrast in both themes.
- **Accessible Navigation**: a fixed header with section links from `src/data/navigation.json`; below 980px a menu knob opens them in an HTML popover sheet that `Escape`, a tap outside or a chosen link closes, that keyboard and screen-reader users cannot reach while closed, and whose knob is named for what a press does.
- **Search and Social Metadata**: `Layout.astro` sets the canonical URL and the Open Graph and Twitter card tags from `site` in `astro.config.mjs` and `src/data/site.json`.
- **Self-Hosted Fonts**: Montserrat and JetBrains Mono variable fonts are served from `public/fonts/` and preloaded; JetBrains Mono sets the hero terminal and the main design's section numbers.
- **Strict TypeScript**: `tsconfig.json` extends `astro/tsconfigs/strict` and defines path aliases (`@components/*`, `@layouts/*`, `@styles/*`, `@data/*`, `@utils/*`).
- **Consistent Formatting**: Prettier with the Astro plugin (`npm run format`, `npm run format:check`).
- **Unit Tests**: Vitest renders the components through the Astro Container API and checks the data rules, the UI primitives, every section and the assembled page (`npm test`).
- **CI Quality Gate**: `.github/workflows/ci.yml` checks formatting, runs the unit tests, type-checks and builds on pull requests into `main` and before every deployment.
- **Continuous Deployment**: `.github/workflows/deploy.yml` deploys every push to `main` to Cloudflare Workers at `adioz.dev` once the quality gate passes.

## 📚 Documentation

For a detailed breakdown of the project's layout and design philosophy, please refer to the internal documentation:

- [System Architecture](docs/architecture.md)
- [Project Structure](docs/structure.md)

## 🛠️ Tech Stack

- [![Astro](https://img.shields.io/badge/Astro-BC52EE?logo=astro&logoColor=fff&style=for-the-badge)](https://astro.build)
- [![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?logo=tailwindcss&logoColor=fff&style=for-the-badge)](https://tailwindcss.com/)
- [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff&style=for-the-badge)](https://www.typescriptlang.org/)

## 🔧 Getting Started

Requires Node.js 22.12 or newer; `.nvmrc` pins Node.js 24.

1. **Clone the repository**

   ```bash
   git clone https://github.com/adiozeshitemi/adioz-dev.git
   cd adioz-dev
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

4. **Build for production** (runs `astro check`, then writes the static site to `dist/`)

   ```bash
   npm run build
   ```

5. **Preview the production build**

   ```bash
   npm run preview
   ```

6. **Check formatting** (`npm run format` applies fixes)

   ```bash
   npm run format:check
   ```

7. **Run the unit tests** (`npm run test:watch` re-runs them on each change)

   ```bash
   npm test
   ```

## 📝 License

© 2026 Adioz. All rights reserved.
