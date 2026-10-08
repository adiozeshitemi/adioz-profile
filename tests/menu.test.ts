// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_QUERY, startMenu } from "../src/scripts/menu";

let open = false;
let widen: (event: { matches: boolean }) => void = () => {};
let query = "";
let stop: () => void = () => {};

const sheet = () => document.getElementById("site-menu")!;
const toggle = () => document.querySelector<HTMLElement>(".menu-toggle")!;

/** Fires the sheet's toggle event for `state`, as the browser does. */
function toggleTo(state: "open" | "closed") {
  open = state === "open";
  const event = new Event("toggle");
  Object.defineProperty(event, "newState", { value: state });
  sheet().dispatchEvent(event);
}

beforeEach(() => {
  open = false;
  vi.stubGlobal("matchMedia", (media: string) => {
    query = media;
    return {
      matches: false,
      addEventListener: (_: string, listener: typeof widen) => {
        widen = listener;
      },
      removeEventListener: () => {},
    };
  });
  document.body.innerHTML = `
    <button class="menu-toggle" aria-label="Open sections menu" aria-expanded="false"
      data-label-open="Open sections menu" data-label-close="Close sections menu"></button>
    <nav id="site-menu" popover><ol><li><a href="#about">About</a></li></ol></nav>`;
  vi.spyOn(sheet(), "matches").mockImplementation(
    (selector: string) => selector === ":popover-open" && open,
  );
  sheet().hidePopover = vi.fn(() => toggleTo("closed"));
  stop = startMenu(sheet(), toggle());
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("startMenu", () => {
  it("labels the knob to close the sheet and marks it expanded while open", () => {
    toggleTo("open");
    expect(toggle().getAttribute("aria-label")).toBe("Close sections menu");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    toggleTo("closed");
    expect(toggle().getAttribute("aria-label")).toBe("Open sections menu");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the sheet when one of its links is chosen", () => {
    toggleTo("open");
    sheet()
      .querySelector("a")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sheet().hidePopover).toHaveBeenCalledOnce();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves the sheet alone on a click that is not on a link", () => {
    toggleTo("open");
    sheet()
      .querySelector("ol")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sheet().hidePopover).not.toHaveBeenCalled();
  });

  it("closes the open sheet when the viewport widens to the rail", () => {
    expect(query).toBe(MENU_QUERY);
    toggleTo("open");
    widen({ matches: true });
    expect(sheet().hidePopover).toHaveBeenCalledOnce();
  });

  it("does nothing on widening while the sheet is closed", () => {
    widen({ matches: true });
    expect(sheet().hidePopover).not.toHaveBeenCalled();
  });
});
