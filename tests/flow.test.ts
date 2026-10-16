// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_STEP_MS,
  arrowHead,
  keyTarget,
  routeWires,
  startFlow,
  stepHops,
  wirePath,
  wrapStep,
  type Box,
  type PlacedNode,
  type Point,
} from "../src/scripts/flow";

describe("stepHops", () => {
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "a" },
    { from: "x", to: "c" },
  ];

  it("lights a hop whose target the step lights and whose source it or the step before lights", () => {
    const steps = [
      { lights: ["a"] },
      { lights: ["b"] },
      { lights: ["x", "c"] },
      { lights: ["a"] },
    ];
    expect(stepHops(steps, edges)).toEqual([[], [0], [1, 3], [2]]);
  });
});

/** Boxes 100 by 40 on a grid with 40px gutters and 20px padding. */
function grid(cells: [number, number][]): PlacedNode[] {
  return cells.map(([col, row]) => {
    const left = 20 + col * 140;
    const top = 20 + row * 80;
    return {
      col,
      row,
      box: { left, top, right: left + 100, bottom: top + 40 },
    };
  });
}

/** Whether the run from `a` to `b` passes through the inside of `box`. */
function crosses(a: Point, b: Point, box: Box) {
  const inside = (x: number, y: number) =>
    x > box.left + 1 &&
    x < box.right - 1 &&
    y > box.top + 1 &&
    y < box.bottom - 1;
  for (let t = 0; t <= 1; t += 0.02) {
    if (inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true;
  }
  return false;
}

describe("routeWires", () => {
  it("joins neighbours in a row or column straight across their gutter", () => {
    const nodes = grid([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    const [across, down] = routeWires(
      nodes,
      [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ],
      20,
    );
    expect(across).toEqual([
      [120, 40],
      [160, 40],
    ]);
    expect(down).toEqual([
      [210, 60],
      [210, 100],
    ]);
  });

  it("runs every wire through gutters only, so none crosses a box", () => {
    const nodes = grid([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    const edges = [
      { from: 0, to: 2 },
      { from: 0, to: 5 },
      { from: 4, to: 0 },
      { from: 7, to: 0 },
      { from: 5, to: 2 },
      { from: 1, to: 6 },
    ];
    const routes = routeWires(nodes, edges, 20);
    routes.forEach((points, index) => {
      const { from, to } = edges[index]!;
      for (let i = 1; i < points.length; i++) {
        for (const [at, node] of nodes.entries()) {
          if (at === from || at === to) continue;
          expect(
            crosses(points[i - 1]!, points[i]!, node.box),
            `${from}>${to}`,
          ).toBe(false);
        }
      }
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1]!, points[i]!];
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
      }
    });
  });

  it("spreads wires that leave one side of a box along it", () => {
    const nodes = grid([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    const routes = routeWires(
      nodes,
      [
        { from: 1, to: 0 },
        { from: 2, to: 0 },
      ],
      20,
    );
    const ends = routes.map((points) => points.at(-1)!);
    expect(ends[0]).not.toEqual(ends[1]);
  });
});

describe("wire drawing", () => {
  it("rounds each corner and ends with a line", () => {
    const d = wirePath([
      [0, 0],
      [40, 0],
      [40, 40],
    ]);
    expect(d).toBe("M0 0 L32 0 Q40 0 40 8 L40 40");
  });

  it("points the arrowhead along the last run", () => {
    expect(
      arrowHead([
        [0, 0],
        [0, 20],
      ]),
    ).toBe("M0 20 L-3.9 13 L3.9 13 Z");
  });
});

describe("the step bar's moves", () => {
  it("wraps a step past either end round to the other", () => {
    expect(wrapStep(4, 4)).toBe(0);
    expect(wrapStep(-1, 4)).toBe(3);
    expect(wrapStep(2, 4)).toBe(2);
  });

  it("moves one step with ArrowLeft and ArrowRight and to the ends with Home and End, stopping at the ends", () => {
    expect(keyTarget("ArrowRight", 0, 4)).toBe(1);
    expect(keyTarget("ArrowLeft", 2, 4)).toBe(1);
    expect(keyTarget("ArrowLeft", 0, 4)).toBe(0);
    expect(keyTarget("ArrowRight", 3, 4)).toBe(3);
    expect(keyTarget("End", 0, 4)).toBe(3);
    expect(keyTarget("Home", 3, 4)).toBe(0);
    expect(keyTarget("ArrowUp", 1, 4)).toBeUndefined();
    expect(keyTarget("Enter", 0, 4)).toBeUndefined();
  });
});

/** An IntersectionObserver stand-in whose entries the tests deliver with `fire`. */
class FakeObserver {
  static all: FakeObserver[] = [];
  targets: Element[] = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  disconnect() {
    this.targets = [];
  }
  fire(target: Element, isIntersecting: boolean) {
    this.callback(
      [{ target, isIntersecting } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe("startFlow", () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    FakeObserver.all = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = `
      <section data-workflow-steps>
        <div class="flow-visual">
          <figure class="flow">
            <div class="flow-stage">
              <svg class="flow-wires">
                <g class="wire" data-from="a" data-to="b">
                  <path data-shape="line"></path><path data-shape="line"></path>
                  <path data-shape="head"></path><path data-shape="head"></path>
                </g>
                <g class="wire" data-from="b" data-to="c">
                  <path data-shape="line"></path><path data-shape="head"></path>
                </g>
              </svg>
              <div class="flow-node" data-node="a" data-col="0" data-row="0"></div>
              <div class="flow-node" data-node="b" data-col="1" data-row="0"></div>
              <div class="flow-node" data-node="c" data-col="1" data-row="1"></div>
            </div>
          </figure>
          <div class="step-bar" hidden>
            <button class="knob bar-prev"></button>
            <p class="readout"><b>01</b></p>
            <button class="auto-key" aria-pressed="false"></button>
            <div class="now-step" aria-live="polite">
              <div class="now-entry"><b>One</b></div>
              <div class="now-entry" hidden><b>Two</b></div>
              <div class="now-entry" hidden><b>Three</b></div>
            </div>
            <button class="knob bar-next"></button>
            <ol class="bar-keys">
              <li><button class="bar-key" aria-current="step">01</button></li>
              <li><button class="bar-key">02</button></li>
              <li><button class="bar-key">03</button></li>
            </ol>
          </div>
        </div>
        <ol class="steps">
          <li data-lights="a" data-hops=""><h3>One</h3></li>
          <li data-lights="b" data-hops="0"><h3>Two</h3></li>
          <li data-lights="c" data-hops="1"><h3>Three</h3></li>
        </ol>
      </section>`;
    const boxes: Record<string, Box> = {
      a: { left: 20, top: 20, right: 120, bottom: 60 },
      b: { left: 160, top: 20, right: 260, bottom: 60 },
      c: { left: 160, top: 100, right: 260, bottom: 140 },
    };
    for (const node of document.querySelectorAll<HTMLElement>("[data-node]")) {
      const box = boxes[node.dataset.node!]!;
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
        ...box,
        x: box.left,
        y: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
        toJSON() {},
      } as DOMRect);
    }
    for (const item of captions()) item.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    stop();
    stop = () => {};
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const root = () =>
    document.querySelector<HTMLElement>("[data-workflow-steps]")!;
  const visual = () => document.querySelector<HTMLElement>(".flow-visual")!;
  const bar = () => document.querySelector<HTMLElement>(".step-bar")!;
  const captions = () => [
    ...document.querySelectorAll<HTMLElement>("ol.steps > li"),
  ];
  const keys = () => [...document.querySelectorAll<HTMLElement>(".bar-key")];
  const autoKey = () => document.querySelector<HTMLElement>(".auto-key")!;
  const live = () => document.querySelector<HTMLElement>(".now-step")!;
  const lit = () =>
    [...document.querySelectorAll<HTMLElement>(".flow-node.lit")].map(
      (node) => node.dataset.node,
    );
  const current = () =>
    captions().findIndex((item) => item.hasAttribute("aria-current"));
  const click = (selector: string) =>
    document.querySelector<HTMLElement>(selector)!.click();
  const press = (key: string, target: Element = autoKey()) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const spy = () =>
    FakeObserver.all.find((observer) =>
      observer.targets.includes(captions()[0]!),
    )!;
  const view = () =>
    FakeObserver.all.find((observer) => observer.targets.includes(visual()))!;
  /** Delivers the observers' initial entries: no caption across the middle of the viewport, .flow-visual in view. */
  const settle = () => {
    for (const item of captions()) spy().fire(item, false);
    view().fire(visual(), true);
  };
  /** A caption scrolled across the middle of the viewport. */
  const scrollTo = (index: number) => spy().fire(captions()[index]!, true);

  it("draws every wire's line and head paths from the boxes' places, with the line's length as --len", () => {
    vi.spyOn(SVGPathElement.prototype, "getTotalLength").mockReturnValue(42.04);
    stop = startFlow(root(), false);
    for (const wire of document.querySelectorAll(".wire")) {
      const lines = [
        ...wire.querySelectorAll<SVGPathElement>("[data-shape=line]"),
      ];
      const heads = [...wire.querySelectorAll("[data-shape=head]")];
      expect(lines[0]!.getAttribute("d")).toMatch(/^M/);
      for (const line of lines) {
        expect(line.getAttribute("d")).toBe(lines[0]!.getAttribute("d"));
        expect(line.style.getPropertyValue("--len")).toBe("42px");
      }
      for (const head of heads) {
        expect(head.getAttribute("d")).toMatch(/Z$/);
      }
    }
  });

  it("lights every node and wire under reduced motion and leaves the step bar hidden", () => {
    stop = startFlow(root(), true);
    expect(root().dataset.flow).toBe("all");
    expect(lit()).toEqual(["a", "b", "c"]);
    expect(document.querySelectorAll(".wire.lit")).toHaveLength(2);
    expect(bar().hidden).toBe(true);
  });

  it("starts on the first step and shows the step bar on it", () => {
    stop = startFlow(root(), false);
    expect(root().dataset.flow).toBe("step");
    expect(lit()).toEqual(["a"]);
    expect(current()).toBe(0);
    expect(bar().hidden).toBe(false);
    expect(document.querySelector(".readout b")?.textContent).toBe("01");
    expect(
      [...document.querySelectorAll<HTMLElement>(".now-entry")].map(
        (entry) => entry.hidden,
      ),
    ).toEqual([false, true, true]);
    expect(keys()[0]!.getAttribute("aria-current")).toBe("step");
  });

  it("lights the step whose caption crosses the middle, the earlier steps' as passed, and moves the step bar to it", () => {
    stop = startFlow(root(), false);
    settle();
    scrollTo(2);
    expect(lit()).toEqual(["c"]);
    expect(current()).toBe(2);
    expect(
      [...document.querySelectorAll<HTMLElement>(".flow-node.passed")].map(
        (node) => node.dataset.node,
      ),
    ).toEqual(["a", "b"]);
    expect(
      [...document.querySelectorAll(".wire")].map((wire) =>
        wire.getAttribute("class"),
      ),
    ).toEqual(["wire passed", "wire lit"]);
    expect(document.querySelector(".readout b")?.textContent).toBe("03");
    expect(
      [...document.querySelectorAll<HTMLElement>(".now-entry")].map(
        (entry) => entry.hidden,
      ),
    ).toEqual([true, true, false]);
    expect(
      keys().map((key) => [
        key.classList.contains("passed"),
        key.getAttribute("aria-current"),
      ]),
    ).toEqual([
      [true, null],
      [true, null],
      [false, "step"],
    ]);
  });

  it("moves with its knobs, which wrap round, and its keys, which stop at the ends", () => {
    stop = startFlow(root(), false);
    press("End");
    expect(current()).toBe(2);
    press("ArrowRight");
    expect(current()).toBe(2);
    click(".bar-next");
    expect(current()).toBe(0);
    expect(lit()).toEqual(["a"]);
    click(".bar-prev");
    expect(current()).toBe(2);
    click(".bar-prev");
    expect(current()).toBe(1);
    press("Home");
    press("ArrowLeft");
    expect(current()).toBe(0);
    press("ArrowUp");
    press("Enter");
    expect(current()).toBe(0);
  });

  it("moves to a step key's step, and keeps focus on the current key while the arrow keys move it", () => {
    stop = startFlow(root(), false);
    keys()[1]!.click();
    expect(current()).toBe(1);
    keys()[1]!.focus();
    press("ArrowRight", keys()[1]!);
    expect(current()).toBe(2);
    expect(document.activeElement).toBe(keys()[2]);
  });

  it("scrolls a step chosen in the step bar to the middle of the viewport while the diagram is sticky, following only that caption until it arrives", () => {
    stop = startFlow(root(), false);
    settle();
    keys()[2]!.click();
    expect(captions()[2]!.scrollIntoView).not.toHaveBeenCalled();
    visual().style.position = "sticky";
    keys()[1]!.click();
    expect(captions()[1]!.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    scrollTo(2);
    expect(current()).toBe(1);
    scrollTo(1);
    scrollTo(0);
    expect(current()).toBe(0);
  });

  describe("Auto", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("is on from the start with the step bar silent, and walks the steps once in view, from the last round to the first, without scrolling", () => {
      visual().style.position = "sticky";
      stop = startFlow(root(), false);
      expect(autoKey().getAttribute("aria-pressed")).toBe("true");
      expect(live().getAttribute("aria-live")).toBe("off");
      vi.advanceTimersByTime(AUTO_STEP_MS * 2);
      expect(current()).toBe(0);
      settle();
      vi.advanceTimersByTime(AUTO_STEP_MS - 1);
      expect(current()).toBe(0);
      vi.advanceTimersByTime(1);
      expect(current()).toBe(1);
      expect(keys()[1]!.getAttribute("aria-current")).toBe("step");
      vi.advanceTimersByTime(AUTO_STEP_MS);
      expect(current()).toBe(2);
      vi.advanceTimersByTime(AUTO_STEP_MS);
      expect(current()).toBe(0);
      for (const item of captions()) {
        expect(item.scrollIntoView).not.toHaveBeenCalled();
      }
    });

    it("keeps running through the scroll spy's initial entries and the current step's caption", () => {
      stop = startFlow(root(), false);
      spy().fire(captions()[0]!, false);
      spy().fire(captions()[1]!, true);
      spy().fire(captions()[2]!, false);
      view().fire(visual(), true);
      expect(current()).toBe(1);
      scrollTo(1);
      expect(autoKey().getAttribute("aria-pressed")).toBe("true");
      vi.advanceTimersByTime(AUTO_STEP_MS);
      expect(current()).toBe(2);
    });

    it.each([
      ["a step key", () => keys()[2]!.click(), 2],
      ["the previous knob", () => click(".bar-prev"), 2],
      ["the next knob", () => click(".bar-next"), 1],
      ["ArrowRight", () => press("ArrowRight"), 1],
      ["ArrowLeft", () => press("ArrowLeft"), 0],
      ["Home", () => press("Home"), 0],
      ["End", () => press("End"), 2],
      ["a caption scrolled across the middle", () => scrollTo(2), 2],
    ])("turns off and takes the reader's step from %s", (_, input, step) => {
      stop = startFlow(root(), false);
      settle();
      input();
      expect(current()).toBe(step);
      expect(autoKey().getAttribute("aria-pressed")).toBe("false");
      expect(live().getAttribute("aria-live")).toBe("polite");
      vi.advanceTimersByTime(AUTO_STEP_MS * 3);
      expect(current()).toBe(step);
    });

    it("turns off and on again from the current step with the Auto key", () => {
      stop = startFlow(root(), false);
      settle();
      autoKey().click();
      expect(autoKey().getAttribute("aria-pressed")).toBe("false");
      expect(live().getAttribute("aria-live")).toBe("polite");
      vi.advanceTimersByTime(AUTO_STEP_MS * 2);
      expect(current()).toBe(0);
      keys()[2]!.click();
      autoKey().click();
      expect(autoKey().getAttribute("aria-pressed")).toBe("true");
      expect(live().getAttribute("aria-live")).toBe("off");
      vi.advanceTimersByTime(AUTO_STEP_MS);
      expect(current()).toBe(0);
    });

    it("stays on while a step bar choice scrolls its caption into place", () => {
      visual().style.position = "sticky";
      stop = startFlow(root(), false);
      settle();
      keys()[2]!.click();
      autoKey().click();
      scrollTo(1);
      scrollTo(2);
      expect(current()).toBe(2);
      expect(autoKey().getAttribute("aria-pressed")).toBe("true");
    });

    it("holds while the diagram is out of view or the tab is hidden", () => {
      stop = startFlow(root(), false);
      settle();
      vi.advanceTimersByTime(AUTO_STEP_MS - 1000);
      view().fire(visual(), false);
      vi.advanceTimersByTime(AUTO_STEP_MS * 3);
      expect(current()).toBe(0);
      view().fire(visual(), true);
      vi.advanceTimersByTime(AUTO_STEP_MS);
      expect(current()).toBe(1);
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(AUTO_STEP_MS * 3);
      expect(current()).toBe(1);
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(AUTO_STEP_MS);
      expect(current()).toBe(2);
      delete (document as { hidden?: boolean }).hidden;
    });

    it("never runs under reduced motion", () => {
      stop = startFlow(root(), true);
      vi.advanceTimersByTime(AUTO_STEP_MS * 3);
      expect(lit()).toEqual(["a", "b", "c"]);
      expect(current()).toBe(-1);
      expect(autoKey().getAttribute("aria-pressed")).toBe("false");
    });

    it("stops with the runner", () => {
      stop = startFlow(root(), false);
      settle();
      stop();
      vi.advanceTimersByTime(AUTO_STEP_MS * 3);
      click(".bar-next");
      expect(current()).toBe(0);
    });
  });
});
