/*
 * Every raised part (PARTS) is seen from the lower left at rest (--lean
 * VIEW_REST, set in theme.css). A part under the pointer turns its view away
 * from the pointer: its --lean runs from -1 with the pointer at the part's
 * right edge to 1 at its left edge. A part focused from the keyboard turns to
 * --lean 1. A part inside another part takes that part's view unless the
 * pointer is on it or it is focused; elements that are not parts, such as the
 * gauge dials set into a plate, inherit their part's --lean through CSS.
 *
 * Each frame a turning part's --lean closes VIEW_FOLLOW of the gap to its
 * target, so views shift slowly; once a part settles back on its parent's
 * view it drops its own --lean. Frames run only while a view is moving, and
 * stop while the tab is hidden.
 */

export const VIEW_FOLLOW = 0.07;
export const VIEW_REST = -1;

/** The raised parts whose view turns. */
export const PARTS =
  ".display, .h2, .eyebrow-no, .btn.machined, .knob, .plate, .panel";

interface Part {
  el: HTMLElement;
  lean: number;
  /** True while the part carries its own --lean. */
  own: boolean;
  parent: Part | null;
}

/** The view a hovered part turns to: -1 with the pointer at its right edge, 1 at its left edge. */
export function leanAway(box: DOMRect, pointerX: number): number {
  return Math.min(1, Math.max(-1, 1 - (2 * (pointerX - box.left)) / box.width));
}

/**
 * Starts turning the parts inside `root`, listening on `view`. Returns a
 * function that stops it.
 */
export function startView(
  root: ParentNode = document,
  view: Window = window,
): () => void {
  const parts: Part[] = [...root.querySelectorAll<HTMLElement>(PARTS)].map(
    (el) => ({ el, lean: VIEW_REST, own: false, parent: null }),
  );
  const partOf = new Map(parts.map((part) => [part.el, part]));
  for (const part of parts) {
    let ancestor = part.el.parentElement;
    while (ancestor && !partOf.has(ancestor)) {
      ancestor = ancestor.parentElement;
    }
    part.parent = ancestor ? (partOf.get(ancestor) ?? null) : null;
  }

  let pointerX: number | null = null;
  let frame = 0;

  // Parents come before their children in document order, so each part reads
  // its parent's view from this frame.
  function turn() {
    frame = 0;
    let moving = false;
    for (const part of parts) {
      const inherited = part.parent ? part.parent.lean : VIEW_REST;
      const hovered = pointerX !== null && part.el.matches(":hover");
      const focused = !hovered && part.el.matches(":focus-visible");
      if (!hovered && !focused && !part.own) {
        part.lean = inherited;
        continue;
      }
      let target = inherited;
      if (hovered && pointerX !== null) {
        target = leanAway(part.el.getBoundingClientRect(), pointerX);
      } else if (focused) {
        target = 1;
      }
      const gap = target - part.lean;
      part.lean =
        Math.abs(gap) < 0.002 ? target : part.lean + gap * VIEW_FOLLOW;
      if (part.lean !== target) moving = true;
      if (!hovered && !focused && part.lean === target) {
        part.own = false;
        part.el.style.removeProperty("--lean");
      } else {
        part.own = true;
        part.el.style.setProperty("--lean", part.lean.toFixed(3));
      }
    }
    if (moving && !view.document.hidden) {
      frame = view.requestAnimationFrame(turn);
    }
  }

  const reconsider = () => {
    if (!frame && !view.document.hidden) {
      frame = view.requestAnimationFrame(turn);
    }
  };
  const onMove = (event: PointerEvent) => {
    pointerX = event.clientX;
    reconsider();
  };
  const onLeave = (event: PointerEvent) => {
    if (event.relatedTarget) return;
    pointerX = null;
    reconsider();
  };
  const onVisibility = () => {
    if (view.document.hidden) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    } else {
      reconsider();
    }
  };

  view.addEventListener("pointermove", onMove, { passive: true });
  view.document.addEventListener("pointerout", onLeave);
  view.document.addEventListener("focusin", reconsider);
  view.document.addEventListener("focusout", reconsider);
  view.document.addEventListener("visibilitychange", onVisibility);

  return () => {
    view.cancelAnimationFrame(frame);
    frame = 0;
    view.removeEventListener("pointermove", onMove);
    view.document.removeEventListener("pointerout", onLeave);
    view.document.removeEventListener("focusin", reconsider);
    view.document.removeEventListener("focusout", reconsider);
    view.document.removeEventListener("visibilitychange", onVisibility);
  };
}
