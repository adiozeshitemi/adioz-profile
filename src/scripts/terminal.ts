/*
 * The hero's agent log: the entries typing in one after another, and the
 * window buttons on its title bar.
 */

/** Milliseconds between two log entries. */
export const LINE_GAP = 1100;
/** Entries kept on the screen, and kept while the log is zoomed. */
export const KEEP = 6;
export const KEEP_ZOOMED = 14;
/** Milliseconds the close animation runs before the log is hidden. */
export const CLOSE_TIME = 380;

/** `date` as a 24-hour "HH:MM:SS" clock reading. */
export const clock = (date: Date) =>
  [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

/**
 * Types the log: takes the entries rendered in `list` as the script, empties
 * it, then appends one entry every LINE_GAP ms, cycling through the script,
 * each led by a <time> holding the clock reading it was written at. The
 * screen keeps the newest KEEP entries (KEEP_ZOOMED while the .log is
 * .zoomed). Typing pauses while the tab is hidden or the list is off screen.
 * Under reduced motion the rendered entries stay as they are. Returns a
 * function that stops it.
 */
export function startLog(
  list: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const script = [...list.children];
  if (reduceMotion || script.length === 0) return () => {};
  const log = list.closest(".log");
  let next = 0;
  let timer = 0;
  let onScreen = true;

  function write() {
    timer = 0;
    const entry = script[next]!.cloneNode(true) as Element;
    next = (next + 1) % script.length;
    const time = document.createElement("time");
    time.textContent = clock(new Date());
    entry.prepend(time);
    list.append(entry);
    const keep = log?.classList.contains("zoomed") ? KEEP_ZOOMED : KEEP;
    while (list.children.length > keep) list.firstElementChild!.remove();
    schedule();
  }

  function schedule() {
    if (!timer && onScreen && !document.hidden) {
      timer = window.setTimeout(write, LINE_GAP);
    }
  }

  function pause() {
    clearTimeout(timer);
    timer = 0;
  }

  const visibility = () => (document.hidden ? pause() : schedule());
  document.addEventListener("visibilitychange", visibility);
  const watch = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    if (onScreen) schedule();
    else pause();
  });
  watch.observe(list);

  list.replaceChildren();
  write();

  return () => {
    pause();
    watch.disconnect();
    document.removeEventListener("visibilitychange", visibility);
  };
}

/**
 * The window buttons of `log`, a .log with .close, .min and .zoom buttons:
 * close shrinks it away (.closing for CLOSE_TIME ms, none under reduced
 * motion), then hides it (.closed) and shows and focuses `reopen`, which
 * brings it back and focuses close. Minimise toggles .minimised, folding the
 * screen to the title bar. Zoom shows `shade` (a manual popover dimming the
 * page) and lifts the log into the top layer as a manual popover above it
 * (.zoomed), leaving a placeholder of its height in the page; zoom again,
 * Esc, a click on the shade or close puts it back. Minimise and zoom report
 * their state in aria-pressed. Enables the buttons, which the markup renders
 * disabled. Returns a function that stops it.
 */
export function startWindow(
  log: HTMLElement,
  reopen: HTMLButtonElement,
  shade: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const close = log.querySelector<HTMLButtonElement>(".close")!;
  const min = log.querySelector<HTMLButtonElement>(".min")!;
  const zoom = log.querySelector<HTMLButtonElement>(".zoom")!;
  const placeholder = document.createElement("div");
  placeholder.className = "log-placeholder";
  let closing = 0;

  function setZoom(on: boolean) {
    if (on === log.classList.contains("zoomed")) return;
    if (on) {
      placeholder.style.height = `${log.offsetHeight}px`;
      log.before(placeholder);
      shade.showPopover();
      log.setAttribute("popover", "manual");
      log.showPopover();
    } else {
      log.hidePopover();
      log.removeAttribute("popover");
      shade.hidePopover();
      placeholder.remove();
    }
    log.classList.toggle("zoomed", on);
    zoom.setAttribute("aria-pressed", String(on));
  }

  const onClose = () => {
    setZoom(false);
    log.classList.add("closing");
    closing = window.setTimeout(
      () => {
        log.classList.add("closed");
        log.classList.remove("closing");
        reopen.hidden = false;
        reopen.focus();
      },
      reduceMotion ? 0 : CLOSE_TIME,
    );
  };
  const onReopen = () => {
    reopen.hidden = true;
    log.classList.remove("closed");
    close.focus();
  };
  const onMin = () => {
    const on = !log.classList.contains("minimised");
    log.classList.toggle("minimised", on);
    min.setAttribute("aria-pressed", String(on));
  };
  const onZoom = () => setZoom(!log.classList.contains("zoomed"));
  const onShade = () => setZoom(false);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") setZoom(false);
  };

  close.addEventListener("click", onClose);
  reopen.addEventListener("click", onReopen);
  min.addEventListener("click", onMin);
  zoom.addEventListener("click", onZoom);
  shade.addEventListener("click", onShade);
  addEventListener("keydown", onKey);
  for (const button of [close, min, zoom]) button.disabled = false;

  return () => {
    clearTimeout(closing);
    setZoom(false);
    close.removeEventListener("click", onClose);
    reopen.removeEventListener("click", onReopen);
    min.removeEventListener("click", onMin);
    zoom.removeEventListener("click", onZoom);
    shade.removeEventListener("click", onShade);
    removeEventListener("keydown", onKey);
  };
}
