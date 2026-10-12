// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  drumDigits,
  ROLL_MS,
  rollEase,
  startOdometers,
} from "../src/scripts/odometer";

describe("odometer helpers", () => {
  it("pads a value with leading zeros to the drum count", () => {
    expect(drumDigits(29, 3)).toEqual(["0", "2", "9"]);
    expect(drumDigits(14794, 5)).toEqual(["1", "4", "7", "9", "4"]);
    expect(drumDigits(1234, 3)).toEqual(["1", "2", "3", "4"]);
    expect(drumDigits(-4, 2)).toEqual(["0", "0"]);
    expect(drumDigits(6.6, 2)).toEqual(["0", "7"]);
  });

  it("eases the roll out from 0 to 1", () => {
    expect(rollEase(0)).toBe(0);
    expect(rollEase(1)).toBe(1);
    expect(rollEase(2)).toBe(1);
    expect(rollEase(0.5)).toBeCloseTo(0.875);
  });
});

describe("startOdometers", () => {
  let enter: (target: Element) => void = () => {};
  let frames: FrameRequestCallback[] = [];
  let stop: () => void = () => {};

  beforeEach(() => {
    frames = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          enter = (target) =>
            callback(
              [{ isIntersecting: true, target } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    document.body.innerHTML = `<span class="window" data-odometer="14794"><span class="drum">1</span><span class="drum">4</span><span class="drum comma">,</span><span class="drum">7</span><span class="drum">9</span><span class="drum">4</span></span>`;
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  const odometer = () => document.querySelector<HTMLElement>(".window")!;
  const reading = () => odometer().textContent;
  /** Runs the queued frame at `at` milliseconds after the roll started. */
  const step = (at: number) => frames.shift()!(performance.now() + at);

  it("shows zeros until the counter comes into view, keeping the comma", () => {
    stop = startOdometers([odometer()], false);
    expect(reading()).toBe("00,000");
    expect(frames).toHaveLength(0);
  });

  it("rolls up to the value once in view", () => {
    stop = startOdometers([odometer()], false);
    enter(odometer());
    step(ROLL_MS / 2);
    const halfway = Number(reading().replace(",", ""));
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(14794);
    step(ROLL_MS + 10);
    expect(reading()).toBe("14,794");
    expect(frames).toHaveLength(0);
  });

  it("keeps the final value under reduced motion", () => {
    stop = startOdometers([odometer()], true);
    expect(reading()).toBe("14,794");
  });
});
