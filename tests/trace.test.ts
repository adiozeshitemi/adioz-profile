// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startTrace,
  startViewSwitch,
  tabTarget,
  traceLayout,
  traceOrder,
  yearOf,
} from "../src/scripts/trace";

const periods = [
  { start: 2025, end: null },
  { start: 2023, end: 2025 },
  { start: 2018, end: 2024 },
];

describe("trace scale", () => {
  it("reads a date as a fractional year", () => {
    expect(yearOf(new Date(2026, 0, 1))).toBe(2026);
    expect(yearOf(new Date(2026, 6, 1))).toBe(2026.5);
  });

  it("runs from the earliest start to the year after now, a tick per year", () => {
    const layout = traceLayout(periods, 2026.5);
    expect(layout.first).toBe(2018);
    expect(layout.years).toBe(9);
    expect(layout.ticks.map((tick) => tick.year)).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
    expect(layout.ticks.filter((tick) => tick.odd)).toHaveLength(4);
    expect(layout.nowAt).toBeCloseTo(8.5 / 9);
  });

  it("spans each role from the start of its first year to the end of its last, or to now", () => {
    const { spans, nowAt } = traceLayout(periods, 2026.5);
    expect(spans[0]).toEqual({ from: 7 / 9, to: nowAt, live: true });
    expect(spans[1]).toEqual({ from: 5 / 9, to: 8 / 9, live: false });
    expect(spans[2]).toEqual({ from: 0, to: 7 / 9, live: false });
  });

  it("orders the roles earliest start first, then earliest end", () => {
    expect(traceOrder(periods, 2026.5)).toEqual([2, 1, 0]);
    expect(
      traceOrder(
        [
          { start: 2023, end: null },
          { start: 2023, end: 2025 },
        ],
        2026.5,
      ),
    ).toEqual([1, 0]);
  });

  it("moves between tabs with the arrow keys, Home and End, wrapping", () => {
    expect(tabTarget("ArrowDown", 1, 4)).toBe(2);
    expect(tabTarget("ArrowRight", 3, 4)).toBe(0);
    expect(tabTarget("ArrowUp", 0, 4)).toBe(3);
    expect(tabTarget("ArrowLeft", 2, 4)).toBe(1);
    expect(tabTarget("Home", 2, 4)).toBe(0);
    expect(tabTarget("End", 0, 4)).toBe(3);
    expect(tabTarget("Enter", 0, 4)).toBeUndefined();
  });
});

describe("startTrace", () => {
  let enter: () => void = () => {};
  let stop: () => void = () => {};

  beforeEach(() => {
    enter = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          enter = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = `<div class="trace"><div role="tablist">${[
      0, 1, 2,
    ]
      .map(
        (index) =>
          `<button role="tab" id="tab-${index}" aria-controls="panel-${index}"
            aria-selected="${index === 2}" tabindex="${index === 2 ? 0 : -1}"></button>`,
      )
      .join("")}</div>${[0, 1, 2]
      .map(
        (index) =>
          `<div role="tabpanel" id="panel-${index}" ${index === 2 ? "" : "hidden"}></div>`,
      )
      .join("")}</div>`;
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  const trace = () => document.querySelector<HTMLElement>(".trace")!;
  const tabs = () => [...document.querySelectorAll<HTMLElement>("[role=tab]")];
  const selected = () =>
    tabs().map((tab) => tab.getAttribute("aria-selected") === "true");
  const shown = () =>
    [...document.querySelectorAll<HTMLElement>("[role=tabpanel]")].map(
      (panel) => !panel.hidden,
    );
  const key = (name: string) =>
    document
      .querySelector("[role=tablist]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true }),
      );

  it("selects a clicked tab and shows only its panel", () => {
    stop = startTrace(trace(), false);
    tabs()[0]!.click();
    expect(selected()).toEqual([true, false, false]);
    expect(shown()).toEqual([true, false, false]);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves selection and focus with the arrow keys, Home and End", () => {
    stop = startTrace(trace(), false);
    key("ArrowDown");
    expect(selected()).toEqual([true, false, false]);
    expect(document.activeElement).toBe(tabs()[0]);
    key("End");
    expect(selected()).toEqual([false, false, true]);
    key("ArrowUp");
    expect(selected()).toEqual([false, true, false]);
    key("Home");
    expect(shown()).toEqual([true, false, false]);
  });

  it("draws the spans once the trace comes into view", () => {
    stop = startTrace(trace(), false);
    expect(trace().classList.contains("drawn")).toBe(false);
    enter();
    expect(trace().classList.contains("drawn")).toBe(true);
  });

  it("draws the spans at once under reduced motion", () => {
    stop = startTrace(trace(), true);
    expect(trace().classList.contains("drawn")).toBe(true);
  });
});

describe("startViewSwitch", () => {
  beforeEach(() => {
    document.body.innerHTML = `<section>
      <div class="view-switch" hidden>
        <button data-view="trace" aria-pressed="false"></button>
        <button data-view="timeline" aria-pressed="true"></button>
      </div></section>`;
  });

  const section = () => document.querySelector<HTMLElement>("section")!;
  const pressed = () =>
    [...document.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-pressed"),
    );

  it("shows the switch and starts on the pressed view", () => {
    startViewSwitch(section());
    expect(document.querySelector<HTMLElement>(".view-switch")!.hidden).toBe(
      false,
    );
    expect(section().dataset.view).toBe("timeline");
  });

  it("switches the view and keeps aria-pressed in step", () => {
    startViewSwitch(section());
    document.querySelector<HTMLElement>("[data-view=trace]")!.click();
    expect(section().dataset.view).toBe("trace");
    expect(pressed()).toEqual(["true", "false"]);
  });
});
