/*
 * The experience timeline's rail, which fills with gold down to a reading
 * line as the page scrolls.
 */

/**
 * The share of the rail (0 to 1) filled for a reading line at `line`
 * (client px): the line's reach past the rail's top, over the rail's
 * `length`. `railTop` is the rail's top in client px.
 */
export const fillAt = (line: number, railTop: number, length: number) =>
  length > 0 ? Math.min(1, Math.max(0, (line - railTop) / length)) : 0;

/**
 * The reading line for a viewport `height` tall with `remaining` px of page
 * left below it: the middle of the viewport, sliding to its bottom over the
 * last half-viewport of scroll, so the fill completes at the end of the page.
 */
export const readingLine = (height: number, remaining: number) =>
  height - Math.min(Math.max(remaining, 0), height / 2);

/**
 * Runs the rail of `timeline`, an <ol> of .stop items each holding a
 * .rivet: sets --rail-top and --rail-length to span the first and last
 * rivets' centres and --fill (0 to 1) to the share above the reading line,
 * recomputed on scroll and resize, and marks .passed each stop whose rivet
 * the gold has reached. Under reduced motion the rail fills at once.
 * Returns a function that stops it.
 */
export function startTimeline(
  timeline: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const rivets = [...timeline.querySelectorAll<HTMLElement>(".rivet")];
  if (rivets.length === 0) return () => {};
  const centre = (rivet: HTMLElement) =>
    rivet.parentElement!.offsetTop + rivet.offsetTop + rivet.offsetHeight / 2;
  let frame = 0;

  function fill() {
    frame = 0;
    const top = centre(rivets[0]!);
    const length = centre(rivets.at(-1)!) - top;
    const remaining =
      document.documentElement.scrollHeight - innerHeight - scrollY;
    const progress = reduceMotion
      ? 1
      : fillAt(
          readingLine(innerHeight, remaining),
          timeline.getBoundingClientRect().top + top,
          length,
        );
    timeline.style.setProperty("--rail-top", `${top}px`);
    timeline.style.setProperty("--rail-length", `${Math.max(length, 0)}px`);
    timeline.style.setProperty("--fill", progress.toFixed(3));
    for (const rivet of rivets) {
      rivet.parentElement!.classList.toggle(
        "passed",
        centre(rivet) - top <= progress * length + 1,
      );
    }
  }
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(fill);
  };

  if (!reduceMotion) addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  void document.fonts?.ready.then(fill);
  fill();

  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("scroll", queue);
    removeEventListener("resize", queue);
  };
}
