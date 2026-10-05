/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Runs the tests through the project's Astro and Vite setup, so .astro
// components, JSON imports and import.meta.glob resolve as they do in a build.
export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
