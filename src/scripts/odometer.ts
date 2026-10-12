/*
 * The activity panel's odometer counters. Each `[data-odometer]` window
 * holds one `.drum` per digit (and `.comma` separators) showing its final
 * value; once a third of the window is in view, its drums roll from all
 * zeros up to that value, easing out. Without this script, or under reduced
 * motion, the drums keep their final value.
 */

/** Milliseconds a counter takes to reach its value. */
export const ROLL_MS = 1600;

/**
 * The digits `drums` drums show for `value`: its whole part, padded with
 * leading zeros to `drums` digits; a value longer than `drums` keeps all its
 * digits.
 */
export function drumDigits(value: number, drums: number): string[] {
  return [...String(Math.max(0, Math.round(value))).padStart(drums, "0")];
}

/** The share of the roll done at `progress` (0 to 1): an ease-out cubic. */
export function rollEase(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return 1 - (1 - clamped) ** 3;
}

/** Writes `digits` into `drums`, the last digit into the last drum. */
function show(drums: HTMLElement[], digits: string[]) {
  const offset = digits.length - drums.length;
  drums.forEach((drum, index) => {
    drum.textContent = digits[index + offset] ?? "0";
  });
}

/**
 * Starts the odometers in `windows`: sets each to zeros, then rolls it to
 * its `data-odometer` value the first time it comes into view. Returns a
 * function that stops observing and cancels any roll.
 */
export function startOdometers(
  windows: HTMLElement[],
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  if (reduceMotion || windows.length === 0) return () => {};
  const frames = new Set<number>();
  const drumsOf = (element: Element) => [
    ...element.querySelectorAll<HTMLElement>(".drum:not(.comma)"),
  ];

  const roll = (element: HTMLElement) => {
    const drums = drumsOf(element);
    const target = Number(element.dataset.odometer);
    const start = performance.now();
    const frame = (now: number) => {
      const progress = (now - start) / ROLL_MS;
      show(drums, drumDigits(target * rollEase(progress), drums.length));
      if (progress < 1) frames.add(requestAnimationFrame(frame));
    };
    frames.add(requestAnimationFrame(frame));
  };

  for (const element of windows) {
    const drums = drumsOf(element);
    show(drums, drumDigits(0, drums.length));
  }
  const view = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        view.unobserve(entry.target);
        roll(entry.target as HTMLElement);
      }
    },
    { threshold: 0.33 },
  );
  for (const element of windows) view.observe(element);

  return () => {
    view.disconnect();
    for (const id of frames) cancelAnimationFrame(id);
  };
}
