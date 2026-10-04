# System Architecture

## Overview

This portfolio is a statically generated site built with Astro and Tailwind CSS v4. Every page is pre-rendered at build time into static HTML and CSS, and no client-side JavaScript ships.

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

    %% Apply transparent class to subgraphs
    class Src transparent;
```

## 1. Pages and Components

- **`src/pages/index.astro`**: The only route (`/`). It renders `Hero` inside `Layout`.
- **`src/layouts/Layout.astro`**: The HTML shell: `title` and `description` props with defaults, Open Graph tags, the SVG favicon, and the `global.css` import.
- **`src/components/Hero.astro`**: The hero section: availability badge, headline, role, summary, and email and GitHub links.

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
- **CI:** `.github/workflows/ci.yml` runs the format check, type check and build on pull requests into `main`, and other workflows can call it.
- **Wrangler:** `wrangler.toml` configures the `adioz-dev` Cloudflare Worker to serve `dist/` as static assets; `npx wrangler dev` serves the build locally.
