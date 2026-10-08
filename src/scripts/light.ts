/*
 * The pointer carries the page's one light. A lit part within LIGHT_REACH px
 * of the pointer takes its light from the pointer: fully once the pointer is
 * on it, fading along a smoothstep with distance, and keeping its rest light
 * beyond. Every part renders lit from rest without this script.
 *
 * - Brushed faces (FACES) slide their highlight band (--lx, rest REST_LX) to
 *   the pointer's x.
 * - Spun discs (.spun) turn their light cross (--light, rest from the inline
 *   style or REST_LIGHT) toward the pointer.
 * - Panels (.panel) glow at the pointer: --glow-x and --glow-y place the glow,
 *   --near sets its strength.
 * - A spun disc with data-rest also rotates so its icon (data-rest, degrees
 *   clockwise from 12 o'clock) points at the pointer while the pointer is within LIGHT_REACH
 *   px of it and off its control, and counter-turns its --light so the cross
 *   stays on the light.
 *
 * Each frame every value closes FOLLOW of the gap to its target; angles take
 * the shorter way round, which for the two-fold cross is at most a quarter
 * turn. Frames run only while a value is moving, and stop while the tab is
 * hidden.
 */

export const LIGHT_REACH = 280;
export const FOLLOW = 0.18;
export const REST_LX = 70;
export const REST_LIGHT = 45;

/** The brushed faces whose highlight band follows the pointer. */
export const FACES = ".btn.machined, .plate, .nameplate";

interface Point {
  x: number;
  y: number;
}

/** True where the light runs: a fine pointer and no preference for reduced motion. */
export function lightEnabled(): boolean {
  return (
    matchMedia("(pointer: fine)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** `angle` folded into [-period / 2, period / 2). */
export function fold(angle: number, period: number): number {
  return ((((angle + period / 2) % period) + period) % period) - period / 2;
}

/** The direction of (dx, dy) in degrees clockwise from 12 o'clock. */
export function bearing(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** How strongly a pointer lights `box`: 1 on it, 0 from LIGHT_REACH px away, along a smoothstep. */
export function nearness(box: DOMRect, pointer: Point | null): number {
  if (!pointer) return 0;
  const dx = Math.max(box.left - pointer.x, 0, pointer.x - box.right);
  const dy = Math.max(box.top - pointer.y, 0, pointer.y - box.bottom);
  const t = clamp(1 - Math.hypot(dx, dy) / LIGHT_REACH, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Starts the light on the parts inside `root`, listening on `view`. Returns a
 * function that stops it.
 */
export function startLight(
  root: ParentNode = document,
  view: Window = window,
): () => void {
  const faces = [...root.querySelectorAll<HTMLElement>(FACES)].map((el) => ({
    el,
    lx: REST_LX,
    dirty: false,
  }));
  const discs = [...root.querySelectorAll<HTMLElement>(".spun")].map((el) => {
    const turns = el.dataset.rest !== undefined;
    const rest = parseFloat(el.style.getPropertyValue("--light")) || REST_LIGHT;
    return {
      el,
      rest,
      cross: rest,
      turn: 0,
      icon: turns ? Number(el.dataset.rest ?? 0) : null,
      control: turns ? el.closest("a, button") : null,
      dirty: false,
    };
  });
  const panels = [...root.querySelectorAll<HTMLElement>(".panel")].map(
    (el) => ({ el, glowX: 50, glowY: 0, near: 0, dirty: false }),
  );

  let pointer: Point | null = null;
  let frame = 0;
  let moving = false;

  /** Moves item[key] FOLLOW of the way to target, landing on it within epsilon. */
  function approach<K extends string>(
    item: { [key in K]: number } & { dirty: boolean },
    key: K,
    target: number,
    epsilon: number,
  ) {
    const values: Record<string, number> = item;
    const gap = target - values[key];
    if (gap === 0) return;
    values[key] =
      Math.abs(gap) <= epsilon ? target : values[key] + gap * FOLLOW;
    item.dirty = true;
    if (values[key] !== target) moving = true;
  }

  function step() {
    frame = 0;
    moving = false;
    const faceBoxes = faces.map(({ el }) => el.getBoundingClientRect());
    const discBoxes = discs.map(({ el }) => el.getBoundingClientRect());
    const panelBoxes = panels.map(({ el }) => el.getBoundingClientRect());

    faces.forEach((face, index) => {
      const box = faceBoxes[index];
      const at = pointer
        ? clamp((pointer.x - box.left) / box.width, -0.25, 1.25) * 100
        : REST_LX;
      approach(
        face,
        "lx",
        REST_LX + (at - REST_LX) * nearness(box, pointer),
        0.05,
      );
    });

    discs.forEach((disc, index) => {
      const box = discBoxes[index];
      const dx = pointer ? pointer.x - (box.left + box.width / 2) : 0;
      const dy = pointer ? pointer.y - (box.top + box.height / 2) : 0;
      const toward = bearing(dx, dy);
      const cross =
        disc.rest + fold(toward - disc.rest, 180) * nearness(box, pointer);
      approach(disc, "cross", disc.cross + fold(cross - disc.cross, 180), 0.05);
      if (disc.icon === null) return;
      const facing =
        pointer !== null &&
        Math.hypot(dx, dy) <= LIGHT_REACH &&
        !disc.control?.matches(":hover");
      const turn = facing ? toward - disc.icon : 0;
      approach(disc, "turn", disc.turn + fold(turn - disc.turn, 360), 0.05);
    });

    panels.forEach((panel, index) => {
      const box = panelBoxes[index];
      approach(panel, "near", nearness(box, pointer), 0.002);
      if (!pointer) return;
      approach(
        panel,
        "glowX",
        clamp((pointer.x - box.left) / box.width, -0.15, 1.15) * 100,
        0.05,
      );
      approach(
        panel,
        "glowY",
        clamp((pointer.y - box.top) / box.height, -0.15, 1.15) * 100,
        0.05,
      );
    });

    for (const face of faces) {
      if (!face.dirty) continue;
      face.dirty = false;
      face.el.style.setProperty("--lx", `${face.lx.toFixed(2)}%`);
    }
    for (const disc of discs) {
      if (!disc.dirty) continue;
      disc.dirty = false;
      disc.el.style.setProperty(
        "--light",
        `${(disc.cross - disc.turn).toFixed(2)}deg`,
      );
      if (disc.icon !== null) {
        disc.el.style.transform = `rotate(${disc.turn.toFixed(2)}deg)`;
      }
    }
    for (const panel of panels) {
      if (!panel.dirty) continue;
      panel.dirty = false;
      panel.el.style.setProperty("--near", panel.near.toFixed(3));
      panel.el.style.setProperty("--glow-x", `${panel.glowX.toFixed(2)}%`);
      panel.el.style.setProperty("--glow-y", `${panel.glowY.toFixed(2)}%`);
    }

    if (moving && !view.document.hidden) {
      frame = view.requestAnimationFrame(step);
    }
  }

  const relight = () => {
    if (!frame && !view.document.hidden) {
      frame = view.requestAnimationFrame(step);
    }
  };
  const onMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    relight();
  };
  const onLeave = (event: PointerEvent) => {
    if (event.relatedTarget) return;
    pointer = null;
    relight();
  };
  const onVisibility = () => {
    if (view.document.hidden) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    } else {
      relight();
    }
  };

  view.addEventListener("pointermove", onMove, { passive: true });
  view.addEventListener("scroll", relight, { passive: true });
  view.document.addEventListener("pointerout", onLeave);
  view.document.addEventListener("visibilitychange", onVisibility);

  return () => {
    view.cancelAnimationFrame(frame);
    frame = 0;
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("scroll", relight);
    view.document.removeEventListener("pointerout", onLeave);
    view.document.removeEventListener("visibilitychange", onVisibility);
  };
}
