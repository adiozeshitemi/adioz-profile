/*
 * The page's motion effects that CSS cannot express. Each one only adds to
 * markup that is complete without it: with this script missing, the header
 * keeps its glass background and the stat numbers show their final values.
 */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/*
 * Header state: data-at-top makes .site-header transparent while the page is
 * within 40px of the top. data-motion, set one frame after the first state,
 * enables the header's transitions, so the state on load does not animate.
 */
const header = document.querySelector<HTMLElement>(".site-header");
if (header) {
  const update = () => header.toggleAttribute("data-at-top", scrollY <= 40);
  update();
  addEventListener("scroll", update, { passive: true });
  requestAnimationFrame(() => header.toggleAttribute("data-motion", true));
}

/*
 * Stat counters: a [data-count] number counts from 0 to its value over one
 * second, easing out, when it first enters the viewport, with data-decimals
 * fraction digits. Skipped when the visitor prefers reduced motion.
 */
function countUp(element: HTMLElement) {
  const target = Number(element.dataset.count);
  const decimals = Number(element.dataset.decimals ?? 0);
  const start = performance.now();
  const frame = (now: number) => {
    const progress = Math.min(1, (now - start) / 1000);
    element.textContent = (target * (1 - (1 - progress) ** 3)).toFixed(
      decimals,
    );
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (!reduceMotion) {
  const counters = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      counters.unobserve(entry.target);
      countUp(entry.target as HTMLElement);
    }
  });
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-count]",
  )) {
    counters.observe(element);
  }
}
