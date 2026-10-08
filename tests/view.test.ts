// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIEW_REST, leanAway, startView } from "../src/scripts/view";

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

let frames: FrameRequestCallback[] = [];
let hidden = false;
const hovered = new Set<Element>();
const focused = new Set<Element>();
let stop: () => void = () => {};

/** Runs queued frames until none are left, at most `limit` of them. */
function flush(limit = 2000) {
  for (let count = 0; frames.length && count < limit; count++) {
    frames.shift()!(performance.now());
  }
}

function move(x: number) {
  window.dispatchEvent(
    new PointerEvent("pointermove", { clientX: x, clientY: 0 }),
  );
}

const lean = (selector: string) =>
  document
    .querySelector<HTMLElement>(selector)!
    .style.getPropertyValue("--lean");

beforeEach(() => {
  frames = [];
  hidden = false;
  hovered.clear();
  focused.clear();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    frames = [];
  });
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  document.body.innerHTML = `
    <div class="plate"><div class="dial"></div><a class="knob" href="#"></a></div>
    <div class="panel"></div>`;
  for (const element of document.querySelectorAll("*")) {
    const matches = element.matches.bind(element);
    vi.spyOn(element, "matches").mockImplementation((selector: string) => {
      if (selector === ":hover") return hovered.has(element);
      if (selector === ":focus-visible") return focused.has(element);
      return matches(selector);
    });
  }
  vi.spyOn(
    document.querySelector(".plate")!,
    "getBoundingClientRect",
  ).mockReturnValue(rect(0, 0, 200, 100));
  vi.spyOn(
    document.querySelector(".knob")!,
    "getBoundingClientRect",
  ).mockReturnValue(rect(100, 20, 62, 62));
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe("leanAway", () => {
  it("runs from 1 at a part's left edge to -1 at its right edge", () => {
    const box = rect(100, 0, 200, 50);
    expect(leanAway(box, 100)).toBe(1);
    expect(leanAway(box, 200)).toBe(0);
    expect(leanAway(box, 300)).toBe(-1);
  });

  it("clamps outside the part", () => {
    const box = rect(100, 0, 200, 50);
    expect(leanAway(box, 0)).toBe(1);
    expect(leanAway(box, 500)).toBe(-1);
  });
});

describe("startView", () => {
  it("eases a hovered part's view away from the pointer", () => {
    stop = startView();
    hovered.add(document.querySelector(".plate")!);
    move(50);
    frames.shift()!(performance.now());
    const first = Number(lean(".plate"));
    expect(first).toBeGreaterThan(VIEW_REST);
    expect(first).toBeLessThan(0.5);
    flush();
    expect(Number(lean(".plate"))).toBe(0.5);
  });

  it("keeps a part inside a turning part on its parent's view", () => {
    stop = startView();
    hovered.add(document.querySelector(".plate")!);
    move(50);
    flush();
    expect(lean(".knob")).toBe("");
    expect(lean(".dial")).toBe("");
  });

  it("turns a hovered part inside another part on its own", () => {
    stop = startView();
    hovered.add(document.querySelector(".plate")!);
    hovered.add(document.querySelector(".knob")!);
    move(131);
    flush();
    expect(Number(lean(".knob"))).toBe(0);
  });

  it("turns a keyboard-focused part to 1", () => {
    stop = startView();
    focused.add(document.querySelector(".panel")!);
    document.dispatchEvent(new FocusEvent("focusin"));
    flush();
    expect(lean(".panel")).toBe("1.000");
  });

  it("returns a part to rest and drops its own view when the pointer leaves", () => {
    stop = startView();
    const plate = document.querySelector(".plate")!;
    hovered.add(plate);
    move(50);
    flush();
    hovered.delete(plate);
    document.dispatchEvent(new PointerEvent("pointerout"));
    flush();
    expect(lean(".plate")).toBe("");
  });

  it("pauses while the tab is hidden", () => {
    stop = startView();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    hovered.add(document.querySelector(".plate")!);
    move(50);
    expect(frames).toHaveLength(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    flush();
    expect(Number(lean(".plate"))).toBe(0.5);
  });

  it("stops listening when stopped", () => {
    stop = startView();
    stop();
    move(50);
    expect(frames).toHaveLength(0);
  });
});
