// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORD,
  FOCUS_MARGIN,
  type Cord,
  startPillarFocus,
  stepCords,
} from "../src/scripts/pillars";

describe("startPillarFocus", () => {
  let cross: (target: Element, isIntersecting: boolean) => void = () => {};
  let margin = "";
  let noHover = false;
  let stop: () => void = () => {};

  beforeEach(() => {
    noHover = false;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(hover: none)" && noHover,
    }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          callback: IntersectionObserverCallback,
          options: IntersectionObserverInit,
        ) {
          margin = options.rootMargin ?? "";
          cross = (target, isIntersecting) =>
            callback(
              [{ target, isIntersecting } as IntersectionObserverEntry],
              {} as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = `<div class="pillar"></div><div class="pillar"></div>`;
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  const pillars = () => [...document.querySelectorAll<HTMLElement>(".pillar")];
  const lit = () => pillars().map((pillar) => pillar.classList.contains("lit"));
  const mouse = () =>
    dispatchEvent(
      Object.assign(new Event("pointermove"), { pointerType: "mouse" }),
    );

  it("watches the middle fifth of the viewport", () => {
    stop = startPillarFocus(pillars());
    expect(margin).toBe(FOCUS_MARGIN);
  });

  it("lights the centred pillar on a device without hover", () => {
    noHover = true;
    stop = startPillarFocus(pillars());
    cross(pillars()[1]!, true);
    expect(lit()).toEqual([false, true]);
    cross(pillars()[1]!, false);
    expect(lit()).toEqual([false, false]);
  });

  it("leaves pillars to :hover on a device with hover until a key is pressed", () => {
    stop = startPillarFocus(pillars());
    cross(pillars()[0]!, true);
    expect(lit()).toEqual([false, false]);
    dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(lit()).toEqual([true, false]);
  });

  it("drops the key fallback once the mouse moves", () => {
    stop = startPillarFocus(pillars());
    cross(pillars()[0]!, true);
    dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    mouse();
    expect(lit()).toEqual([false, false]);
  });

  it("fires pillar-lit on each change", () => {
    noHover = true;
    stop = startPillarFocus(pillars());
    const changes = vi.fn();
    pillars()[0]!.addEventListener("pillar-lit", changes);
    cross(pillars()[0]!, true);
    cross(pillars()[0]!, true);
    cross(pillars()[0]!, false);
    expect(changes).toHaveBeenCalledTimes(2);
  });
});

describe("stepCords", () => {
  const cord = (pivot: number, angle = 0, speed = 0): Cord => ({
    pivot,
    length: 1400,
    angle,
    speed,
    kickAt: 0,
  });

  it("kicks the cords while swinging and schedules the next kick", () => {
    const cords: [Cord, Cord] = [cord(4600), cord(4900)];
    const moving = stepCords(cords, 1 / 60, 1000, true, () => 1);
    expect(moving).toBe(true);
    expect(cords[0].speed).not.toBe(0);
    expect(cords[0].kickAt).toBe(1000 + CORD.KICK_MAX * 1000);
  });

  it("settles to rest off the pillar and then reports no motion", () => {
    const cords: [Cord, Cord] = [cord(4000, 8), cord(6000, -8)];
    let moving = true;
    for (let step = 0; step < 2000 && moving; step++) {
      moving = stepCords(cords, 1 / 60, step * 16, false);
    }
    expect(moving).toBe(false);
    expect(Math.abs(cords[0].angle)).toBeLessThan(0.05);
  });

  it("keeps each cord within LIMIT degrees", () => {
    const cords: [Cord, Cord] = [cord(0, 0, 5000), cord(10000, 0, -5000)];
    stepCords(cords, 0.032, 0, false);
    for (const { angle } of cords) {
      expect(Math.abs(angle)).toBeLessThanOrEqual(CORD.LIMIT);
    }
  });

  it("trades speeds when the closing cords knock, keeping RESTITUTION of them", () => {
    const left = cord(4600, 0, 0);
    const right = cord(4650, 0, 0);
    left.speed = -10;
    right.speed = 10;
    stepCords([left, right], 0, 0, false);
    expect(left.speed).toBeCloseTo(10 * CORD.RESTITUTION);
    expect(right.speed).toBeCloseTo(-10 * CORD.RESTITUTION);
  });
});
