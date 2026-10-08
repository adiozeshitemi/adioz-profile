/*
 * The about pillars: the .lit fallback for readers who cannot hover them, and
 * the portrait's swinging drawstrings.
 */

/** The band of the viewport a pillar must cross to light: its middle fifth. */
export const FOCUS_MARGIN = "-40% 0px -40% 0px";

/**
 * Lights a pillar (.lit) while it crosses the middle fifth of the viewport,
 * for readers who cannot hover it: on devices without hover, and on any
 * device once the last input was a key press, until the mouse moves again.
 * .lit stands in for :hover, and each change fires "pillar-lit" on the
 * pillar. Returns a function that stops it.
 */
export function startPillarFocus(pillars: HTMLElement[]): () => void {
  const noHover = matchMedia("(hover: none)").matches;
  const centred = new Set<Element>();
  let keys = false;

  const relight = () => {
    for (const pillar of pillars) {
      const lit = centred.has(pillar) && (noHover || keys);
      if (lit === pillar.classList.contains("lit")) continue;
      pillar.classList.toggle("lit", lit);
      pillar.dispatchEvent(new Event("pillar-lit"));
    }
  };
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) centred.add(entry.target);
        else centred.delete(entry.target);
      }
      relight();
    },
    { rootMargin: FOCUS_MARGIN },
  );
  for (const pillar of pillars) watch.observe(pillar);
  const onKey = () => {
    if (keys) return;
    keys = true;
    relight();
  };
  const onPointer = (event: PointerEvent) => {
    if (!keys || event.pointerType !== "mouse") return;
    keys = false;
    relight();
  };
  addEventListener("keydown", onKey);
  addEventListener("pointermove", onPointer, { passive: true });

  return () => {
    watch.disconnect();
    removeEventListener("keydown", onKey);
    removeEventListener("pointermove", onPointer);
  };
}

/**
 * The drawstrings' physics. Each cord is a damped pendulum (STIFFNESS, and
 * DAMPING while swinging or SETTLE_DAMPING at rest), kicked while swinging at
 * random intervals of KICK_MIN to KICK_MAX seconds by up to KICK degrees per
 * second. The cords knock into each other: when they come within GAP drawing
 * units at the shorter cord's length while closing, they trade angular
 * speeds, keeping RESTITUTION of them. Angles are clockwise degrees, held
 * within LIMIT, so a positive angle swings a cord's tip left.
 */
export const CORD = {
  STIFFNESS: 16,
  DAMPING: 0.9,
  SETTLE_DAMPING: 3.2,
  KICK: 70,
  KICK_MIN: 0.25,
  KICK_MAX: 0.9,
  GAP: 95,
  RESTITUTION: 0.8,
  LIMIT: 16,
};

/** One drawstring: its pivot's x and its length in drawing units, its angle in degrees and speed in degrees per second, and when its next kick is due in ms. */
export interface Cord {
  pivot: number;
  length: number;
  angle: number;
  speed: number;
  kickAt: number;
}

/**
 * Advances `cords` (the two drawstrings) by `dt` seconds at time `now` (ms);
 * `random` returns a number from 0 to 1. Returns whether they still move.
 */
export function stepCords(
  cords: [Cord, Cord],
  dt: number,
  now: number,
  swinging: boolean,
  random: () => number = Math.random,
): boolean {
  for (const cord of cords) {
    if (swinging && now >= cord.kickAt) {
      cord.speed += (random() * 2 - 1) * CORD.KICK;
      cord.kickAt =
        now +
        (CORD.KICK_MIN + random() * (CORD.KICK_MAX - CORD.KICK_MIN)) * 1000;
    }
    const damping = swinging ? CORD.DAMPING : CORD.SETTLE_DAMPING;
    cord.speed += (-CORD.STIFFNESS * cord.angle - damping * cord.speed) * dt;
    cord.angle = Math.max(
      -CORD.LIMIT,
      Math.min(CORD.LIMIT, cord.angle + cord.speed * dt),
    );
  }
  const [left, right] =
    cords[0].pivot < cords[1].pivot ? cords : [cords[1], cords[0]];
  const depth = Math.min(left.length, right.length);
  const rad = Math.PI / 180;
  const gap =
    right.pivot -
    left.pivot -
    depth * (Math.sin(right.angle * rad) - Math.sin(left.angle * rad));
  if (gap < CORD.GAP && right.speed > left.speed) {
    [left.speed, right.speed] = [
      right.speed * CORD.RESTITUTION,
      left.speed * CORD.RESTITUTION,
    ];
  }
  return (
    swinging ||
    cords.some(
      (cord) => Math.abs(cord.angle) > 0.02 || Math.abs(cord.speed) > 0.05,
    )
  );
}

/**
 * Swings the two .hood-cord drawstrings in `portrait` (rotating each by its
 * angle) while it is hovered or .lit, starting on pointerenter and on
 * "pillar-lit"; off the pillar they settle to rest, and frames stop once they
 * do. Does nothing under reduced motion. Returns a function that stops it.
 */
export function startCords(
  portrait: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const elements = [...portrait.querySelectorAll<SVGGElement>(".hood-cord")];
  if (reduceMotion || elements.length !== 2) return () => {};
  const cords = elements.map((element) => {
    const box = element.getBBox();
    return {
      element,
      pivot: box.x + box.width / 2,
      length: box.height,
      angle: 0,
      speed: 0,
      kickAt: 0,
    };
  }) as [Cord & { element: SVGGElement }, Cord & { element: SVGGElement }];
  let frame = 0;
  let time = 0;

  function step(now: number) {
    const dt = Math.min(0.032, (now - time) / 1000);
    time = now;
    const moving = stepCords(cords, dt, now, portrait.matches(":hover, .lit"));
    for (const cord of cords) {
      if (moving) {
        cord.element.style.transform = `rotate(${cord.angle.toFixed(2)}deg)`;
      } else {
        cord.element.style.removeProperty("transform");
      }
    }
    frame = moving ? requestAnimationFrame(step) : 0;
  }

  const start = () => {
    const now = performance.now();
    for (const cord of cords) cord.kickAt = now + Math.random() * 200;
    if (!frame) {
      time = now;
      frame = requestAnimationFrame(step);
    }
  };
  const onLit = () => {
    if (portrait.classList.contains("lit")) start();
  };
  portrait.addEventListener("pointerenter", start);
  portrait.addEventListener("pillar-lit", onLit);

  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    portrait.removeEventListener("pointerenter", start);
    portrait.removeEventListener("pillar-lit", onLit);
  };
}
