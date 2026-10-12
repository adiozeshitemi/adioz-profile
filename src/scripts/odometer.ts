/*
 * The activity panel's odometer counters, wheels like a combination lock's.
 * Each `.drum` holds a `.reel`: the digits 0 to 9 repeated `REEL_TURNS`
 * times, set on its `data-digit` in the last turn through `--at`. Each time a
 * counter comes into view, its reels snap back to 0 and spin forward to
 * their digits, the drums one after another from the left. Without this
 * script, or under reduced motion, the reels stay on their digits.
 */

/** Turns of 0 to 9 on each reel; a spin runs from the first turn's 0 to the last turn's digit. */
export const REEL_TURNS = 3;

/** Milliseconds between one drum starting to spin and the next. */
export const DRUM_STAGGER_MS = 90;

/** The reel cell a drum rests on to show `digit`: the digit in the last turn. */
export function reelIndex(digit: number): number {
  return (REEL_TURNS - 1) * 10 + digit;
}

/** The reel cells, top to bottom: 0 to 9, `REEL_TURNS` times. */
export function reelDigits(): number[] {
  return Array.from({ length: REEL_TURNS * 10 }, (_, index) => index % 10);
}

/** Sets every reel in `counter` to cell 0 at once, then spins each to its digit, staggered from the left. */
function spin(counter: Element) {
  const reels = [...counter.querySelectorAll<HTMLElement>(".reel")];
  for (const reel of reels) {
    reel.style.transition = "none";
    reel.style.setProperty("--at", "0");
  }
  // Reading layout commits the reset, so the spin below transitions from 0.
  void counter.getBoundingClientRect();
  reels.forEach((reel, index) => {
    const digit = Number(reel.parentElement?.dataset.digit ?? 0);
    reel.style.transition = "";
    reel.style.transitionDelay = `${index * DRUM_STAGGER_MS}ms`;
    reel.style.setProperty("--at", String(reelIndex(digit)));
  });
}

/**
 * Spins the counters in `counters` each time one comes into view (a third of
 * it showing). Returns a function that stops watching them.
 */
export function startOdometers(
  counters: HTMLElement[],
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  if (reduceMotion || counters.length === 0) return () => {};
  const view = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) spin(entry.target);
      }
    },
    { threshold: 0.33 },
  );
  for (const counter of counters) view.observe(counter);
  return () => view.disconnect();
}
