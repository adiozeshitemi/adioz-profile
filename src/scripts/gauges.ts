/*
 * The tech stack gauges: each dial's scale geometry, shared with
 * Gauge.astro, and the needles' motion.
 */

/** The scale: radius 80 around (100, 100), from -135deg to 135deg clockwise from 12 o'clock. */
export const GAUGE_ARC = "M43.43 156.57 A80 80 0 1 1 156.57 156.57";
/** Degrees of needle turn per scale unit: 270deg across 0 to 100. */
const DEGREES_PER_UNIT = 2.7;

/** One tick on the scale, in the dial's 200 by 200 drawing. */
export interface Tick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
}

/** The scale's 21 ticks across 270deg, major (longer) every fifth tick. */
export function ticks(): Tick[] {
  return Array.from({ length: 21 }, (_, index) => {
    const angle = ((-135 + index * 13.5) * Math.PI) / 180;
    const major = index % 5 === 0;
    const [inner, outer] = major ? [86, 96] : [89, 94];
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      x1: round(100 + inner * Math.sin(angle)),
      y1: round(100 - inner * Math.cos(angle)),
      x2: round(100 + outer * Math.sin(angle)),
      y2: round(100 - outer * Math.cos(angle)),
      major,
    };
  });
}

/** The needle's turn at scale position `position` (clamped to 0 to 100), in degrees clockwise from 12 o'clock. */
export const needleAngle = (position: number) =>
  -135 + DEGREES_PER_UNIT * Math.min(100, Math.max(0, position));

/**
 * The scale position at client point (`x`, `y`) on a face whose box is
 * `box`: the point's bearing from the face's centre, clockwise from 12
 * o'clock, mapped from -135deg..135deg onto 0..100 and clamped.
 */
export function scaleAt(
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
) {
  const dx = x - (box.left + box.width / 2);
  const dy = y - (box.top + box.height / 2);
  const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.min(100, Math.max(0, (bearing + 135) / DEGREES_PER_UNIT));
}

/**
 * The needles' springs: STIFFNESS and DAMPING carry a needle to its target;
 * a released needle returns on the softer RETURN_STIFFNESS and
 * RETURN_DAMPING. Once the cluster is in view each needle sweeps to 100 and
 * settles on its value, STAGGER ms after the one before, starting DELAY ms
 * after; a mouse entering a dial knocks its needle by KNOCK units per second.
 */
export const GAUGE = {
  STIFFNESS: 42,
  DAMPING: 8.5,
  RETURN_STIFFNESS: 7,
  RETURN_DAMPING: 4.2,
  STAGGER: 140,
  DELAY: 300,
  KNOCK: 150,
};

/** A needle's state: its value, scale position and speed, and whether it sweeps to 100 first or returns from a drag. */
export interface Needle {
  value: number;
  pos: number;
  vel: number;
  sweep: boolean;
  returning: boolean;
}

/**
 * Advances `needle` by `dt` seconds toward 100 while it sweeps (until it
 * passes 98), then toward its value; returns whether it still moves.
 */
export function stepNeedle(needle: Needle, dt: number): boolean {
  if (needle.sweep && needle.pos >= 98) needle.sweep = false;
  const target = needle.sweep ? 100 : needle.value;
  const stiffness = needle.returning ? GAUGE.RETURN_STIFFNESS : GAUGE.STIFFNESS;
  const damping = needle.returning ? GAUGE.RETURN_DAMPING : GAUGE.DAMPING;
  needle.vel += (stiffness * (target - needle.pos) - damping * needle.vel) * dt;
  needle.pos += needle.vel * dt;
  if (Math.abs(needle.vel) < 0.05 && Math.abs(target - needle.pos) < 0.05) {
    needle.pos = target;
    needle.vel = 0;
    needle.returning = false;
    return false;
  }
  return true;
}

/**
 * Runs the .gauge dials in `cluster`. Each dial's markup shows its
 * data-value; the script drops every needle to 0, and once the cluster's
 * top rises above the bottom 35% of the viewport (whatever the cluster's
 * height) sweeps them to 100 and settles them on their values, one after
 * another. A needle can be dragged around the scale (.held while
 * dragging) and eases back to its value when released; touch screens keep
 * vertical scrolling (the dial's touch-action) and a touch's needle waits
 * for its first move. Under reduced motion the dials keep their values.
 * Returns a function that stops it.
 */
export function startGauges(
  cluster: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  if (reduceMotion) return () => {};
  const gauges = [...cluster.querySelectorAll<HTMLElement>(".gauge")].map(
    (gauge) => {
      const dial = gauge.querySelector<HTMLElement>(".dial")!;
      return {
        dial,
        face: dial.querySelector<HTMLElement>(".dial-face")!,
        fill: dial.querySelector<SVGPathElement>(".dial-fill")!,
        rotor: dial.querySelector<HTMLElement>(".rotor")!,
        number: dial.querySelector<HTMLElement>(".readout b")!,
        needle: {
          value: Number(gauge.dataset.value),
          pos: 0,
          vel: 0,
          sweep: false,
          returning: false,
        } as Needle,
        held: false,
        start: Infinity,
      };
    },
  );
  type Gauge = (typeof gauges)[number];

  function draw(gauge: Gauge) {
    const position = Math.min(100, Math.max(0, gauge.needle.pos));
    gauge.rotor.style.transform = `rotate(${needleAngle(position).toFixed(2)}deg)`;
    gauge.fill.style.strokeDasharray = `${position.toFixed(2)} 200`;
    gauge.fill.style.visibility = position < 0.5 ? "hidden" : "visible";
    gauge.number.textContent = String(Math.round(position));
  }

  let frame = 0;
  let time = 0;
  function step(now: number) {
    const dt = Math.min(0.032, (now - time) / 1000);
    time = now;
    let moving = false;
    for (const gauge of gauges) {
      if (gauge.held) continue;
      if (now < gauge.start) {
        moving ||= gauge.start !== Infinity;
        continue;
      }
      moving = stepNeedle(gauge.needle, dt) || moving;
      draw(gauge);
    }
    frame = moving ? requestAnimationFrame(step) : 0;
  }
  function run() {
    if (frame) return;
    time = performance.now();
    frame = requestAnimationFrame(step);
  }

  for (const gauge of gauges) draw(gauge);
  const view = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      view.disconnect();
      const now = performance.now();
      gauges.forEach((gauge, index) => {
        gauge.start = now + GAUGE.DELAY + index * GAUGE.STAGGER;
        gauge.needle.sweep = true;
      });
      run();
    },
    { rootMargin: "0px 0px -35% 0px" },
  );
  view.observe(cluster);

  const cleanups: (() => void)[] = [];
  for (const gauge of gauges) {
    const { dial } = gauge;
    const at = (event: PointerEvent) =>
      scaleAt(gauge.face.getBoundingClientRect(), event.clientX, event.clientY);
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || gauge.held) return;
      if (gauge.start === Infinity) return;
      gauge.needle.vel += GAUGE.KNOCK;
      run();
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dial.setPointerCapture?.(event.pointerId);
      dial.classList.add("held");
      gauge.held = true;
      gauge.needle.sweep = false;
      gauge.needle.vel = 0;
      if (event.pointerType === "touch") return;
      gauge.needle.pos = at(event);
      draw(gauge);
    };
    const onMove = (event: PointerEvent) => {
      if (!gauge.held) return;
      gauge.needle.pos = at(event);
      draw(gauge);
    };
    const release = () => {
      if (!gauge.held) return;
      dial.classList.remove("held");
      gauge.held = false;
      gauge.needle.returning = true;
      gauge.start = Math.min(gauge.start, performance.now());
      run();
    };
    const listeners: [string, (event: PointerEvent) => void][] = [
      ["pointerenter", onEnter],
      ["pointerdown", onDown],
      ["pointermove", onMove],
      ["pointerup", release],
      ["pointercancel", release],
    ];
    for (const [type, listener] of listeners) {
      dial.addEventListener(type, listener as EventListener);
      cleanups.push(() =>
        dial.removeEventListener(type, listener as EventListener),
      );
    }
  }

  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    view.disconnect();
    for (const cleanup of cleanups) cleanup();
  };
}
