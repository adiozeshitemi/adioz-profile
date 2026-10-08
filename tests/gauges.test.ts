// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GAUGE,
  type Needle,
  needleAngle,
  scaleAt,
  startGauges,
  stepNeedle,
  ticks,
} from "../src/scripts/gauges";

const box = { left: 0, top: 0, width: 200, height: 200 };
const needle = (value: number, pos = 0): Needle => ({
  value,
  pos,
  vel: 0,
  sweep: false,
  returning: false,
});
/** Steps `n` at 60fps until it rests; returns the highest position it reached. */
function settle(n: Needle) {
  let peak = n.pos;
  for (let frame = 0; frame < 2000 && stepNeedle(n, 1 / 60); frame++) {
    peak = Math.max(peak, n.pos);
  }
  return peak;
}

describe("gauge scale", () => {
  it("spaces 21 ticks across 270deg, every fifth major", () => {
    const scale = ticks();
    expect(scale).toHaveLength(21);
    expect(scale.filter((tick) => tick.major)).toHaveLength(5);
    expect(scale[10]).toMatchObject({ x1: 100, y1: 14, x2: 100, y2: 4 });
  });

  it("turns the needle from -135deg at 0 to 135deg at 100, clamped", () => {
    expect(needleAngle(0)).toBe(-135);
    expect(needleAngle(50)).toBe(0);
    expect(needleAngle(100)).toBe(135);
    expect(needleAngle(140)).toBe(135);
    expect(needleAngle(-5)).toBe(-135);
  });

  it("maps a point on the face to the scale position under it", () => {
    expect(scaleAt(box, 100, 0)).toBeCloseTo(50);
    expect(scaleAt(box, 200, 100)).toBeCloseTo(83.33);
    expect(scaleAt(box, 0, 200)).toBe(0);
    expect(scaleAt(box, 200, 200)).toBe(100);
  });
});

describe("stepNeedle", () => {
  it("sweeps to 100 first, then settles on its value", () => {
    const n = { ...needle(80), sweep: true };
    const peak = settle(n);
    expect(peak).toBeGreaterThanOrEqual(98);
    expect(n.pos).toBe(80);
    expect(n.sweep).toBe(false);
  });

  it("eases a released needle back to its value on the softer spring", () => {
    const n = { ...needle(85, 20), returning: true };
    stepNeedle(n, 1 / 60);
    const soft = n.vel;
    const stiff = needle(85, 20);
    stepNeedle(stiff, 1 / 60);
    expect(soft).toBeLessThan(stiff.vel);
    settle(n);
    expect(n.pos).toBe(85);
    expect(n.returning).toBe(false);
  });

  it("settles a knocked needle back on its value", () => {
    const n = { ...needle(92, 92), vel: GAUGE.KNOCK };
    expect(stepNeedle(n, 1 / 60)).toBe(true);
    settle(n);
    expect(n.pos).toBe(92);
  });
});

describe("startGauges", () => {
  let frames: FrameRequestCallback[] = [];
  let clock = 0;
  let enter: () => void = () => {};
  let margin = "";
  let stop: () => void = () => {};

  beforeEach(() => {
    frames = [];
    clock = 0;
    enter = () => {};
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      frames = [];
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          callback: IntersectionObserverCallback,
          options: IntersectionObserverInit,
        ) {
          margin = options.rootMargin ?? "";
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
    document.body.innerHTML = `<div class="cluster">${[95, 80]
      .map(
        (value) => `<div class="gauge" data-value="${value}"><span class="dial">
          <span class="dial-face"><svg><path class="dial-fill"></path></svg>
          <span class="rotor"></span><span class="readout"><b>${value}</b></span></span>
        </span></div>`,
      )
      .join("")}</div>`;
    for (const face of document.querySelectorAll(".dial-face")) {
      vi.spyOn(face, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
      } as DOMRect);
    }
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const cluster = () => document.querySelector<HTMLElement>(".cluster")!;
  const readouts = () =>
    [...document.querySelectorAll(".readout b")].map((b) => b.textContent);
  /** Runs queued frames 16ms apart until none are left. */
  function flush() {
    for (let count = 0; frames.length && count < 3000; count++) {
      clock += 16;
      frames.shift()!(clock);
    }
  }

  it("drops the needles to 0 until the cluster's top rises into view", () => {
    stop = startGauges(cluster(), false);
    expect(margin).toBe("0px 0px -35% 0px");
    expect(readouts()).toEqual(["0", "0"]);
    expect(frames).toHaveLength(0);
  });

  it("sweeps each needle once in view and settles it on its value", () => {
    stop = startGauges(cluster(), false);
    enter();
    let peak = 0;
    for (let count = 0; frames.length && count < 3000; count++) {
      clock += 16;
      frames.shift()!(clock);
      peak = Math.max(peak, Number(readouts()[1]));
    }
    expect(peak).toBeGreaterThanOrEqual(98);
    expect(readouts()).toEqual(["95", "80"]);
  });

  it("follows a dragged needle and eases it back when released", () => {
    stop = startGauges(cluster(), false);
    enter();
    flush();
    const dial = document.querySelector<HTMLElement>(".dial")!;
    dial.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 0,
        pointerType: "mouse",
      }),
    );
    expect(dial.classList.contains("held")).toBe(true);
    expect(readouts()[0]).toBe("50");
    dial.dispatchEvent(new PointerEvent("pointerup"));
    expect(dial.classList.contains("held")).toBe(false);
    flush();
    expect(readouts()[0]).toBe("95");
  });

  it("waits for a touch's first move before turning its needle", () => {
    stop = startGauges(cluster(), false);
    enter();
    flush();
    const dial = document.querySelector<HTMLElement>(".dial")!;
    dial.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 0,
        pointerType: "touch",
      }),
    );
    expect(readouts()[0]).toBe("95");
  });

  it("leaves the values in place under reduced motion", () => {
    stop = startGauges(cluster(), true);
    enter();
    expect(readouts()).toEqual(["95", "80"]);
    expect(frames).toHaveLength(0);
  });
});
