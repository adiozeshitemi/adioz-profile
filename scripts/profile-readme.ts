/*
 * Writes the GitHub profile README rendered from src/data to the path given
 * as the first argument, e.g. `node scripts/profile-readme.ts profile/README.md`.
 * The activity cards' URLs carry today's UTC day.
 */
import { writeFile } from "node:fs/promises";
import contact from "../src/data/contact.json" with { type: "json" };
import experience from "../src/data/experience.json" with { type: "json" };
import profile from "../src/data/profile.json" with { type: "json" };
import projects from "../src/data/projects.json" with { type: "json" };
import site from "../src/data/site.json" with { type: "json" };
import techStack from "../src/data/techStack.json" with { type: "json" };
import { renderProfileReadme } from "../src/lib/profileReadme.ts";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/profile-readme.ts <README path>");
  process.exit(1);
}

await writeFile(
  out,
  renderProfileReadme({
    profile,
    techStack,
    projects,
    contact,
    activity: experience.activity,
    site,
    day: new Date().toISOString().slice(0, 10),
  }),
);
console.log(`Wrote ${out}`);
