// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESS_LIFT,
  advance,
  markCurrent,
  spring,
  startRail,
  startScrollSpy,
} from "../src/scripts/rail";

let frames: FrameRequestCallback[] = [];
let clock = 0;

/** Runs queued frames 16ms apart until none are left, at most `limit` of them. */
function flush(limit = 2000) {
  for (let count = 0; frames.length && count < limit; count++) {
    clock += 16;
    frames.shift()!(clock);
  }
}

/** Waits for queued MutationObserver callbacks. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

beforeEach(() => {
  frames = [];
  clock = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    frames = [];
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scroll spy", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <ul class="rail"><a href="#about"></a><a href="#stack"></a></ul>
      <ul class="drawer"><a href="#about"></a><a href="#stack"></a><a href="#contact"></a></ul>
      <section id="about"></section><section id="stack"></section><section id="contact"></section>`;
  });

  const groups = () =>
    [".rail a", ".drawer a"].map((selector) => [
      ...document.querySelectorAll<HTMLAnchorElement>(selector),
    ]);
  const current = (selector: string) =>
    [...document.querySelectorAll(selector)].map((link) =>
      link.getAttribute("aria-current"),
    );

  it("marks the link to a section in every group that links it", () => {
    markCurrent(groups(), "#stack");
    expect(current(".rail a")).toEqual([null, "true"]);
    expect(current(".drawer a")).toEqual([null, "true", null]);
  });

  it("leaves a group without a link to the section as it was", () => {
    markCurrent(groups(), "#stack");
    markCurrent(groups(), "#contact");
    expect(current(".rail a")).toEqual([null, "true"]);
    expect(current(".drawer a")).toEqual([null, null, "true"]);
  });

  it("watches each linked section across the middle of the viewport", () => {
    let callback: IntersectionObserverCallback = () => {};
    const observed: Element[] = [];
    let margin = "";
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          handler: IntersectionObserverCallback,
          options: IntersectionObserverInit,
        ) {
          callback = handler;
          margin = options.rootMargin ?? "";
        }
        observe(element: Element) {
          observed.push(element);
        }
        disconnect() {}
      },
    );
    startScrollSpy(groups());
    expect(margin).toBe("-45% 0px -50% 0px");
    expect(new Set(observed.map((element) => element.id))).toEqual(
      new Set(["about", "stack", "contact"]),
    );
    callback(
      [
        {
          isIntersecting: true,
          target: document.getElementById("about")!,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(current(".rail a")).toEqual(["true", null]);
  });
});

describe("springs", () => {
  it("settles on the target and reports when it stops", () => {
    const s = spring(0, 210, 24);
    s.target = 100;
    let steps = 0;
    while (advance(s, 1 / 60) && steps < 1000) steps++;
    expect(s.value).toBe(100);
    expect(steps).toBeGreaterThan(5);
  });

  it("jumps to the target under reduced motion", () => {
    const s = spring(0, 210, 24);
    s.target = 40;
    expect(advance(s, 1 / 60, true)).toBe(false);
    expect(s.value).toBe(40);
  });
});

describe("startRail", () => {
  let stop: () => void = () => {};
  const hovered = new Set<Element>();

  beforeEach(() => {
    hovered.clear();
    document.body.innerHTML = `
      <ul class="rail">
        <li class="rail-plate"></li>
        <li><a href="#about"><span class="key-cap">About</span></a></li>
        <li><a href="#stack" aria-current="true"><span class="key-cap">Stack</span></a></li>
        <li><a href="#work"><span class="key-cap">Work</span></a></li>
      </ul>`;
    document.querySelectorAll("a").forEach((link, index) => {
      Object.defineProperty(link, "offsetLeft", { value: 4 + index * 80 });
      Object.defineProperty(link, "offsetWidth", { value: 80 });
      vi.spyOn(link, "getBoundingClientRect").mockReturnValue({
        left: 4 + index * 80,
        top: 0,
        width: 80,
        height: 32,
      } as DOMRect);
      const matches = link.matches.bind(link);
      vi.spyOn(link, "matches").mockImplementation((selector: string) =>
        selector === ":hover" ? hovered.has(link) : matches(selector),
      );
    });
  });

  afterEach(() => stop());

  const rail = () => document.querySelector<HTMLElement>(".rail")!;
  const plate = () => document.querySelector<HTMLElement>(".rail-plate")!;
  const link = (href: string) =>
    document.querySelector<HTMLElement>(`a[href="${href}"]`)!;

  it("lays the plate on the current link's slot and seats it", () => {
    stop = startRail(rail(), false);
    flush();
    expect(plate().style.getPropertyValue("--plate-x")).toBe("86.00px");
    expect(plate().style.getPropertyValue("--plate-w")).toBe("76.00px");
    expect(link("#stack").classList.contains("seated")).toBe(true);
    expect(rail().classList.contains("plate-seated")).toBe(true);
  });

  it("rests the plate on the first link while no link is current", () => {
    link("#stack").removeAttribute("aria-current");
    stop = startRail(rail(), false);
    flush();
    expect(plate().style.getPropertyValue("--plate-x")).toBe("6.00px");
    expect(link("#about").classList.contains("seated")).toBe(true);
    expect(link("#about").hasAttribute("aria-current")).toBe(false);
  });

  it("slides the plate to a newly current link, rising off the rail on the way", async () => {
    stop = startRail(rail(), false);
    flush();
    link("#stack").removeAttribute("aria-current");
    link("#work").setAttribute("aria-current", "true");
    await settle();
    for (let index = 0; index < 4; index++) {
      clock += 16;
      frames.shift()!(clock);
    }
    expect(link("#stack").classList.contains("seated")).toBe(false);
    expect(rail().classList.contains("plate-seated")).toBe(false);
    expect(
      Number(plate().style.getPropertyValue("--plate-lift")),
    ).toBeGreaterThan(0);
    flush();
    expect(plate().style.getPropertyValue("--plate-x")).toBe("166.00px");
    expect(link("#work").classList.contains("seated")).toBe(true);
  });

  it("lifts the seated key under the pointer and sinks it while pressed", () => {
    stop = startRail(rail(), false);
    flush();
    hovered.add(link("#stack"));
    rail().dispatchEvent(
      new PointerEvent("pointermove", { clientX: 124, clientY: 16 }),
    );
    flush();
    expect(link("#stack").style.getPropertyValue("--lift")).toBe("1.000");
    link("#stack").dispatchEvent(new PointerEvent("pointerdown"));
    flush();
    expect(Number(link("#stack").style.getPropertyValue("--lift"))).toBe(
      PRESS_LIFT,
    );
  });

  it("keeps the keys that are not seated flat under the pointer", () => {
    stop = startRail(rail(), false);
    flush();
    hovered.add(link("#about"));
    rail().dispatchEvent(
      new PointerEvent("pointermove", { clientX: 40, clientY: 16 }),
    );
    flush();
    expect(link("#about").style.getPropertyValue("--lift")).toBe("0.000");
  });

  it("moves at once and never flashes under reduced motion", async () => {
    stop = startRail(rail(), true);
    flush();
    link("#stack").removeAttribute("aria-current");
    link("#work").setAttribute("aria-current", "true");
    await settle();
    clock += 16;
    frames.shift()!(clock);
    expect(plate().style.getPropertyValue("--plate-x")).toBe("166.00px");
    expect(link("#work").style.getPropertyValue("--seam")).toBe("0.000");
  });
});
