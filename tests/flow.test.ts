// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { needleAngle } from "../src/scripts/gauges";
import {
  arrowHead,
  dialTarget,
  routeWires,
  startFlow,
  stepHops,
  stepPosition,
  stepTicks,
  wirePath,
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

describe("the step dial", () => {
  it("spreads one tick per step across the gauges' scale", () => {
    expect(stepTicks(5)).toHaveLength(5);
    expect(stepPosition(0, 5)).toBe(0);
    expect(stepPosition(4, 5)).toBe(100);
    expect(stepPosition(0, 1)).toBe(0);
    const [first] = stepTicks(3);
    const angle = (needleAngle(0) * Math.PI) / 180;
    expect(first!.x1).toBeCloseTo(50 + 37 * Math.sin(angle), 1);
  });

  it("moves with the arrow keys, Page Up and Down, Home and End, within the steps", () => {
    expect(dialTarget("ArrowRight", 0, 4)).toBe(1);
    expect(dialTarget("PageDown", 2, 4)).toBe(1);
    expect(dialTarget("ArrowLeft", 0, 4)).toBe(0);
    expect(dialTarget("End", 0, 4)).toBe(3);
    expect(dialTarget("Home", 3, 4)).toBe(0);
    expect(dialTarget("ArrowUp", 3, 4)).toBe(3);
    expect(dialTarget("Enter", 0, 4)).toBeUndefined();
  });
});

describe("startFlow", () => {
  let spy: (index: number) => void = () => {};
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        targets: Element[] = [];
        constructor(callback: IntersectionObserverCallback) {
          spy = (index) =>
            callback(
              [
                {
                  isIntersecting: true,
                  target: this.targets[index]!,
                } as unknown as IntersectionObserverEntry,
              ],
              this as unknown as IntersectionObserver,
            );
        }
        observe(target: Element) {
          this.targets.push(target);
        }
        disconnect() {}
      },
    );
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
          <div class="step-dial" hidden>
            <button class="knob dial-prev"></button>
            <div role="slider" data-of="of"><span class="dial-rotor"></span><svg class="dial-ticks"><line></line><line></line><line></line></svg></div>
            <p class="dial-readout"><b>01</b></p>
            <button class="knob dial-next"></button>
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
    for (const item of document.querySelectorAll("li")) {
      item.scrollIntoView = vi.fn();
    }
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const root = () =>
    document.querySelector<HTMLElement>("[data-workflow-steps]")!;
  const lit = () =>
    [...document.querySelectorAll<HTMLElement>(".flow-node.lit")].map(
      (node) => node.dataset.node,
    );
  const knob = () => document.querySelector<HTMLElement>("[role=slider]")!;
  const current = () =>
    [...document.querySelectorAll("li")].findIndex((item) =>
      item.hasAttribute("aria-current"),
    );

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

  it("lights every node and hop at once under reduced motion, without the dial", () => {
    stop = startFlow(root(), true);
    expect(root().dataset.flow).toBe("all");
    expect(lit()).toEqual(["a", "b", "c"]);
    expect(document.querySelectorAll(".wire.lit")).toHaveLength(2);
    expect(document.querySelector<HTMLElement>(".step-dial")!.hidden).toBe(
      true,
    );
  });

  it("starts on the first step and shows the dial", () => {
    stop = startFlow(root(), false);
    expect(root().dataset.flow).toBe("step");
    expect(lit()).toEqual(["a"]);
    expect(current()).toBe(0);
    expect(document.querySelector<HTMLElement>(".step-dial")!.hidden).toBe(
      false,
    );
    expect(knob().getAttribute("aria-valuenow")).toBe("1");
    expect(knob().getAttribute("aria-valuetext")).toBe("1 of 3: One");
  });

  it("lights the step whose caption crosses the middle, and the earlier steps' as passed", () => {
    stop = startFlow(root(), false);
    spy(2);
    expect(lit()).toEqual(["c"]);
    expect(current()).toBe(2);
    expect(
      [...document.querySelectorAll<HTMLElement>(".flow-node.passed")].map(
        (node) => node.dataset.node,
      ),
    ).toEqual(["a", "b"]);
    const wires = [...document.querySelectorAll(".wire")];
    expect(wires.map((wire) => wire.getAttribute("class"))).toEqual([
      "wire passed",
      "wire lit",
    ]);
    expect(document.querySelector(".dial-readout b")?.textContent).toBe("03");
    expect(
      document.querySelector<HTMLElement>(".dial-rotor")!.style.transform,
    ).toBe(`rotate(${needleAngle(100)}deg)`);
  });

  it("turns with the dial's keys and knobs", () => {
    stop = startFlow(root(), false);
    knob().dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(current()).toBe(2);
    document.querySelector<HTMLElement>(".dial-prev")!.click();
    expect(current()).toBe(1);
    document.querySelector<HTMLElement>(".dial-next")!.click();
    document.querySelector<HTMLElement>(".dial-next")!.click();
    expect(current()).toBe(2);
    knob().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(lit()).toEqual(["a"]);
  });
});
