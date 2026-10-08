// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOSE_TIME,
  KEEP,
  KEEP_ZOOMED,
  LINE_GAP,
  LOG_EVENT,
  type LogEntry,
  clock,
  startLog,
  startWindow,
} from "../src/scripts/terminal";

let stop: () => void = () => {};
let onScreen: IntersectionObserverCallback = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        onScreen = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  document.body.innerHTML = `
    <button class="log-reopen" type="button" hidden>Open agent.log</button>
    <figure class="log">
      <div class="log-bar">
        <button class="light close" disabled></button>
        <button class="light min" aria-pressed="false" disabled></button>
        <button class="light zoom" aria-pressed="false" disabled></button>
      </div>
      <ol class="screen">
        ${Array.from(
          { length: 10 },
          (_, index) =>
            `<li><span class="who">w${index}</span><span class="message">m${index}</span></li>`,
        ).join("")}
      </ol>
    </figure>
    <div class="log-shade" popover="manual"></div>`;
  for (const element of [log(), shade()]) {
    element.showPopover = vi.fn();
    element.hidePopover = vi.fn();
  }
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const log = () => document.querySelector<HTMLElement>(".log")!;
const screen = () => document.querySelector<HTMLElement>(".screen")!;
const shade = () => document.querySelector<HTMLElement>(".log-shade")!;
const reopen = () => document.querySelector<HTMLButtonElement>(".log-reopen")!;
const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`.light.${name}`)!;
const messages = () =>
  [...screen().querySelectorAll(".message")].map((m) => m.textContent);

describe("clock", () => {
  it("reads a date as a padded 24-hour time", () => {
    expect(clock(new Date(2026, 0, 1, 7, 5, 9))).toBe("07:05:09");
    expect(clock(new Date(2026, 0, 1, 23, 59, 0))).toBe("23:59:00");
  });
});

describe("startLog", () => {
  it("starts from the first entry, stamped with the clock time", () => {
    vi.setSystemTime(new Date(2026, 0, 1, 9, 30, 15));
    stop = startLog(screen(), false);
    expect(messages()).toEqual(["m0"]);
    expect(screen().querySelector("li time")?.textContent).toBe("09:30:15");
  });

  it("types one entry every LINE_GAP ms and keeps the newest KEEP", () => {
    stop = startLog(screen(), false);
    vi.advanceTimersByTime(LINE_GAP * 7);
    expect(messages()).toHaveLength(KEEP);
    expect(messages().at(-1)).toBe("m7");
  });

  it("cycles back to the first entry after the last", () => {
    stop = startLog(screen(), false);
    vi.advanceTimersByTime(LINE_GAP * 10);
    expect(messages().at(-1)).toBe("m0");
  });

  it("keeps KEEP_ZOOMED entries while the log is zoomed", () => {
    log().classList.add("zoomed");
    stop = startLog(screen(), false);
    vi.advanceTimersByTime(LINE_GAP * 20);
    expect(messages()).toHaveLength(KEEP_ZOOMED);
  });

  it("pauses while the log is off screen", () => {
    stop = startLog(screen(), false);
    const entry = (isIntersecting: boolean) =>
      [{ isIntersecting } as IntersectionObserverEntry] as const;
    onScreen([...entry(false)], {} as IntersectionObserver);
    vi.advanceTimersByTime(LINE_GAP * 3);
    expect(messages()).toEqual(["m0"]);
    onScreen([...entry(true)], {} as IntersectionObserver);
    vi.advanceTimersByTime(LINE_GAP);
    expect(messages()).toEqual(["m0", "m1"]);
  });

  it("leaves the rendered entries untouched under reduced motion", () => {
    stop = startLog(screen(), true);
    vi.advanceTimersByTime(LINE_GAP * 3);
    expect(messages()).toHaveLength(10);
    expect(screen().querySelector("time")).toBeNull();
  });
});

describe("startWindow", () => {
  beforeEach(() => {
    stop = startWindow(log(), reopen(), shade(), false);
  });

  it("enables the window buttons", () => {
    for (const name of ["close", "min", "zoom"]) {
      expect(button(name).disabled).toBe(false);
    }
  });

  it("closes the log and focuses the reopen button, which brings it back", () => {
    button("close").click();
    expect(log().classList.contains("closing")).toBe(true);
    vi.advanceTimersByTime(CLOSE_TIME);
    expect(log().classList.contains("closed")).toBe(true);
    expect(reopen().hidden).toBe(false);
    expect(document.activeElement).toBe(reopen());
    reopen().click();
    expect(log().classList.contains("closed")).toBe(false);
    expect(reopen().hidden).toBe(true);
    expect(document.activeElement).toBe(button("close"));
  });

  it("minimises and restores the screen, reporting it in aria-pressed", () => {
    button("min").click();
    expect(log().classList.contains("minimised")).toBe(true);
    expect(button("min").getAttribute("aria-pressed")).toBe("true");
    button("min").click();
    expect(log().classList.contains("minimised")).toBe(false);
    expect(button("min").getAttribute("aria-pressed")).toBe("false");
  });

  it("zooms the log over the shade, leaving a placeholder in the page", () => {
    button("zoom").click();
    expect(log().classList.contains("zoomed")).toBe(true);
    expect(log().getAttribute("popover")).toBe("manual");
    expect(shade().showPopover).toHaveBeenCalled();
    expect(log().showPopover).toHaveBeenCalled();
    expect(log().previousElementSibling?.className).toBe("log-placeholder");
    expect(button("zoom").getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    ["zoom again", () => button("zoom").click()],
    [
      "Esc",
      () => dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    ],
    ["a click on the shade", () => shade().click()],
    ["close", () => button("close").click()],
  ])("puts the zoomed log back on %s", (_, action) => {
    button("zoom").click();
    action();
    expect(log().classList.contains("zoomed")).toBe(false);
    expect(log().hasAttribute("popover")).toBe(false);
    expect(shade().hidePopover).toHaveBeenCalled();
    expect(document.querySelector(".log-placeholder")).toBeNull();
    expect(button("zoom").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("startLog driven by the pipeline", () => {
  const write = (detail: LogEntry) =>
    dispatchEvent(new CustomEvent(LOG_EVENT, { detail }));

  it("clears its own entries and writes each LOG_EVENT entry with its tone", () => {
    stop = startLog(screen(), false);
    write({ who: "guardrail", text: "✗ gate failed", tone: "bad" });
    expect(messages()).toEqual(["✗ gate failed"]);
    const entry = screen().lastElementChild!;
    expect(entry.querySelector("time")).not.toBeNull();
    expect(entry.querySelector(".who")?.textContent).toBe("guardrail");
    expect(entry.querySelector(".message")?.classList.contains("bad")).toBe(
      true,
    );
  });

  it("stops typing its own script once the pipeline writes", () => {
    stop = startLog(screen(), false);
    write({ who: "request", text: "plain-language change" });
    vi.advanceTimersByTime(LINE_GAP * 3);
    expect(messages()).toEqual(["plain-language change"]);
  });
});
