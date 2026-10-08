// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_KEY,
  currentTheme,
  followDevice,
  setTheme,
  toggleTheme,
} from "../src/scripts/theme";
import themeInit from "../src/scripts/theme-init.js?raw";

/** A matchMedia stub whose "(prefers-color-scheme: light)" matches while `light.value` is true. */
function stubDevice(light: { value: boolean }) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("light") ? light.value : !light.value;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  return () => listeners.forEach((listener) => listener());
}

/** Runs theme-init.js as the head script does. */
function runInit() {
  new Function(themeInit)();
}

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
  delete root.dataset.themeSaved;
  document.head.innerHTML = `
    <meta name="theme-color" content="#eceef2" media="(prefers-color-scheme: light)" data-theme-color="light">
    <meta name="theme-color" content="#08090b" media="(prefers-color-scheme: dark)" data-theme-color="dark">`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const metaColors = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
    meta.getAttribute("content"),
  );

describe("theme-init.js", () => {
  it("follows the device when no theme is saved", () => {
    stubDevice({ value: true });
    runInit();
    expect(root.dataset.theme).toBe("light");
    expect("themeSaved" in root.dataset).toBe(false);
    expect(metaColors()).toEqual(["#eceef2", "#08090b"]);
  });

  it("applies a saved theme over the device's and its theme-color", () => {
    stubDevice({ value: true });
    localStorage.setItem(THEME_KEY, "dark");
    runInit();
    expect(root.dataset.theme).toBe("dark");
    expect("themeSaved" in root.dataset).toBe(true);
    expect(metaColors()).toEqual(["#08090b", "#08090b"]);
  });

  it("ignores an unknown saved value", () => {
    stubDevice({ value: false });
    localStorage.setItem(THEME_KEY, "sepia");
    runInit();
    expect(root.dataset.theme).toBe("dark");
    expect("themeSaved" in root.dataset).toBe(false);
  });

  it("follows the device when storage throws", () => {
    stubDevice({ value: true });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    runInit();
    expect(root.dataset.theme).toBe("light");
  });
});

describe("theme.ts", () => {
  it("reads dark when no theme is set", () => {
    expect(currentTheme()).toBe("dark");
  });

  it("toggles to the opposite theme, saves it and recolors theme-color", () => {
    root.dataset.theme = "dark";
    expect(toggleTheme()).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect("themeSaved" in root.dataset).toBe(true);
    expect(metaColors()).toEqual(["#eceef2", "#eceef2"]);
    expect(toggleTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("still switches the page when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setTheme("light", { save: true });
    expect(root.dataset.theme).toBe("light");
  });

  it("follows device changes until a theme is saved", () => {
    const light = { value: false };
    const change = stubDevice(light);
    root.dataset.theme = "dark";
    const stop = followDevice();
    light.value = true;
    change();
    expect(root.dataset.theme).toBe("light");
    setTheme("dark", { save: true });
    light.value = false;
    change();
    light.value = true;
    change();
    expect(root.dataset.theme).toBe("dark");
    stop();
  });
});
