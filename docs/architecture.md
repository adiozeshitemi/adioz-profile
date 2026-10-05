# System Architecture

## Overview

This portfolio is a statically generated site built with Astro and Tailwind CSS v4. Every page is pre-rendered at build time into static HTML and CSS, and no client-side JavaScript ships. GitHub Actions deploy `main` to Cloudflare Workers as static assets, served at `adioz.dev`.

## Architecture Flow

```mermaid
flowchart LR
    %% Define invisible styling for subgraphs to remove backgrounds and borders
    classDef transparent fill:none,stroke:none;

    subgraph Src ["📁 src/"]
        direction TB
        Styles["styles/ (theme, animations, global)"]
        Layout["layouts/Layout.astro"]
        Hero["components/Hero.astro"]
        Page["pages/index.astro"]
    end

    Styles ==>|Imported by| Layout
    Layout ==>|Wraps| Page
    Hero ==>|Rendered in| Page
    Page ==>|astro check, astro build| Dist["⚡ dist/ (static HTML/CSS)"]
    Public["🌍 public/ (fonts, images, favicons, resume)"] ==>|Copied as-is| Dist
    Dist ==>|deploy.yml on push to main| Workers["☁️ Cloudflare Workers (adioz.dev)"]

    %% Apply transparent class to subgraphs
    class Src transparent;
```

## 1. Pages, Components and Data

- **`src/pages/index.astro`**: The only route (`/`). It renders `Hero` inside `Layout`.
- **`src/layouts/Layout.astro`**: The HTML shell: `title` and `description` props with defaults, Open Graph tags, the SVG favicon, and the `global.css` import.
- **`src/components/Hero.astro`**: The hero section: availability badge, headline, role, summary, and email and GitHub links.
- **`src/data/types.ts`**: TypeScript interfaces for the portfolio content: profile, stats, terminal lines, about, tech stack, experience, projects, contact and footer. Every type holds JSON-compatible values only; in `Profile.summary` and `ExperienceItem.highlights`, text inside `**` pairs marks strong emphasis.

## 2. Styling

Tailwind CSS v4 runs through the `@tailwindcss/vite` plugin registered in `astro.config.mjs`; there is no `tailwind.config.*` file.

- **`src/styles/theme.css`**: Design tokens in an `@theme` block (colors, fonts, radius, page width, easing, breakpoints). Each token is a CSS variable on `:root` and drives a Tailwind utility.
- **`src/styles/animations.css`**: Keyframes exposed as `animate-*` utilities, the `[data-reveal]` scroll transition, and reduced-motion rules.
- **`src/styles/global.css`**: Imports Tailwind and both files above, declares `@font-face` rules for the self-hosted fonts, and sets base element styles.

## 3. Static Assets

`public/` is served as-is: the self-hosted Montserrat and JetBrains Mono variable fonts with their licenses, the avatar and Open Graph image, the SVG and ICO favicons, and the resume PDF.

## 4. Rendering

The site is pre-rendered at build time (SSG). `npm run build` runs `astro check` (strict TypeScript) and then `astro build`, writing static HTML and CSS to `dist/`.

## 5. Tooling

- **Formatting:** Prettier with the Astro plugin (`npm run format`, `npm run format:check`).
- **CI:** `.github/workflows/ci.yml` runs the format check, type check and build on pull requests into `main`; `deploy.yml` also runs it before every deployment.
- **Deploy:** `.github/workflows/deploy.yml` runs on every push to `main` and calls `ci.yml` first. Once that passes, the deploy job builds the site and runs `wrangler deploy` through the official Wrangler action (Wrangler 4.147.0), authenticating with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. It writes the production URL to the run summary. Deployments never overlap: a newer push waits for the running deployment to finish.
- **Wrangler:** `wrangler.toml` configures the `adioz-dev` Cloudflare Worker to serve `dist/` as static assets at the `adioz.dev` Custom Domain, with the `workers.dev` URL and preview URLs disabled; `npx wrangler dev` serves the build locally.
- **Domain:** the `adioz.dev` zone is on Cloudflare DNS. Deploying the Worker creates the Custom Domain's DNS record and certificate. `www.adioz.dev` has a proxied placeholder record (`AAAA 100::`) and a Redirect Rule that sends `https://www.*` to `https://${1}` with a 301. Always Use HTTPS redirects plain-HTTP requests to HTTPS before that rule runs, and the edge accepts TLS 1.2 and 1.3 only. The Email Routing MX and TXT records forward `contact@adioz.dev`.
