// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRUM_STAGGER_MS,
  REEL_TURNS,
  reelDigits,
  reelIndex,
  startOdometers,
} from "../src/scripts/odometer";

describe("odometer reels", () => {
  it("repeats 0 to 9 once per turn", () => {
    const digits = reelDigits();
    expect(digits).toHaveLength(REEL_TURNS * 10);
    expect(digits.slice(0, 11)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  });

  it("rests each digit in the last turn", () => {
    expect(reelIndex(0)).toBe((REEL_TURNS - 1) * 10);
    expect(reelDigits()[reelIndex(7)]).toBe(7);
    expect(reelIndex(9)).toBe(REEL_TURNS * 10 - 1);
  });
});

describe("startOdometers", () => {
  let enter: (inView: boolean) => void = () => {};
  let stop: () => void = () => {};

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          enter = (inView) =>
            callback(
              [
                {
                  isIntersecting: inView,
                  target: document.querySelector(".window")!,
                } as unknown as IntersectionObserverEntry,
              ],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    const drum = (digit: number) =>
      `<span class="drum" data-digit="${digit}"><span class="reel" style="--at: ${reelIndex(digit)}"></span></span>`;
    document.body.innerHTML = `<span class="window">${drum(2)}<span class="drum comma">,</span>${drum(9)}</span>`;
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  const reels = () => [...document.querySelectorAll<HTMLElement>(".reel")];
  const positions = () =>
    reels().map((reel) => reel.style.getPropertyValue("--at"));

  it("leaves the reels on their digits until the counter comes into view", () => {
    stop = startOdometers(
      [document.querySelector<HTMLElement>(".window")!],
      false,
    );
    expect(positions()).toEqual([String(reelIndex(2)), String(reelIndex(9))]);
  });

  it("spins each reel back to its digit, staggered from the left, every time it comes into view", () => {
    stop = startOdometers(
      [document.querySelector<HTMLElement>(".window")!],
      false,
    );
    for (let visit = 0; visit < 2; visit++) {
      const sets = reels().map((reel) => vi.spyOn(reel.style, "setProperty"));
      enter(true);
      for (const set of sets) {
        const atCalls = set.mock.calls.filter(([name]) => name === "--at");
        expect(atCalls[0]).toEqual(["--at", "0"]);
      }
      expect(positions()).toEqual([String(reelIndex(2)), String(reelIndex(9))]);
      expect(reels().map((reel) => reel.style.transitionDelay)).toEqual([
        "0ms",
        `${DRUM_STAGGER_MS}ms`,
      ]);
      enter(false);
    }
  });

  it("does nothing under reduced motion", () => {
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        disconnect() {}
      },
    );
    stop = startOdometers(
      [document.querySelector<HTMLElement>(".window")!],
      true,
    );
    expect(observe).not.toHaveBeenCalled();
  });
});
