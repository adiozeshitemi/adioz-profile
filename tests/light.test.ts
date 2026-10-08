// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIGHT_REACH,
  REST_LX,
  bearing,
  fold,
  lightEnabled,
  nearness,
  startLight,
} from "../src/scripts/light";

/** A DOMRect at (left, top) of the given size. */
const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

/** Gives `element` a fixed bounding box. */
function place(element: Element, box: DOMRect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(box);
}

/** Queued animation frames, run by flush(). */
let frames: FrameRequestCallback[] = [];

/** Runs queued frames until none are left, at most `limit` of them. */
function flush(limit = 500) {
  for (let count = 0; frames.length && count < limit; count++) {
    frames.shift()!(performance.now());
  }
}

function move(x: number, y: number) {
  window.dispatchEvent(
    new PointerEvent("pointermove", { clientX: x, clientY: y }),
  );
}

let hidden = false;
let stop: () => void = () => {};

beforeEach(() => {
  frames = [];
  hidden = false;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    frames = [];
  });
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  document.body.innerHTML = `
    <div class="plate"></div>
    <button><span class="spun turn" data-rest="90"></span></button>
    <span class="spun screw"></span>
    <div class="panel"></div>`;
  place(document.querySelector(".plate")!, rect(0, 0, 200, 100));
  place(document.querySelector(".turn")!, rect(400, 0, 20, 20));
  place(document.querySelector(".screw")!, rect(400, 400, 10, 10));
  place(document.querySelector(".panel")!, rect(0, 200, 200, 100));
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("light helpers", () => {
  it("folds angles into the half period either side of zero", () => {
    expect(fold(190, 360)).toBe(-170);
    expect(fold(-190, 360)).toBe(170);
    expect(fold(100, 180)).toBe(-80);
  });

  it("measures bearings clockwise from 12 o'clock", () => {
    expect(bearing(0, -1)).toBeCloseTo(0);
    expect(bearing(1, 0)).toBeCloseTo(90);
    expect(bearing(0, 1)).toBeCloseTo(180);
    expect(bearing(-1, 0)).toBeCloseTo(-90);
  });

  it("lights a box fully under the pointer and not at all from LIGHT_REACH away", () => {
    const box = rect(0, 0, 100, 100);
    expect(nearness(box, { x: 50, y: 50 })).toBe(1);
    expect(nearness(box, { x: 100 + LIGHT_REACH, y: 50 })).toBe(0);
    expect(nearness(box, { x: 100 + LIGHT_REACH / 2, y: 50 })).toBe(0.5);
    expect(nearness(box, null)).toBe(0);
  });

  it("runs only for a fine pointer without reduced motion", () => {
    const stubMedia = (fine: boolean, reduce: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query.includes("pointer") ? fine : reduce,
      }));
    stubMedia(true, false);
    expect(lightEnabled()).toBe(true);
    stubMedia(false, false);
    expect(lightEnabled()).toBe(false);
    stubMedia(true, true);
    expect(lightEnabled()).toBe(false);
  });
});

describe("startLight", () => {
  it("leaves every part at rest until the pointer moves", () => {
    stop = startLight();
    flush();
    expect(document.querySelector<HTMLElement>(".plate")!.style.cssText).toBe(
      "",
    );
  });

  it("slides a brushed face's highlight to the pointer's x", () => {
    stop = startLight();
    move(50, 50);
    flush();
    const lx = parseFloat(
      document
        .querySelector<HTMLElement>(".plate")!
        .style.getPropertyValue("--lx"),
    );
    expect(lx).toBeCloseTo(25, 0);
  });

  it("glows a panel at the pointer", () => {
    stop = startLight();
    move(100, 250);
    flush();
    const panel = document.querySelector<HTMLElement>(".panel")!;
    expect(Number(panel.style.getPropertyValue("--near"))).toBe(1);
    expect(parseFloat(panel.style.getPropertyValue("--glow-x"))).toBeCloseTo(
      50,
      0,
    );
    expect(parseFloat(panel.style.getPropertyValue("--glow-y"))).toBeCloseTo(
      50,
      0,
    );
  });

  it("turns a capped icon toward the pointer and counter-turns its light cross", () => {
    stop = startLight();
    move(410, 210);
    flush();
    const turn = document.querySelector<HTMLElement>(".turn")!;
    // The pointer is straight below (180deg); the icon rests at 90deg.
    expect(turn.style.transform).toBe("rotate(90.00deg)");
    expect(turn.style.getPropertyValue("--light")).not.toBe("");
  });

  it("turns a screw's light cross but never the screw", () => {
    stop = startLight();
    move(405, 300);
    flush();
    const screw = document.querySelector<HTMLElement>(".screw")!;
    expect(screw.style.getPropertyValue("--light")).not.toBe("");
    expect(screw.style.transform).toBe("");
  });

  it("returns every part to rest when the pointer leaves the page", () => {
    stop = startLight();
    move(150, 50);
    flush();
    expect(
      document.querySelector<HTMLElement>(".turn")!.style.transform,
    ).not.toBe("rotate(0.00deg)");
    document.dispatchEvent(new PointerEvent("pointerout"));
    flush();
    const plate = document.querySelector<HTMLElement>(".plate")!;
    expect(plate.style.getPropertyValue("--lx")).toBe(`${REST_LX.toFixed(2)}%`);
    expect(document.querySelector<HTMLElement>(".turn")!.style.transform).toBe(
      "rotate(0.00deg)",
    );
  });

  it("pauses while the tab is hidden and resumes when it shows", () => {
    stop = startLight();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    move(50, 50);
    expect(frames).toHaveLength(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    flush();
    expect(
      document
        .querySelector<HTMLElement>(".plate")!
        .style.getPropertyValue("--lx"),
    ).not.toBe("");
  });

  it("stops listening when stopped", () => {
    stop = startLight();
    stop();
    move(50, 50);
    expect(frames).toHaveLength(0);
  });
});
