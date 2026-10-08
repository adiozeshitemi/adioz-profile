// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillAt, readingLine, startTimeline } from "../src/scripts/timeline";

describe("timeline fill", () => {
  it("fills the share of the rail above the reading line", () => {
    expect(fillAt(500, 300, 400)).toBe(0.5);
    expect(fillAt(200, 300, 400)).toBe(0);
    expect(fillAt(900, 300, 400)).toBe(1);
    expect(fillAt(500, 300, 0)).toBe(0);
  });

  it("reads at the middle of the viewport, sliding to its bottom at the end of the page", () => {
    expect(readingLine(800, 2000)).toBe(400);
    expect(readingLine(800, 200)).toBe(600);
    expect(readingLine(800, 0)).toBe(800);
  });
});

describe("startTimeline", () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = `<ol class="timeline">${[0, 1, 2]
      .map(() => `<li class="stop"><span class="rivet"></span></li>`)
      .join("")}</ol>`;
    document.querySelectorAll<HTMLElement>(".stop").forEach((stop, index) => {
      Object.defineProperty(stop, "offsetTop", { value: index * 300 });
    });
    for (const rivet of document.querySelectorAll(".rivet")) {
      Object.defineProperty(rivet, "offsetTop", { value: 26 });
      Object.defineProperty(rivet, "offsetHeight", { value: 24 });
    }
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const timeline = () => document.querySelector<HTMLElement>(".timeline")!;
  const passed = () =>
    [...document.querySelectorAll(".stop")].map((stop) =>
      stop.classList.contains("passed"),
    );

  it("spans the rail between the first and last rivets' centres", () => {
    stop = startTimeline(timeline(), true);
    expect(timeline().style.getPropertyValue("--rail-top")).toBe("38px");
    expect(timeline().style.getPropertyValue("--rail-length")).toBe("600px");
  });

  it("fills the rail at once and passes every stop under reduced motion", () => {
    stop = startTimeline(timeline(), true);
    expect(timeline().style.getPropertyValue("--fill")).toBe("1.000");
    expect(passed()).toEqual([true, true, true]);
  });

  it("passes the stops the gold has reached", () => {
    vi.spyOn(timeline(), "getBoundingClientRect").mockReturnValue({
      top: 0,
    } as DOMRect);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
      100000,
    );
    stop = startTimeline(timeline(), false);
    const fill = Number(timeline().style.getPropertyValue("--fill"));
    expect(fill).toBeCloseTo((innerHeight / 2 - 38) / 600, 2);
    expect(passed()[0]).toBe(true);
    expect(passed()[2]).toBe(fill >= 1);
  });
});
