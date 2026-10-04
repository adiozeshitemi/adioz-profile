# Adioz - The Full-stack AI engineer Portfolio

## Professional Summary

<table>
<tr>
<td valign="top">
<img src="public/images/profile_pic.svg" alt="Adioz" height="179" style="border-radius: 12px;" />
</td>
<td width="560" valign="top">
Full-stack AI engineer with 8 years of experience in backend systems and web applications. Takes AI into production for enterprise clients and owns each system from design to support. Builds tool-using agents that make real and auditable changes. Trains and distils models on GPU, then serves them on CPU. Believes AI should be as efficient as it is intelligent, so designs resource-aware AI: small, quantized models that meet tight latency budgets without wasted compute. Treats agents as production software, with typed tools, fail-closed guardrails and a named operator behind every change.
</td>
</tr>
</table>

## 🚀 Key Features

- **Data-Driven Design**: Content is entirely decoupled from the UI. The `src/data` directory acts as a mock database and is the only place numbers such as headline metrics live.
- **API-Ready**: By utilizing TypeScript interfaces (`types.ts`), swapping the local JSON imports for a `fetch()` call to a backend API requires changing only a few lines in `index.astro`.
- **Modular Components**: Every section of the site (Hero, Tech Stack, Experience) is isolated into its own directory within `src/components`, making updates and testing straightforward.
- **Zero-JS by Default**: Leveraging Astro's architecture, the site ships static HTML and CSS; small scripts load only where interaction needs them (mobile menu, terminal, scroll effects).

## 📚 Documentation

For a detailed breakdown of the project's layout and design philosophy, please refer to the internal documentation:

- [System Architecture](docs/architecture.md)
- [Project Structure](docs/structure.md)

## 🛠️ Tech Stack

- [![Astro](https://img.shields.io/badge/Astro-BC52EE?logo=astro&logoColor=fff&style=for-the-badge)](https://astro.build)
- [![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?logo=tailwindcss&logoColor=fff&style=for-the-badge)](https://tailwindcss.com/)
- [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff&style=for-the-badge)](https://www.typescriptlang.org/)

## 🔧 Getting Started

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

## 📝 License

© 2026 Adioz. All rights reserved.
