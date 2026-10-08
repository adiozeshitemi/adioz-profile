/*
 * The visitor's theme. theme-init.js sets data-theme on <html> before first
 * paint; these functions change it afterwards. A theme the visitor picks is
 * saved in localStorage under THEME_KEY and marked with data-theme-saved; with
 * none saved, the theme follows the device's color scheme.
 */

export type Theme = "light" | "dark";

/** The localStorage key of the saved theme; theme-init.js reads the same key. */
export const THEME_KEY = "theme";

const DEVICE_LIGHT = "(prefers-color-scheme: light)";

/** The theme the page shows: data-theme on <html>, dark when unset. */
export function currentTheme(root = document.documentElement): Theme {
  return root.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Shows `theme`. With `save`, stores it under THEME_KEY (ignoring storage
 * errors), marks <html> with data-theme-saved, and gives every theme-color meta
 * the color of the meta whose data-theme-color is `theme`.
 */
export function setTheme(theme: Theme, { save }: { save: boolean }): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (!save) return;
  root.dataset.themeSaved = "";
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies to this page.
  }
  const color = document
    .querySelector(`meta[name="theme-color"][data-theme-color="${theme}"]`)
    ?.getAttribute("content");
  if (!color) return;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", color);
  }
}

/** Saves and shows the theme opposite the one showing, and returns it. */
export function toggleTheme(): Theme {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next, { save: true });
  return next;
}

/**
 * While no theme is saved, shows the device's scheme whenever it changes.
 * Returns a function that stops listening.
 */
export function followDevice(): () => void {
  const query = matchMedia(DEVICE_LIGHT);
  const update = () => {
    if ("themeSaved" in document.documentElement.dataset) return;
    setTheme(query.matches ? "light" : "dark", { save: false });
  };
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
