/*
 * The particle field: metal beads (steel, and gold for GOLD_SHARE of them)
 * drifting on a fixed canvas behind the page, in LAYERS of depth. A layer sets
 * a bead's size, drift speed, parallax (how far it shifts with the pointer and
 * with scrolling) and how strongly it shows. Beads of the same or neighbouring
 * layers link within the link distance; beads part around the pointer within
 * PUSH px. Beads fade out over FADE px toward the text and header (MASKS), so
 * the field fills only the open space, and show at PANEL_SHOW behind panels.
 *
 * A "field:ripple" event on window (detail: x, y in client pixels, and tone
 * "hit" or "block") sends a ring outward that lights the beads it crosses,
 * gold for a hit and --ember for a block.
 *
 * Small screens (below SMALL_WIDTH) get fewer beads and shorter links. Under
 * prefers-reduced-motion the field draws one still frame and does not move;
 * frames stop while the tab is hidden.
 */

export const LINK = 128;
export const SMALL_LINK = 96;
export const SMALL_WIDTH = 640;
export const PUSH = 110;
export const FADE = 40;
export const PANEL_SHOW = 0.3;
export const GOLD_SHARE = 0.16;
export const RIPPLE = { speed: 0.42, band: 36, life: 1600 };
export const LAYERS = [
  { size: 0.9, speed: 0.5, parallax: 0.2, alpha: 0.55 },
  { size: 1.6, speed: 1, parallax: 0.5, alpha: 0.85 },
  { size: 2.8, speed: 1.6, parallax: 1, alpha: 1 },
];

/** Text the beads keep clear of. */
export const MASKS = ".site-header, .display, .h2, .eyebrow, .lede, .sub";
/** Surfaces the beads show dimly through. */
export const PANELS = ".panel";

type RGB = [number, number, number];

export interface Bead {
  x: number;
  y: number;
  vx: number;
  vy: number;
  layer: number;
  r: number;
  gold: boolean;
  /** Screen position after parallax and scroll. */
  sx: number;
  sy: number;
  /** How strongly the bead shows, 0 to 1. */
  show: number;
  /** How strongly a ripple lights the bead, 0 to 1, and in which colour. */
  glow: number;
  tint: RGB | null;
}

export interface Ripple {
  x: number;
  y: number;
  tone: "hit" | "block";
  start: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The number of beads for a canvas: one per 15,500px², 28 to 92, at most 36 below SMALL_WIDTH. */
export function beadCount(width: number, height: number): number {
  const count = Math.min(
    92,
    Math.max(28, Math.round((width * height) / 15500)),
  );
  return width < SMALL_WIDTH ? Math.min(36, count) : count;
}

/** Scatters beadCount beads over the canvas, cycling through the layers. */
export function seed(
  width: number,
  height: number,
  random: () => number = Math.random,
): Bead[] {
  return Array.from({ length: beadCount(width, height) }, (_, index) => {
    const layer = index % LAYERS.length;
    const { size, speed } = LAYERS[layer];
    return {
      x: random() * width,
      y: random() * height,
      vx: (random() - 0.5) * 0.24 * speed,
      vy: (random() - 0.5) * 0.24 * speed,
      layer,
      r: size * (0.8 + random() * 0.4),
      gold: random() < GOLD_SHARE,
      sx: 0,
      sy: 0,
      show: 1,
      glow: 0,
      tint: null,
    };
  });
}

/**
 * How openly a point shows: 0 inside a mask, rising to 1 at FADE px outside
 * every mask, and PANEL_SHOW of that inside a panel.
 */
export function openness(
  x: number,
  y: number,
  masks: Box[],
  panels: Box[],
): number {
  let near = Infinity;
  for (const mask of masks) {
    const dx = Math.max(mask.left - x, 0, x - mask.right);
    const dy = Math.max(mask.top - y, 0, y - mask.bottom);
    near = Math.min(near, Math.hypot(dx, dy));
  }
  const show = Math.min(1, near / FADE);
  const inPanel = panels.some(
    (panel) =>
      x > panel.left && x < panel.right && y > panel.top && y < panel.bottom,
  );
  return inPanel ? show * PANEL_SHOW : show;
}

/**
 * A bead's screen y: shifted by the view and the page's scroll, faster for
 * nearer layers, and wrapped over the canvas height plus 80px so beads fill
 * the page however far it scrolls.
 */
export function screenY(
  y: number,
  parallax: number,
  viewY: number,
  scroll: number,
  height: number,
): number {
  const span = height + 80;
  const scrolled = y - viewY * 16 * parallax - scroll * (0.25 + 0.5 * parallax);
  return ((((scrolled + 40) % span) + span) % span) - 40;
}

/**
 * How strongly `ripple` lights a point at `now`: 1 on its ring, fading over
 * RIPPLE.band px either side and over its life; 0 once it has expired.
 */
export function rippleLight(
  ripple: Ripple,
  x: number,
  y: number,
  now: number,
): number {
  const elapsed = now - ripple.start;
  if (elapsed < 0 || elapsed >= RIPPLE.life) return 0;
  const off = Math.abs(
    Math.hypot(x - ripple.x, y - ripple.y) - elapsed * RIPPLE.speed,
  );
  if (off >= RIPPLE.band) return 0;
  return (1 - off / RIPPLE.band) * (1 - elapsed / RIPPLE.life);
}

const triple = (value: string): RGB =>
  value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .slice(0, 3) as RGB;

const hex = (value: string): RGB => {
  const digits = value.trim().replace("#", "");
  return [0, 2, 4].map((index) =>
    parseInt(digits.slice(index, index + 2), 16),
  ) as RGB;
};

const mix = (a: RGB, b: RGB, t: number): RGB =>
  a.map((channel, index) =>
    Math.round(channel + (b[index] - channel) * t),
  ) as RGB;

const rgba = (color: RGB, alpha: number) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;

/** Whether the field moves: false under prefers-reduced-motion. */
export function fieldMoves(): boolean {
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Starts the field on `canvas`, reading its colours from <html>
 * (--particle, --particle-gold, --ember). Returns a function that stops it.
 */
export function startField(
  canvas: HTMLCanvasElement,
  view: Window = window,
): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const doc = view.document;
  const moves = fieldMoves();

  let width = 0;
  let height = 0;
  let link = LINK;
  let beads: Bead[] = [];
  let seededWidth = 0;
  let masks: Box[] = [];
  let panels: Box[] = [];
  let ripples: Ripple[] = [];
  let frame = 0;
  let steel: RGB = [205, 214, 228];
  let gold: RGB = [230, 192, 98];
  let ember: RGB = [240, 138, 106];
  const pointer = { x: -1e4, y: -1e4, nx: 0, ny: 0 };
  const lean = { x: 0, y: 0 };

  function recolor() {
    const style = view.getComputedStyle(doc.documentElement);
    steel = triple(style.getPropertyValue("--particle"));
    gold = triple(style.getPropertyValue("--particle-gold"));
    ember = hex(style.getPropertyValue("--ember"));
    if (!moves) draw(false);
  }

  /** The on-screen boxes of the elements matching `selector`. */
  const boxes = (selector: string): Box[] =>
    [...doc.querySelectorAll(selector)].flatMap((element) => {
      const box = element.getBoundingClientRect();
      return box.bottom > -FADE &&
        box.top < view.innerHeight + FADE &&
        box.width
        ? [box]
        : [];
    });

  function measure() {
    masks = boxes(MASKS);
    panels = boxes(PANELS);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(view.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    link = width < SMALL_WIDTH ? SMALL_LINK : LINK;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    measure();
    if (beads.length === 0 || Math.abs(seededWidth - width) > 80) {
      beads = seed(width, height);
      seededWidth = width;
    }
    if (!moves) draw(false);
  }

  /** A bead: a sphere lit from the top right, with a highlight, its body colour and a dark rim. */
  function paint(bead: Bead, body: RGB, alpha: number) {
    const r = bead.r * (1 + bead.glow * 1.2);
    const fill = ctx.createRadialGradient(
      bead.sx + r * 0.35,
      bead.sy - r * 0.4,
      r * 0.1,
      bead.sx,
      bead.sy,
      r,
    );
    fill.addColorStop(0, rgba(mix(body, [255, 255, 255], 0.75), alpha));
    fill.addColorStop(0.45, rgba(body, alpha));
    fill.addColorStop(1, rgba(mix(body, [0, 0, 0], 0.45), alpha));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(bead.sx, bead.sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (bead.glow <= 0.05) return;
    const tint = bead.tint ?? body;
    const halo = ctx.createRadialGradient(
      bead.sx,
      bead.sy,
      r,
      bead.sx,
      bead.sy,
      r * 7,
    );
    halo.addColorStop(0, rgba(tint, 0.7 * bead.glow * alpha));
    halo.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(bead.sx, bead.sy, r * 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(move: boolean) {
    const now = performance.now();
    ctx.clearRect(0, 0, width, height);
    if (move) {
      lean.x += (pointer.nx - lean.x) * 0.06;
      lean.y += (pointer.ny - lean.y) * 0.06;
    }
    ripples = ripples.filter((ripple) => now - ripple.start < RIPPLE.life);

    for (const bead of beads) {
      const layer = LAYERS[bead.layer];
      if (move) {
        const dx = bead.x - pointer.x;
        const dy = bead.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < PUSH && distance > 0.001) {
          const force = (1 - distance / PUSH) * 0.12 * layer.speed;
          bead.vx += (dx / distance) * force;
          bead.vy += (dy / distance) * force;
        }
        bead.x += bead.vx;
        bead.y += bead.vy;
        bead.vx *= 0.986;
        bead.vy *= 0.986;
        if (Math.abs(bead.vx) < 0.03 * layer.speed) {
          bead.vx += (Math.random() - 0.5) * 0.02 * layer.speed;
        }
        if (Math.abs(bead.vy) < 0.03 * layer.speed) {
          bead.vy += (Math.random() - 0.5) * 0.02 * layer.speed;
        }
        if (bead.x < -40) bead.x = width + 40;
        if (bead.x > width + 40) bead.x = -40;
        if (bead.y < -40) bead.y = height + 40;
        if (bead.y > height + 40) bead.y = -40;
      }
      bead.sx = bead.x - lean.x * 22 * layer.parallax;
      bead.sy = screenY(bead.y, layer.parallax, lean.y, view.scrollY, height);
      bead.show = layer.alpha * openness(bead.sx, bead.sy, masks, panels);
      bead.glow = 0;
      bead.tint = null;
      for (const ripple of ripples) {
        const lit = rippleLight(ripple, bead.sx, bead.sy, now);
        if (lit > bead.glow) {
          bead.glow = lit;
          bead.tint = ripple.tone === "block" ? ember : gold;
        }
      }
    }

    for (let i = 0; i < beads.length; i++) {
      const a = beads[i];
      if (a.show < 0.02) continue;
      for (let j = i + 1; j < beads.length; j++) {
        const b = beads[j];
        if (Math.abs(a.layer - b.layer) > 1 || b.show < 0.02) continue;
        const distance = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        if (distance >= link) continue;
        const depth = (LAYERS[a.layer].alpha + LAYERS[b.layer].alpha) / 2;
        ctx.strokeStyle = rgba(
          steel,
          (1 - distance / link) * 0.24 * depth * Math.min(a.show, b.show),
        );
        ctx.lineWidth = 0.4 + 0.3 * Math.min(a.layer, b.layer);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }

    for (const ripple of ripples) {
      const elapsed = now - ripple.start;
      ctx.strokeStyle = rgba(
        ripple.tone === "block" ? ember : gold,
        0.3 * (1 - elapsed / RIPPLE.life),
      );
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, elapsed * RIPPLE.speed, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const bead of [...beads].sort((a, b) => a.layer - b.layer)) {
      if (bead.show < 0.02) continue;
      const base = bead.gold ? gold : steel;
      const body =
        bead.glow > 0 && bead.tint ? mix(base, bead.tint, bead.glow) : base;
      paint(bead, body, Math.min(1, bead.show * (0.75 + bead.glow * 0.5)));
    }
  }

  function tick() {
    draw(true);
    frame = view.requestAnimationFrame(tick);
  }

  function start() {
    if (!frame && moves && !doc.hidden) {
      frame = view.requestAnimationFrame(tick);
    }
  }

  function pause() {
    view.cancelAnimationFrame(frame);
    frame = 0;
  }

  const onMove = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    pointer.x = event.clientX - box.left;
    pointer.y = event.clientY - box.top;
    pointer.nx = (event.clientX / view.innerWidth - 0.5) * 2;
    pointer.ny = (event.clientY / view.innerHeight - 0.5) * 2;
  };
  const onRipple = (event: Event) => {
    if (!moves) return;
    const { x, y, tone } = (event as CustomEvent<Omit<Ripple, "start">>).detail;
    const box = canvas.getBoundingClientRect();
    ripples.push({
      x: x - box.left,
      y: y - box.top,
      tone: tone === "block" ? "block" : "hit",
      start: performance.now(),
    });
  };
  const onVisibility = () => (doc.hidden ? pause() : start());
  let resizeTimer = 0;
  const onResize = () => {
    view.clearTimeout(resizeTimer);
    resizeTimer = view.setTimeout(resize, 150);
  };
  // The theme changes data-theme on <html>; the bead colours follow it.
  const themeWatch = new MutationObserver(recolor);

  recolor();
  resize();
  start();
  view.addEventListener("pointermove", onMove, { passive: true });
  view.addEventListener("scroll", measure, { passive: true });
  view.addEventListener("resize", onResize);
  view.addEventListener("field:ripple", onRipple);
  doc.addEventListener("visibilitychange", onVisibility);
  themeWatch.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => {
    pause();
    view.clearTimeout(resizeTimer);
    themeWatch.disconnect();
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("scroll", measure);
    view.removeEventListener("resize", onResize);
    view.removeEventListener("field:ripple", onRipple);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
