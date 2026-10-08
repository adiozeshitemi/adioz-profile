// Inlined at the end of <head> by Layout.astro, so it runs before first paint.
// Sets data-theme on <html> to the theme saved in localStorage under "theme"
// (THEME_KEY in theme.ts), or to the device's color scheme when none is saved
// or storage is unavailable. A saved theme also sets data-theme-saved and gives
// every theme-color meta that theme's color, read from the meta marked with its
// data-theme-color.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("theme");
  } catch (error) {}
  var saved = theme === "light" || theme === "dark";
  if (!saved) {
    theme = matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  var root = document.documentElement;
  root.dataset.theme = theme;
  if (!saved) return;
  root.dataset.themeSaved = "";
  var source = document.querySelector(
    'meta[name="theme-color"][data-theme-color="' + theme + '"]',
  );
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var index = 0; index < metas.length; index++) {
    metas[index].setAttribute("content", source.getAttribute("content"));
  }
})();
