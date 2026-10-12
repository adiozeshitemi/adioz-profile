// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import site from "./src/data/site.json" with { type: "json" };

// https://astro.build/config
export default defineConfig({
  site: site.url,
  vite: {
    plugins: [tailwindcss()],
    // The 3D pipeline's chunk (src/scripts/pipeline3d.ts with Three.js, about 600 kB) loads after first paint.
    build: { chunkSizeWarningLimit: 700 },
    // The dev server bundles Three.js on start, before the pipeline's chunk imports it after first paint.
    optimizeDeps: {
      include: ["three", "three/addons/environments/RoomEnvironment.js"],
    },
  },
});
