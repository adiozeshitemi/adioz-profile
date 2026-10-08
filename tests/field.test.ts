// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FADE,
  LAYERS,
  PANEL_SHOW,
  RIPPLE,
  SMALL_WIDTH,
  beadCount,
  openness,
  rippleLight,
  screenY,
  seed,
  startField,
} from "../src/scripts/field";
import layout from "../src/layouts/Layout.astro?raw";

const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe("field helpers", () => {
  it("scales the bead count with the canvas area between 28 and 92", () => {
    expect(beadCount(800, 100)).toBe(28);
    expect(beadCount(1240, 1000)).toBe(80);
    expect(beadCount(4000, 3000)).toBe(92);
  });

  it("caps the bead count on small screens", () => {
    expect(beadCount(SMALL_WIDTH - 1, 4000)).toBe(36);
  });

  it("seeds beads across the canvas, cycling through the layers", () => {
    const beads = seed(1240, 1000, () => 0.5);
    expect(beads).toHaveLength(80);
    expect(beads.slice(0, 4).map((bead) => bead.layer)).toEqual([0, 1, 2, 0]);
    expect(beads[0]).toMatchObject({ x: 620, y: 500, vx: 0, gold: false });
    expect(beads[2].r).toBeCloseTo(LAYERS[2].size);
  });

  it("hides beads inside a mask and fades them in over FADE px", () => {
    const masks = [box(100, 100, 200, 200)];
    expect(openness(150, 150, masks, [])).toBe(0);
    expect(openness(200 + FADE / 2, 150, masks, [])).toBe(0.5);
    expect(openness(400, 400, masks, [])).toBe(1);
  });

  it("shows beads dimly behind a panel", () => {
    expect(openness(50, 50, [], [box(0, 0, 100, 100)])).toBe(PANEL_SHOW);
  });

  it("scrolls nearer layers faster and wraps beads over the canvas", () => {
    const near = screenY(500, 1, 0, 100, 1000);
    const far = screenY(500, 0.2, 0, 100, 1000);
    expect(near).toBe(425);
    expect(far).toBe(465);
    const wrapped = screenY(500, 1, 0, 1080 / 0.75, 1000);
    expect(wrapped).toBeCloseTo(500);
  });

  it("lights points on a ripple's ring, fading with distance and age", () => {
    const ripple = { x: 0, y: 0, tone: "hit" as const, start: 0 };
    const at = 1000;
    const radius = at * RIPPLE.speed;
    expect(rippleLight(ripple, radius, 0, at)).toBeCloseTo(
      1 - at / RIPPLE.life,
    );
    expect(rippleLight(ripple, radius + RIPPLE.band, 0, at)).toBe(0);
    expect(rippleLight(ripple, 0, 0, RIPPLE.life)).toBe(0);
  });
});

describe("startField", () => {
  let frames: FrameRequestCallback[] = [];
  let hidden = false;
  let reduce = false;
  let stop: () => void = () => {};
  let canvas: HTMLCanvasElement;
  const calls: Record<string, number> = {};

  /** A 2D context that counts its drawing calls. */
  function fakeContext() {
    const count =
      (name: string) =>
      (..._args: unknown[]) => {
        calls[name] = (calls[name] ?? 0) + 1;
        return name === "createRadialGradient"
          ? { addColorStop: () => {} }
          : undefined;
      };
    return new Proxy(
      {},
      {
        get: (_, name: string) => count(name),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
  }

  beforeEach(() => {
    frames = [];
    hidden = false;
    reduce = false;
    for (const key of Object.keys(calls)) delete calls[key];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      frames = [];
    });
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
    document.documentElement.style.cssText =
      "--particle: 205 214 228; --particle-gold: 230 192 98; --ember: #f08a6a";
    document.body.innerHTML = '<canvas id="field"></canvas>';
    canvas = document.querySelector("canvas")!;
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeContext() as never);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 1240,
      bottom: 1000,
      width: 1240,
      height: 1000,
    } as DOMRect);
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sizes the canvas to its box and animates while the tab shows", () => {
    stop = startField(canvas);
    expect(canvas.width).toBe(1240 * Math.min(devicePixelRatio || 1, 2));
    expect(frames).toHaveLength(1);
    frames.shift()!(performance.now());
    expect(calls.arc).toBeGreaterThan(0);
    expect(frames).toHaveLength(1);
  });

  it("draws one still frame and never animates under reduced motion", () => {
    reduce = true;
    stop = startField(canvas);
    expect(calls.arc).toBeGreaterThan(0);
    expect(frames).toHaveLength(0);
  });

  it("pauses while the tab is hidden and resumes when it shows", () => {
    stop = startField(canvas);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames).toHaveLength(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames).toHaveLength(1);
  });

  it("draws a ripple ring after a field:ripple event", () => {
    stop = startField(canvas);
    frames.shift()!(performance.now());
    const before = calls.stroke ?? 0;
    window.dispatchEvent(
      new CustomEvent("field:ripple", {
        detail: { x: 600, y: 500, tone: "block" },
      }),
    );
    frames.shift()!(performance.now() + 16);
    expect(calls.stroke ?? 0).toBeGreaterThan(before);
  });

  it("stops animating when stopped", () => {
    stop = startField(canvas);
    stop();
    expect(frames).toHaveLength(0);
  });
});

describe("particle field markup", () => {
  it("is rendered by the layout only when the page asks for it", () => {
    expect(layout).toMatch(/field = false/);
    expect(layout).toMatch(/\{field && <ParticleField \/>\}/);
  });
});
