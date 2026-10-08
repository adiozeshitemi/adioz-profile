/*
 * The experience section's career trace, and the switch between the trace
 * and the timeline.
 */
import type { YearRange } from "../data/types";

/** `date` as a fractional year, e.g. 2026.75 for the start of October 2026. */
export const yearOf = (date: Date) =>
  date.getFullYear() + (date.getMonth() + (date.getDate() - 1) / 31) / 12;

/** A role's span on the trace's time scale, 0 to 1 across the track. */
export interface Span {
  from: number;
  to: number;
  live: boolean;
}

/** A year label on the axis; odd ones and ones near the now label drop on narrow screens. */
export interface Tick {
  year: number;
  at: number;
  odd: boolean;
  nearNow: boolean;
}

/**
 * The trace's time scale for `periods` at fractional year `now`: from the
 * earliest start to the year after now (`years` years), a tick per year,
 * the now marker's place, and each period's span from the start of its
 * first year to the end of its last, or to now while it is ongoing.
 */
export function traceLayout(periods: YearRange[], now: number) {
  const first = Math.min(...periods.map((period) => period.start));
  const last = Math.floor(now) + 1;
  const at = (year: number) => (year - first) / (last - first);
  const nowAt = at(now);
  const ticks: Tick[] = [];
  for (let year = first; year < last; year++) {
    ticks.push({
      year,
      at: at(year),
      odd: (year - first) % 2 === 1,
      nearNow: Math.abs(at(year) - nowAt) < 0.12,
    });
  }
  const spans: Span[] = periods.map((period) => ({
    from: at(period.start),
    to: period.end === null ? nowAt : at(period.end + 1),
    live: period.end === null,
  }));
  return { first, years: last - first, nowAt, ticks, spans };
}

/**
 * The order of `periods` on the trace, as indexes: earliest start first,
 * then earliest end (an ongoing role ends at `now`), then data order.
 */
export const traceOrder = (periods: YearRange[], now: number) =>
  periods
    .map((period, index) => ({ period, index }))
    .sort(
      (a, b) =>
        a.period.start - b.period.start ||
        (a.period.end ?? now) - (b.period.end ?? now) ||
        a.index - b.index,
    )
    .map(({ index }) => index);

/** The tab index a key moves to from `current` among `count` tabs, wrapping; undefined for other keys. */
export function tabTarget(key: string, current: number, count: number) {
  const next = {
    ArrowDown: current + 1,
    ArrowRight: current + 1,
    ArrowUp: current - 1,
    ArrowLeft: current - 1,
    Home: 0,
    End: count - 1,
  }[key];
  return next === undefined ? undefined : (next + count) % count;
}

/**
 * Runs the trace in `trace`: its [role=tab] rows select their
 * [role=tabpanel] (aria-selected, a roving tabindex, the other panels
 * hidden), on click or with the arrow keys, Home and End, which also move
 * focus. The spans draw in from their start once a third of the trace is in
 * view (.drawn), at once under reduced motion. Returns a function that
 * stops it.
 */
export function startTrace(
  trace: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const tabs = [...trace.querySelectorAll<HTMLElement>("[role=tab]")];
  const panels = tabs.map((tab) =>
    document.getElementById(tab.getAttribute("aria-controls") ?? ""),
  );
  const list = trace.querySelector<HTMLElement>("[role=tablist]");

  function select(index: number, focus = false) {
    tabs.forEach((tab, other) => {
      const selected = other === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[other]?.toggleAttribute("hidden", !selected);
    });
    if (focus) tabs[index]?.focus();
  }

  const clicks = tabs.map((tab, index) => {
    const onClick = () => select(index);
    tab.addEventListener("click", onClick);
    return () => tab.removeEventListener("click", onClick);
  });
  const onKey = (event: KeyboardEvent) => {
    const current = tabs.findIndex(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    const next = tabTarget(event.key, current, tabs.length);
    if (next === undefined) return;
    event.preventDefault();
    select(next, true);
  };
  list?.addEventListener("keydown", onKey);

  let view: IntersectionObserver | null = null;
  if (reduceMotion) {
    trace.classList.add("drawn");
  } else {
    view = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        view?.disconnect();
        trace.classList.add("drawn");
      },
      { threshold: 0.3 },
    );
    view.observe(trace);
  }

  return () => {
    for (const cleanup of clicks) cleanup();
    list?.removeEventListener("keydown", onKey);
    view?.disconnect();
  };
}

/**
 * Runs the view switch in `section`: shows the switch, sets data-view on
 * `section` to the pressed button's data-view (the markup's aria-pressed
 * button at start) and keeps each button's aria-pressed in step. Returns a
 * function that stops it.
 */
export function startViewSwitch(section: HTMLElement): () => void {
  const group = section.querySelector<HTMLElement>(".view-switch");
  const buttons = [
    ...section.querySelectorAll<HTMLButtonElement>(".view-switch button"),
  ];
  if (!group || buttons.length === 0) return () => {};
  const show = (button: HTMLButtonElement) => {
    section.dataset.view = button.dataset.view;
    for (const other of buttons) {
      other.setAttribute("aria-pressed", String(other === button));
    }
  };
  show(
    buttons.find((button) => button.getAttribute("aria-pressed") === "true") ??
      buttons[0]!,
  );
  group.hidden = false;
  const cleanups = buttons.map((button) => {
    const onClick = () => show(button);
    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  });
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
