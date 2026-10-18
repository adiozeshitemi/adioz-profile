/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Runs the tests through the project's Astro and Vite setup, so .astro
// components, JSON imports and import.meta.glob resolve as they do in a build.
// fsModuleCache is off: a cached module keeps the import.meta.glob matches it
// was transformed with, so a file added under src/data/workflows/ would stay
// unseen by src/lib/workflows.ts until the cache was cleared.
export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fsModuleCache: false,
  },
});
