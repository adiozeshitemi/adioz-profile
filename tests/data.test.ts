import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as data from "../src/data/index";
import {
  about,
  contact,
  experience,
  pipeline,
  profile,
  projects,
  sectionNumber,
  techStack,
  terminal,
} from "../src/data/index";
import type { TechStack, TerminalTone } from "../src/data/types";

/** Every string value in `value`, searched through arrays and objects. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

/** Every value of a key ending in "icon" (icon, ctaIcon) in `value`. */
function iconNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(iconNames);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      /icon$/i.test(key) && typeof entry === "string"
        ? [entry]
        : iconNames(entry),
    );
  }
  return [];
}

describe("data", () => {
  it("has an SVG in src/icons/ for every icon name", () => {
    const names = new Set(iconNames(data));
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      const file = new URL(`../src/icons/${name}.svg`, import.meta.url);
      expect(existsSync(file), `src/icons/${name}.svg`).toBe(true);
    }
  });

  it("pairs every ** emphasis marker", () => {
    for (const value of strings(data)) {
      expect(value.split("**").length % 2, value).toBe(1);
    }
  });

  it("gives every terminal line a writer, a message and a known tone", () => {
    const tones: (TerminalTone | undefined)[] = ["good", "bad", undefined];
    for (const line of terminal.lines) {
      expect(line.who).not.toBe("");
      expect(line.text).not.toBe("");
      expect(tones).toContain(line.tone);
    }
  });

  it("gives every pipeline part, in run order, a title and a detail", () => {
    expect(Object.keys(pipeline.parts)).toEqual([
      "request",
      "agent",
      "model",
      "tool",
      "guard",
      "pass",
      "fail",
    ]);
    for (const part of Object.values(pipeline.parts)) {
      expect(part.title).not.toBe("");
      expect(part.detail).not.toBe("");
    }
  });

  it("numbers the sections in navigation.json order", () => {
    const ids = [
      about.id,
      techStack.id,
      experience.id,
      projects.id,
      contact.id,
    ];
    expect(ids.map(sectionNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("throws for a section that no navigation link targets", () => {
    expect(() => sectionNumber("missing")).toThrow(
      'navigation.json: no link targets section "missing"',
    );
  });

  it("gives profile.json's email a mailto: link and contact.json https: links", () => {
    expect(profile.email.url.startsWith("mailto:")).toBe(true);
    for (const link of contact.links) {
      expect(link.url.startsWith("https:"), link.title).toBe(true);
    }
  });
});

// Each test imports src/data/index.ts afresh, so its JSON mocks apply.
describe("data loading", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../src/data/terminal.json");
    vi.doUnmock("../src/data/techStack.json");
  });

  it("rejects a terminal line with an unknown tone", async () => {
    vi.doMock("../src/data/terminal.json", () => ({
      default: {
        title: "agent.log",
        name: "agent.log",
        live: "live",
        lines: [{ who: "agent", text: "hello", tone: "loud" }],
      },
    }));
    await expect(import("../src/data/index")).rejects.toThrow(
      'terminal.json: unknown tone "loud"',
    );
  });

  it("rejects a skill percent outside 0 to 100", async () => {
    vi.doMock("../src/data/techStack.json", async (importOriginal) => {
      const original = await importOriginal<{ default: TechStack }>();
      return {
        default: {
          ...original.default,
          skills: [{ label: "Rust", level: "Expert", percent: 120 }],
        },
      };
    });
    await expect(import("../src/data/index")).rejects.toThrow(
      'techStack.json: percent 120 of "Rust" is not an integer from 0 to 100',
    );
  });
});
