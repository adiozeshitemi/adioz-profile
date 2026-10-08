/*
 * The header's section links: the scroll spy that marks the current section's
 * link, and the rail of key caps whose gold plate follows it.
 */

/**
 * Scroll spy: in each group of links that links to the section crossing the
 * middle of the viewport (between 45% from the top and 50% from the bottom),
 * marks that link aria-current="true" and clears the mark from the group's
 * other links. A group without a link to the section keeps its mark. Returns a
 * function that stops it.
 */
export function startScrollSpy(groups: HTMLAnchorElement[][]): () => void {
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) markCurrent(groups, `#${entry.target.id}`);
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const link of groups.flat()) {
    const href = link.getAttribute("href") ?? "";
    const section = href.startsWith("#")
      ? document.getElementById(href.slice(1))
      : null;
    if (section) spy.observe(section);
  }
  return () => spy.disconnect();
}

/** Marks the links to `href` aria-current in each group that has one. */
export function markCurrent(groups: HTMLAnchorElement[][], href: string) {
  for (const group of groups) {
    if (!group.some((link) => link.getAttribute("href") === href)) continue;
    for (const link of group) {
      if (link.getAttribute("href") === href) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }
}

/** A damped spring: its value moves toward target under stiffness and damping. */
export interface Spring {
  value: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
}

export const spring = (
  value: number,
  stiffness: number,
  damping: number,
): Spring => ({ value, velocity: 0, target: value, stiffness, damping });

/**
 * Advances `s` by `dt` seconds and returns whether it is still moving. With
 * `jump` (reduced motion) it lands on its target at once.
 */
export function advance(s: Spring, dt: number, jump = false): boolean {
  if (!jump) {
    s.velocity +=
      ((s.target - s.value) * s.stiffness - s.velocity * s.damping) * dt;
    s.value += s.velocity * dt;
  }
  if (
    jump ||
    (Math.abs(s.target - s.value) < 0.001 && Math.abs(s.velocity) < 0.01)
  ) {
    s.value = s.target;
    s.velocity = 0;
    return false;
  }
  return true;
}

export const MAX_TILT = 14;
export const PRESS_LIFT = 0.15;
export const PLATE_TRAVEL_LIFT = 0.8;

/**
 * The rail: its .rail-plate slides to the slot of the link marked
 * aria-current, resting on the first link's slot while no link is marked
 * (the top of the page, before the first linked section). It rises out of
 * the rail while it travels (up to
 * PLATE_TRAVEL_LIFT) and swings with its speed; when it seats, the link takes
 * .seated, the rail takes .plate-seated (hiding .rail-plate, whose place the
 * link's own key cap takes) and the slot's seams flash. The seated link's key
 * breaks out of the rail (--lift 1) while it is under the pointer or focused,
 * tilting up to MAX_TILT degrees toward the pointer; pressing sinks it to
 * PRESS_LIFT. A break or a seating sets the link's flash to 1, and a slot's
 * left seam glows (--seam) by the larger flash of the links either side of it.
 * Every value is a damped spring stepped each frame while any of them moves;
 * with reduced motion the values jump to their targets and nothing flashes.
 * Returns a function that stops it.
 */
export function startRail(
  rail: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const plate = rail.querySelector<HTMLElement>(".rail-plate");
  const links = [...rail.querySelectorAll<HTMLAnchorElement>("a")];
  if (!plate || links.length === 0) return () => {};

  const keys = links.map((el) => ({
    el,
    lift: spring(0, 340, 18),
    tiltX: spring(0, 260, 20),
    tiltY: spring(0, 260, 20),
    flash: 0,
    hover: false,
    focus: false,
    press: false,
    px: 0.5,
    py: 0.5,
  }));
  type Key = (typeof keys)[number];
  const plateX = spring(0, 210, 24);
  const plateW = spring(0, 210, 24);
  let seatedKey: Key | null = null;
  let frame = 0;
  let time = 0;

  const currentKey = () =>
    keys.find((key) => key.el.hasAttribute("aria-current")) ?? keys[0];
  const flashKey = (key: Key) => {
    if (!reduceMotion) key.flash = 1;
  };

  /** Only the seated link's key (the plate) rises and tilts; the others stay flat. */
  function aim(key: Key) {
    const live = key.el.classList.contains("seated");
    key.lift.target = !live
      ? 0
      : key.press
        ? PRESS_LIFT
        : key.hover || key.focus
          ? 1
          : 0;
    key.tiltX.target = live && key.hover ? (key.px - 0.5) * 2 * MAX_TILT : 0;
    key.tiltY.target = live && key.hover ? -(key.py - 0.5) * 2 * MAX_TILT : 0;
  }

  /** Aims the plate at the current link's slot; `jump` moves it there at once. */
  function aimPlate(jump: boolean) {
    const key = currentKey();
    if (!key) return;
    plateX.target = key.el.offsetLeft + 2;
    plateW.target = key.el.offsetWidth - 4;
    if (jump) {
      plateX.value = plateX.target;
      plateW.value = plateW.target;
      plateX.velocity = plateW.velocity = 0;
    }
  }

  function step(now: number) {
    frame = 0;
    const dt = time ? Math.min(1 / 30, (now - time) / 1000) : 1 / 60;
    time = now;
    let moving = false;
    for (const key of keys) {
      moving = advance(key.lift, dt, reduceMotion) || moving;
      moving = advance(key.tiltX, dt, reduceMotion) || moving;
      moving = advance(key.tiltY, dt, reduceMotion) || moving;
      key.flash = key.flash > 0.01 ? key.flash * Math.exp(-dt * 5) : 0;
      if (key.flash) moving = true;
    }
    moving = advance(plateX, dt, reduceMotion) || moving;
    moving = advance(plateW, dt, reduceMotion) || moving;

    const current = currentKey();
    const travel = Math.min(1, Math.abs(plateX.velocity) / 900);
    const seated =
      Math.abs(plateX.target - plateX.value) < 0.75 && travel < 0.05;
    if (seated && current && seatedKey !== current) {
      seatedKey?.el.classList.remove("seated");
      seatedKey = current;
      current.el.classList.add("seated");
      flashKey(current);
      aim(current);
      moving = true;
    } else if (!seated && seatedKey) {
      seatedKey.el.classList.remove("seated");
      aim(seatedKey);
      seatedKey = null;
    }
    rail.classList.toggle("plate-seated", seatedKey !== null);

    keys.forEach((key, index) => {
      key.el.style.setProperty("--lift", key.lift.value.toFixed(3));
      key.el.style.setProperty("--tilt-x", `${key.tiltX.value.toFixed(2)}deg`);
      key.el.style.setProperty("--tilt-y", `${key.tiltY.value.toFixed(2)}deg`);
      key.el.style.setProperty(
        "--seam",
        Math.max(key.flash, keys[index - 1]?.flash ?? 0).toFixed(3),
      );
    });
    plate!.style.setProperty("--plate-x", `${plateX.value.toFixed(2)}px`);
    plate!.style.setProperty("--plate-w", `${plateW.value.toFixed(2)}px`);
    plate!.style.setProperty(
      "--plate-lift",
      (travel * PLATE_TRAVEL_LIFT).toFixed(3),
    );
    const swing = reduceMotion
      ? 0
      : Math.min(18, Math.max(-18, plateX.velocity / 40));
    plate!.style.setProperty("--plate-tilt-x", `${swing.toFixed(2)}deg`);

    if (moving) frame = requestAnimationFrame(step);
    else time = 0;
  }

  const wake = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  /*
   * A link's hover follows :hover, re-read on every pointer event over the
   * rail, so a key drops even when its own pointerleave never arrives.
   */
  const rehover = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    for (const key of keys) {
      const hover = event.type !== "pointerleave" && key.el.matches(":hover");
      if (hover && !key.hover && key.el.classList.contains("seated")) {
        flashKey(key);
      }
      if (!hover) key.press = false;
      key.hover = hover;
      if (hover) {
        const box = key.el.getBoundingClientRect();
        key.px = (event.clientX - box.left) / box.width;
        key.py = (event.clientY - box.top) / box.height;
      }
      aim(key);
    }
    wake();
  };
  const pointerTypes = [
    "pointerover",
    "pointermove",
    "pointerout",
    "pointerleave",
  ] as const;
  for (const type of pointerTypes) {
    rail.addEventListener(type, rehover, { passive: true });
  }

  const cleanups: (() => void)[] = [];
  for (const key of keys) {
    const listen = (type: string, handler: () => void) => {
      key.el.addEventListener(type, handler);
      cleanups.push(() => key.el.removeEventListener(type, handler));
    };
    listen("pointerdown", () => {
      key.press = true;
      aim(key);
      wake();
    });
    listen("pointerup", () => {
      key.press = false;
      aim(key);
      wake();
    });
    listen("focus", () => {
      if (!key.el.matches(":focus-visible")) return;
      key.focus = true;
      if (key.el.classList.contains("seated")) flashKey(key);
      aim(key);
      wake();
    });
    listen("blur", () => {
      key.focus = false;
      aim(key);
      wake();
    });
  }

  const marks = new MutationObserver(() => {
    aimPlate(false);
    wake();
  });
  marks.observe(rail, {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-current"],
  });
  // A resize moves the slots: a seated plate jumps to its slot, a travelling one re-aims.
  const sizes = new ResizeObserver(() => {
    aimPlate(seatedKey !== null && seatedKey === currentKey());
    wake();
  });
  sizes.observe(rail);

  aimPlate(true);
  wake();

  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    marks.disconnect();
    sizes.disconnect();
    for (const type of pointerTypes) rail.removeEventListener(type, rehover);
    for (const cleanup of cleanups) cleanup();
  };
}
