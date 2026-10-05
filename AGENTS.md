## Development

Requires Node.js 22.12 or newer; `.nvmrc` pins Node.js 24. The `package.json` scripts:

- `npm run dev`: starts the Astro dev server, at `http://localhost:4321` by default. It runs in the foreground until stopped.
- `npm run build`: runs `astro check` (strict TypeScript), then `astro build`, writing the static site to `dist/`.
- `npm run preview`: serves the `dist/` build locally.
- `npm run format:check`: checks formatting with Prettier; `npm run format` rewrites files to fix it.
- `npm test`: runs the Vitest unit tests in `tests/` once; `npm run test:watch` re-runs them on each change.

Run `npm run format:check`, `npm test` and `npm run build` before committing. CI (`.github/workflows/ci.yml`) runs the same three commands on pull requests into `main` and before every deployment.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
