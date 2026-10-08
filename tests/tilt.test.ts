// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TILT, startTilt, tiltLimit, tiltToward } from "../src/scripts/tilt";

const box = { left: 0, top: 0, width: 600, height: 400 };

describe("tilt angles", () => {
  it("limits the angle so an edge moves by the given depth", () => {
    expect(tiltLimit(26, 300)).toBeCloseTo(4.97, 2);
    expect(tiltLimit(400, 300)).toBe(90);
    expect(tiltLimit(26, 0)).toBe(0);
  });

  it("turns toward the pointer, the edge under it sinking", () => {
    expect(tiltToward(box, 300, 200, 5, 2)).toEqual({ y: 0, x: -0 });
    expect(tiltToward(box, 600, 0, 5, 2)).toEqual({ y: 5, x: 2 });
    expect(tiltToward(box, 0, 400, 5, 2)).toEqual({ y: -5, x: -2 });
  });
});

describe("startTilt", () => {
  let frames: FrameRequestCallback[] = [];
  let stop: () => void = () => {};

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      frames = [];
    });
    document.body.innerHTML = `<article data-tilt></article>`;
    const card = document.querySelector<HTMLElement>("article")!;
    Object.defineProperty(card, "offsetWidth", { value: 600 });
    Object.defineProperty(card, "offsetHeight", { value: 400 });
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue(box as DOMRect);
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
  });

  const card = () => document.querySelector<HTMLElement>("article")!;
  function flush() {
    for (let count = 0; frames.length && count < 500; count++) {
      frames.shift()!(0);
    }
  }

  it("swivels the card toward the pointer and lifts it", () => {
    stop = startTilt(card(), true);
    card().dispatchEvent(new PointerEvent("pointerenter"));
    card().dispatchEvent(
      new PointerEvent("pointermove", { clientX: 600, clientY: 200 }),
    );
    flush();
    const turn = Number(
      /rotateY\(([-\d.]+)deg\)/.exec(card().style.transform)![1],
    );
    expect(turn).toBeCloseTo(tiltLimit(TILT.DEPTH_SIDES, 300), 1);
    expect(card().style.transform).toContain("perspective(1000px)");
  });

  it("eases the card flat when the pointer leaves", () => {
    stop = startTilt(card(), true);
    card().dispatchEvent(new PointerEvent("pointerenter"));
    card().dispatchEvent(
      new PointerEvent("pointermove", { clientX: 600, clientY: 200 }),
    );
    card().dispatchEvent(new PointerEvent("pointerleave"));
    expect(card().style.transform).toBe("");
    expect(frames).toHaveLength(0);
  });

  it("does nothing for coarse pointers or reduced motion", () => {
    stop = startTilt(card(), false);
    card().dispatchEvent(new PointerEvent("pointerenter"));
    card().dispatchEvent(
      new PointerEvent("pointermove", { clientX: 600, clientY: 200 }),
    );
    expect(frames).toHaveLength(0);
    expect(card().style.transform).toBe("");
  });
});
