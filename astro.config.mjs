// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import site from "./src/data/site.json" with { type: "json" };

// https://astro.build/config
export default defineConfig({
  site: site.url,
  vite: {
    plugins: [tailwindcss()],
    // Three.js (about 600 kB) builds into one chunk, shared by the hero's pipeline (src/scripts/pipeline3d.ts) and the workflow board (src/scripts/board3d.ts), which load it after first paint.
    build: { chunkSizeWarningLimit: 700 },
    // The dev server bundles Three.js and the addons the pipeline and the board use on start, before their chunks import them after first paint.
    optimizeDeps: {
      include: [
        "three",
        "three/addons/environments/RoomEnvironment.js",
        "three/addons/geometries/RoundedBoxGeometry.js",
        "three/addons/utils/BufferGeometryUtils.js",
      ],
    },
  },
});
