/*
 * Cards that swivel toward the pointer.
 */

/** How far a tilted card's edges rise or sink: DEPTH_SIDES px at its side edges, DEPTH_ENDS px at its top and bottom. */
export const TILT = { DEPTH_SIDES: 26, DEPTH_ENDS: 8, FOLLOW: 0.18 };

/** The angle, in degrees, that raises an edge `half` px from the axis by `depth` px. */
export const tiltLimit = (depth: number, half: number) =>
  half > 0 ? (Math.asin(Math.min(1, depth / half)) * 180) / Math.PI : 0;

/**
 * The tilt toward a pointer at (`x`, `y`) over a card whose box is `box`:
 * rotateY up to `limitY` degrees across its width and rotateX up to
 * `limitX` down its height, so the edge under the pointer sinks.
 */
export function tiltToward(
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  limitY: number,
  limitX: number,
) {
  return {
    y: ((x - box.left) / box.width - 0.5) * 2 * limitY,
    x: -((y - box.top) / box.height - 0.5) * 2 * limitX,
  };
}

/**
 * Swivels `card` toward the pointer while it is over it: perspective
 * 1000px, a 3px lift against the view's lean, and every frame closes FOLLOW
 * of the gap to the pointer's angle, limited so the edges move by
 * DEPTH_SIDES and DEPTH_ENDS px; leaving eases it flat. Only for fine
 * pointers without reduced motion. Returns a function that stops it.
 */
export function startTilt(
  card: HTMLElement,
  enabled = matchMedia("(pointer: fine)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  if (!enabled) return () => {};
  let limitY = 0;
  let limitX = 0;
  let target = { x: 0, y: 0 };
  let angle = { x: 0, y: 0 };
  let frame = 0;

  function render() {
    angle = {
      y: angle.y + (target.y - angle.y) * TILT.FOLLOW,
      x: angle.x + (target.x - angle.x) * TILT.FOLLOW,
    };
    card.style.transform = `perspective(1000px) rotateY(${angle.y.toFixed(2)}deg) rotateX(${angle.x.toFixed(2)}deg) translate(calc(var(--lean) * var(--slant) * -3px), -3px)`;
    const settled =
      Math.abs(target.y - angle.y) < 0.01 &&
      Math.abs(target.x - angle.x) < 0.01;
    frame = settled ? 0 : requestAnimationFrame(render);
  }
  const onEnter = () => {
    limitY = tiltLimit(TILT.DEPTH_SIDES, card.offsetWidth / 2);
    limitX = tiltLimit(TILT.DEPTH_ENDS, card.offsetHeight / 2);
    card.style.transition =
      "transform 0.18s ease-out, box-shadow 0.5s var(--ease-soft)";
  };
  const onMove = (event: PointerEvent) => {
    target = tiltToward(
      card.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      limitY,
      limitX,
    );
    if (!frame) frame = requestAnimationFrame(render);
  };
  const onLeave = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    target = { x: 0, y: 0 };
    angle = { x: 0, y: 0 };
    card.style.transition =
      "transform 0.7s var(--ease-soft), box-shadow 0.5s var(--ease-soft)";
    card.style.transform = "";
  };
  card.addEventListener("pointerenter", onEnter);
  card.addEventListener("pointermove", onMove, { passive: true });
  card.addEventListener("pointerleave", onLeave);

  return () => {
    cancelAnimationFrame(frame);
    card.removeEventListener("pointerenter", onEnter);
    card.removeEventListener("pointermove", onMove);
    card.removeEventListener("pointerleave", onLeave);
  };
}
