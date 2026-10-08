/*
 * The phone menu's behaviour. The sheet is an HTML popover opened by the
 * knob's popovertarget; Escape and a tap outside close it natively.
 */

/** Below this width (61.25rem) the header shows the menu knob instead of the rail. */
export const MENU_QUERY = "(width >= 61.25rem)";

/**
 * Wires `sheet` to its `toggle`: choosing a link in the sheet closes it, as
 * does the viewport widening past MENU_QUERY; each change of the sheet's state
 * sets the knob's aria-expanded and its aria-label to data-label-close while
 * open and data-label-open while closed. Returns a function that stops it.
 */
export function startMenu(sheet: HTMLElement, toggle: HTMLElement): () => void {
  const close = () => {
    if (sheet.matches(":popover-open")) sheet.hidePopover();
  };
  const onClick = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("a")) close();
  };
  const onToggle = (event: Event) => {
    const open = (event as ToggleEvent).newState === "open";
    toggle.setAttribute("aria-expanded", String(open));
    const label = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
    if (label) toggle.setAttribute("aria-label", label);
  };
  const wide = matchMedia(MENU_QUERY);
  const onWiden = (event: MediaQueryListEvent) => {
    if (event.matches) close();
  };

  sheet.addEventListener("click", onClick);
  sheet.addEventListener("toggle", onToggle);
  wide.addEventListener("change", onWiden);

  return () => {
    sheet.removeEventListener("click", onClick);
    sheet.removeEventListener("toggle", onToggle);
    wide.removeEventListener("change", onWiden);
  };
}
