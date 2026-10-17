/*
 * A workflow's step-through: which hops each step lights, the 2D diagram's
 * wires, routed through the gutters of its grid so no wire crosses a box,
 * and the runner that keeps one step current, moved by Auto and the step
 * bar, and reports it to the 3D board with "flowstep" events.
 */

/**
 * The edges each step lights, as indexes into `edges`: an edge is lit by a
 * step that lights its `to` node when its `from` node is lit by that step or
 * the step before.
 */
export function stepHops(
  steps: { lights: string[] }[],
  edges: { from: string; to: string }[],
): number[][] {
  return steps.map((step, index) => {
    const before = steps[index - 1]?.lights ?? [];
    return edges.flatMap((edge, edgeIndex) =>
      step.lights.includes(edge.to) &&
      (step.lights.includes(edge.from) || before.includes(edge.from))
        ? [edgeIndex]
        : [],
    );
  });
}

/** A box in the diagram's stage, in pixels from the stage's top left. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A node's grid cell and its measured box. */
export interface PlacedNode {
  col: number;
  row: number;
  box: Box;
}

/** A point in the stage, in pixels: [x, y]. */
export type Point = [number, number];

type Side = "top" | "right" | "bottom" | "left";
/** A gutter a wire travels along: a vertical one (x) between columns, or a horizontal one (y) between rows; index 0 is the outer gutter before the first. */
type Lane = { axis: "x" | "y"; index: number };
interface Plan {
  exit: Side;
  lanes: Lane[];
  entry: Side;
}

/** Pixels between wires that share a gutter. */
const LANE_SPACING = 7;

/**
 * The plans a wire from cell `a` to cell `b` can take: the side it leaves,
 * the gutters it travels along, and the side it enters. Neighbours in a row
 * or column have one plan, straight across their gutter. Any other wire
 * may go round either side of its row or column, or reach a diagonal
 * target through the gutters next to it (inner) or round its far side
 * (wrap), leaving across or along, and through the gutter between two
 * neighbouring rows or columns.
 */
function plans(
  a: { col: number; row: number },
  b: { col: number; row: number },
): Plan[] {
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  const right = dc > 0;
  const down = dr > 0;
  const x = (index: number): Lane => ({ axis: "x", index });
  const y = (index: number): Lane => ({ axis: "y", index });
  if (dr === 0 && Math.abs(dc) === 1) {
    return [
      {
        exit: right ? "right" : "left",
        lanes: [x(right ? a.col + 1 : a.col)],
        entry: right ? "left" : "right",
      },
    ];
  }
  if (dc === 0 && Math.abs(dr) === 1) {
    return [
      {
        exit: down ? "bottom" : "top",
        lanes: [y(down ? a.row + 1 : a.row)],
        entry: down ? "top" : "bottom",
      },
    ];
  }
  if (dr === 0) {
    return [
      { exit: "bottom", lanes: [y(a.row + 1)], entry: "bottom" },
      { exit: "top", lanes: [y(a.row)], entry: "top" },
    ];
  }
  if (dc === 0) {
    return [
      { exit: "left", lanes: [x(a.col)], entry: "left" },
      { exit: "right", lanes: [x(a.col + 1)], entry: "right" },
    ];
  }
  const across = right ? "right" : "left";
  const back = right ? "left" : "right";
  const along = down ? "bottom" : "top";
  const up = down ? "top" : "bottom";
  const options: Plan[] = [
    {
      exit: across,
      lanes: [x(right ? a.col + 1 : a.col), y(down ? b.row : b.row + 1)],
      entry: up,
    },
    {
      exit: along,
      lanes: [y(down ? a.row + 1 : a.row), x(right ? b.col : b.col + 1)],
      entry: back,
    },
    {
      exit: back,
      lanes: [x(right ? a.col : a.col + 1), y(down ? b.row + 1 : b.row)],
      entry: along,
    },
    {
      exit: up,
      lanes: [y(down ? a.row : a.row + 1), x(right ? b.col + 1 : b.col)],
      entry: across,
    },
  ];
  if (Math.abs(dr) === 1) {
    options.push({
      exit: along,
      lanes: [y(down ? a.row + 1 : a.row)],
      entry: up,
    });
  }
  if (Math.abs(dc) === 1) {
    options.push({
      exit: across,
      lanes: [x(right ? a.col + 1 : a.col)],
      entry: back,
    });
  }
  return options;
}

/** Whether runs `p` and `q` cross at right angles away from their ends. */
function crossing(p: [Point, Point], q: [Point, Point]) {
  const flat = (run: [Point, Point]) => run[0][1] === run[1][1];
  if (flat(p) === flat(q)) return false;
  const [h, v] = flat(p) ? [p, q] : [q, p];
  const between = (value: number, a: number, b: number) =>
    value > Math.min(a, b) + 0.5 && value < Math.max(a, b) - 0.5;
  return (
    between(v[0][0], h[0][0], h[1][0]) && between(h[0][1], v[0][1], v[1][1])
  );
}

/** Pixels a turn adds to a plan's cost. */
const TURN_COST = 24;

/** The point at `fraction` along `side` of `box`. */
function onSide(box: Box, side: Side, fraction: number): Point {
  const x = box.left + (box.right - box.left) * fraction;
  const y = box.top + (box.bottom - box.top) * fraction;
  if (side === "top") return [x, box.top];
  if (side === "bottom") return [x, box.bottom];
  if (side === "left") return [box.left, y];
  return [box.right, y];
}

/** `points` without repeated points or points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out.at(-1);
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    const before = out.at(-2);
    if (
      before &&
      last &&
      ((before[0] === last[0] && last[0] === point[0]) ||
        (before[1] === last[1] && last[1] === point[1]))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * The wires of `edges` (indexes into `nodes`) as polylines of right-angled
 * runs, from the side of the `from` box to the side of the `to` box,
 * each on its cheapest plan (see `plans`): the shortest, with the fewest
 * turns and above all the fewest crossings with the wires planned before
 * it. Every row's boxes share a top and bottom and every column's boxes a left
 * and right, as a CSS grid that stretches its items lays them out; `pad`
 * is the stage's padding around the grid, which holds the outer gutters.
 * Wires that leave or enter the same side of a box spread along it, and
 * wires that share a gutter run LANE_SPACING apart.
 */
export function routeWires(
  nodes: PlacedNode[],
  edges: { from: number; to: number }[],
  pad: number,
): Point[][] {
  const cols = Math.max(...nodes.map((node) => node.col)) + 1;
  const rows = Math.max(...nodes.map((node) => node.row)) + 1;
  const span = (axis: "col" | "row", at: number) => {
    const boxes = nodes.filter((node) => node[axis] === at).map((n) => n.box);
    return axis === "col"
      ? [
          Math.min(...boxes.map((b) => b.left)),
          Math.max(...boxes.map((b) => b.right)),
        ]
      : [
          Math.min(...boxes.map((b) => b.top)),
          Math.max(...boxes.map((b) => b.bottom)),
        ];
  };
  const colSpans = Array.from({ length: cols }, (_, at) => span("col", at));
  const rowSpans = Array.from({ length: rows }, (_, at) => span("row", at));
  /** A gutter's centre and half-width; gutter `index` lies before track `index`. */
  const gutter = (spans: number[][], index: number) => {
    const before = spans[index - 1];
    const after = spans[index];
    if (!before) return { mid: after![0]! - pad / 2, half: pad / 2 };
    if (!after) return { mid: before[1]! + pad / 2, half: pad / 2 };
    return {
      mid: (before[1]! + after[0]!) / 2,
      half: (after[0]! - before[1]!) / 2,
    };
  };

  /** The polyline of `route` from `from` to `to`, its ends at `ports` or mid-side and its gutter runs at `lanes` or mid-gutter. */
  const trace = (
    route: Plan,
    from: number,
    to: number,
    exitAt = 0.5,
    entryAt = 0.5,
    lane = (l: Lane) =>
      gutter(l.axis === "x" ? colSpans : rowSpans, l.index).mid,
  ) => {
    const start = onSide(nodes[from]!.box, route.exit, exitAt);
    const end = onSide(nodes[to]!.box, route.entry, entryAt);
    const points: Point[] = [start];
    let [x, y] = start;
    for (const l of route.lanes) {
      if (l.axis === "x") x = lane(l);
      else y = lane(l);
      points.push([x, y]);
    }
    if (route.entry === "left" || route.entry === "right") {
      points.push([x, end[1]]);
    } else points.push([end[0], y]);
    points.push(end);
    return simplify(points);
  };
  const runs = (points: Point[]) =>
    points.slice(1).map((point, i) => [points[i]!, point] as [Point, Point]);

  // Plans: straight wires first, then each other wire's cheapest plan, by
  // length, turns and crossings with the wires already planned; a crossing
  // costs half the stage's width and height together.
  const all = nodes.map((node) => node.box);
  const crossCost =
    (Math.max(...all.map((b) => b.right)) -
      Math.min(...all.map((b) => b.left)) +
      Math.max(...all.map((b) => b.bottom)) -
      Math.min(...all.map((b) => b.top))) /
    2;
  const options = edges.map((edge) =>
    plans(nodes[edge.from]!, nodes[edge.to]!),
  );
  const chosen: (Plan | undefined)[] = options.map((list) =>
    list.length === 1 ? list[0] : undefined,
  );
  const placed = () =>
    chosen.flatMap((route, edge) =>
      route ? runs(trace(route, edges[edge]!.from, edges[edge]!.to)) : [],
    );
  options.forEach((list, edge) => {
    if (chosen[edge]) return;
    const others = placed();
    let best = Infinity;
    for (const route of list) {
      const points = trace(route, edges[edge]!.from, edges[edge]!.to);
      const own = runs(points);
      const length = own.reduce(
        (sum, [p, q]) => sum + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]),
        0,
      );
      const crossings = own.reduce(
        (sum, run) =>
          sum + others.filter((other) => crossing(run, other)).length,
        0,
      );
      const cost =
        length + (points.length - 2) * TURN_COST + crossings * crossCost;
      if (cost < best) {
        best = cost;
        chosen[edge] = route;
      }
    }
  });
  const plansOf = chosen as Plan[];

  // Ports: each wire's fraction along the side it leaves and the side it enters.
  const ends = new Map<
    string,
    { edge: number; end: "exit" | "entry"; key: number }[]
  >();
  plansOf.forEach((route, edge) => {
    const { from, to } = edges[edge]!;
    for (const [end, node, other, side] of [
      ["exit", from, to, route.exit],
      ["entry", to, from, route.entry],
    ] as const) {
      const far = nodes[other]!.box;
      const key =
        side === "top" || side === "bottom"
          ? (far.left + far.right) / 2
          : (far.top + far.bottom) / 2;
      const id = `${node}:${side}`;
      ends.set(id, [...(ends.get(id) ?? []), { edge, end, key }]);
    }
  });
  const ports = new Map<string, number>();
  for (const list of ends.values()) {
    list
      .sort((a, b) => a.key - b.key || a.edge - b.edge)
      .forEach((port, index) =>
        ports.set(`${port.edge}:${port.end}`, (index + 1) / (list.length + 1)),
      );
  }
  // A straight wire between neighbours keeps one line: the end alone on its
  // side takes the other end's place along it.
  plansOf.forEach((route, edge) => {
    if (route.lanes.length !== 1 || options[edge]!.length !== 1) return;
    const { from, to } = edges[edge]!;
    const alone = (node: number, side: Side) =>
      ends.get(`${node}:${side}`)!.length === 1;
    if (alone(from, route.exit)) {
      ports.set(`${edge}:exit`, ports.get(`${edge}:entry`)!);
    } else if (alone(to, route.entry)) {
      ports.set(`${edge}:entry`, ports.get(`${edge}:exit`)!);
    }
  });

  // Lanes: each wire's offset from the centre of every gutter it travels along.
  const users = new Map<string, number[]>();
  plansOf.forEach((route, edge) => {
    for (const lane of route.lanes) {
      const id = `${lane.axis}${lane.index}`;
      users.set(id, [...(users.get(id) ?? []), edge]);
    }
  });
  const laneAt = (lane: Lane, edge: number) => {
    const { mid, half } = gutter(
      lane.axis === "x" ? colSpans : rowSpans,
      lane.index,
    );
    const list = users.get(`${lane.axis}${lane.index}`)!;
    const spacing = Math.min(LANE_SPACING, (half * 2) / (list.length + 1));
    return mid + (list.indexOf(edge) - (list.length - 1) / 2) * spacing;
  };

  return plansOf.map((route, edge) =>
    trace(
      route,
      edges[edge]!.from,
      edges[edge]!.to,
      ports.get(`${edge}:exit`)!,
      ports.get(`${edge}:entry`)!,
      (lane) => laneAt(lane, edge),
    ),
  );
}

const round = (value: number) => Math.round(value * 10) / 10;

/** `points` as SVG path data, each corner rounded with up to `radius` pixels. */
export function wirePath(points: Point[], radius = 8): string {
  const [first, ...rest] = points;
  if (!first) return "";
  let d = `M${round(first[0])} ${round(first[1])}`;
  rest.forEach((point, index) => {
    const next = rest[index + 1];
    const prev = index === 0 ? first : rest[index - 1]!;
    if (!next) {
      d += ` L${round(point[0])} ${round(point[1])}`;
      return;
    }
    const inLength = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
    const outLength = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const toward = (from: Point, length: number): Point => [
      point[0] + ((from[0] - point[0]) / length) * r,
      point[1] + ((from[1] - point[1]) / length) * r,
    ];
    const [ax, ay] = toward(prev, inLength);
    const [bx, by] = toward(next, outLength);
    d += ` L${round(ax)} ${round(ay)} Q${round(point[0])} ${round(point[1])} ${round(bx)} ${round(by)}`;
  });
  return d;
}

/** The arrowhead at the end of `points`, a triangle `size` pixels long pointing along the last run. */
export function arrowHead(points: Point[], size = 7): string {
  const tip = points.at(-1);
  const from = points.at(-2);
  if (!tip || !from) return "";
  const length = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const ux = (tip[0] - from[0]) / length;
  const uy = (tip[1] - from[1]) / length;
  const bx = tip[0] - ux * size;
  const by = tip[1] - uy * size;
  const wing = size * 0.55;
  return `M${round(tip[0])} ${round(tip[1])} L${round(bx - uy * wing)} ${round(by + ux * wing)} L${round(bx + uy * wing)} ${round(by - ux * wing)} Z`;
}

/** `step` wrapped into 0 to `count` - 1: past the last step is the first, before the first is the last. */
export const wrapStep = (step: number, count: number) =>
  ((step % count) + count) % count;

/**
 * The step the step bar moves to from `current` among `count` steps on
 * `key`: ArrowLeft and ArrowRight move one step, Home and End to the first
 * and last, stopping at the ends; undefined for every other key.
 */
export function keyTarget(
  key: string,
  current: number,
  count: number,
): number | undefined {
  const moves: Record<string, number> = {
    ArrowLeft: current - 1,
    ArrowRight: current + 1,
    Home: 0,
    End: count - 1,
  };
  const next = moves[key];
  return next === undefined
    ? undefined
    : Math.min(count - 1, Math.max(0, next));
}

/** Milliseconds Auto holds each step before it moves to the next. */
export const AUTO_STEP_MS = 4500;

/**
 * The detail of the "flowstep" event startFlow dispatches on its root: the
 * current step's index with `all` false, or -1 with `all` true while every
 * step is lit at once.
 */
export interface FlowStepDetail {
  step: number;
  all: boolean;
}

/**
 * Runs the step-through in `root`, a [data-workflow-steps] section holding
 * the 2D diagram (.flow: its .flow-stage of [data-node] boxes and its
 * .flow-wires of .wire[data-from][data-to] groups, each holding
 * [data-shape="line"] and [data-shape="head"] paths), the diagram's column
 * (.flow-visual), the step bar (.step-bar) and the captions (ol.steps > li,
 * each with data-lights and data-hops). It draws every wire, setting each
 * line path's --len to its length in px, and redraws them whenever the stage
 * or a box changes size.
 *
 * Under reduced motion it sets data-flow="all" and data-step="-1" on `root`,
 * lights every node and wire and leaves the step bar hidden. Otherwise it
 * sets data-flow="step", shows the step bar and keeps one step current
 * (data-step): its nodes and wires .lit, earlier steps' .passed, its caption
 * aria-current="step", and the step bar's readout, entry (.now-entry) and
 * keys (.bar-key) on it. It dispatches "flowstep" (FlowStepDetail) on `root`
 * once it starts and on every change of step.
 *
 * Auto, on from the start, moves to the next step every AUTO_STEP_MS, from
 * the last step round to the first, while .flow-visual is in view and the
 * tab is shown, without scrolling the page; while it runs the step bar's
 * live region (.now-step) is aria-live="off". A step chosen by the reader
 * turns Auto off: a step key, a knob (.bar-prev, .bar-next, wrapping with
 * wrapStep), ArrowLeft, ArrowRight, Home or End in the step bar (stopping at
 * the ends, keyTarget). The Auto key (.auto-key, aria-pressed) turns
 * Auto off and on, on again from the current step. Returns a function that
 * stops it.
 */
export function startFlow(
  root: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const items = [...root.querySelectorAll<HTMLLIElement>("ol.steps > li")];
  if (items.length === 0) return () => {};
  const stage = root.querySelector<HTMLElement>(".flow-stage");
  const visual = root.querySelector<HTMLElement>(".flow-visual") ?? root;
  const boxes = [
    ...(stage?.querySelectorAll<HTMLElement>("[data-node]") ?? []),
  ];
  const wires = [
    ...root.querySelectorAll<SVGGElement>(
      ".flow-wires .wire[data-from][data-to]",
    ),
  ];
  const ids = boxes.map((box) => box.dataset.node ?? "");
  const lights = items.map((item) => (item.dataset.lights ?? "").split(" "));
  const hops = items.map((item) =>
    (item.dataset.hops ?? "").split(" ").filter(Boolean).map(Number),
  );
  const pad = () =>
    stage ? parseFloat(getComputedStyle(stage).paddingTop) || 0 : 0;

  function draw() {
    if (!stage || boxes.length === 0) return;
    const origin = stage.getBoundingClientRect();
    const placed = boxes.map((box) => {
      const rect = box.getBoundingClientRect();
      return {
        col: Number(box.dataset.col),
        row: Number(box.dataset.row),
        box: {
          left: rect.left - origin.left,
          top: rect.top - origin.top,
          right: rect.right - origin.left,
          bottom: rect.bottom - origin.top,
        },
      };
    });
    const edges = wires.map((wire) => ({
      from: ids.indexOf(wire.dataset.from ?? ""),
      to: ids.indexOf(wire.dataset.to ?? ""),
    }));
    const routes = routeWires(placed, edges, pad());
    wires.forEach((wire, index) => {
      const points = routes[index]!;
      const line = wirePath(points);
      const head = arrowHead(points);
      const lines = [
        ...wire.querySelectorAll<SVGPathElement>('[data-shape="line"]'),
      ];
      for (const path of lines) path.setAttribute("d", line);
      const length = `${round(lines[0]?.getTotalLength() ?? 0)}px`;
      for (const path of lines) path.style.setProperty("--len", length);
      for (const path of wire.querySelectorAll('[data-shape="head"]')) {
        path.setAttribute("d", head);
      }
    });
  }

  // data-flow shows .flow-visual, so the first draw measures the shown boxes.
  root.dataset.flow = reduceMotion ? "all" : "step";
  draw();
  const resize = new ResizeObserver(() => draw());
  if (stage) resize.observe(stage);
  for (const box of boxes) resize.observe(box);
  void document.fonts?.ready.then(() => draw());

  const dispatch = (detail: FlowStepDetail) =>
    root.dispatchEvent(new CustomEvent<FlowStepDetail>("flowstep", { detail }));

  if (reduceMotion) {
    root.dataset.step = "-1";
    for (const box of boxes) box.classList.add("lit");
    for (const wire of wires) wire.classList.add("lit");
    dispatch({ step: -1, all: true });
    return () => resize.disconnect();
  }

  const bar = root.querySelector<HTMLElement>(".step-bar");
  const readout = bar?.querySelector<HTMLElement>(".readout b");
  const live = bar?.querySelector<HTMLElement>(".now-step");
  const entries = [...(bar?.querySelectorAll<HTMLElement>(".now-entry") ?? [])];
  const keys = [...(bar?.querySelectorAll<HTMLElement>(".bar-key") ?? [])];
  const autoKey = bar?.querySelector<HTMLElement>(".auto-key");
  const count = items.length;
  let current = -1;
  /** Auto's state: whether it is on, whether .flow-visual is in view, and the timer of its next step. */
  const auto: {
    on: boolean;
    inView: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } = { on: true, inView: false };

  /** Starts the timer of Auto's next step while Auto is on, .flow-visual is in view and the tab is shown, and clears it otherwise. */
  function schedule() {
    clearTimeout(auto.timer);
    if (!auto.on || !auto.inView || document.hidden) return;
    auto.timer = setTimeout(
      () => show(wrapStep(current + 1, count)),
      AUTO_STEP_MS,
    );
  }

  /** Sets the Auto key's aria-pressed and the live region's aria-live from `auto.on`, then reschedules Auto. */
  function showAuto() {
    autoKey?.setAttribute("aria-pressed", String(auto.on));
    live?.setAttribute("aria-live", auto.on ? "off" : "polite");
    schedule();
  }

  function show(step: number) {
    if (step === current) return;
    current = step;
    const earlier = new Set(lights.slice(0, step).flat());
    const earlierHops = new Set(hops.slice(0, step).flat());
    boxes.forEach((box, index) => {
      const lit = lights[step]!.includes(ids[index]!);
      box.classList.toggle("lit", lit);
      box.classList.toggle("passed", !lit && earlier.has(ids[index]!));
    });
    wires.forEach((wire, index) => {
      const lit = hops[step]!.includes(index);
      wire.classList.toggle("lit", lit);
      wire.classList.toggle("passed", !lit && earlierHops.has(index));
    });
    items.forEach((item, index) => {
      if (index === step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    if (readout) readout.textContent = String(step + 1).padStart(2, "0");
    entries.forEach((entry, index) => {
      entry.hidden = index !== step;
    });
    keys.forEach((key, index) => {
      key.classList.toggle("passed", index < step);
      if (index === step) key.setAttribute("aria-current", "step");
      else key.removeAttribute("aria-current");
    });
    root.dataset.step = String(step);
    dispatch({ step, all: false });
    if (auto.on) schedule();
  }

  /** A step chosen in the step bar: turns Auto off and shows `step`, clamped to the steps. */
  function choose(step: number) {
    auto.on = false;
    showAuto();
    show(Math.min(count - 1, Math.max(0, step)));
  }

  show(0);
  if (bar) bar.hidden = false;
  showAuto();

  const view = new IntersectionObserver((records) => {
    auto.inView = records.at(-1)?.isIntersecting ?? false;
    schedule();
  });
  view.observe(visual);
  document.addEventListener("visibilitychange", schedule);

  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement | null | undefined,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ) => {
    if (!target) return;
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };
  on(bar?.querySelector<HTMLElement>(".bar-prev"), "click", () =>
    choose(wrapStep(current - 1, count)),
  );
  on(bar?.querySelector<HTMLElement>(".bar-next"), "click", () =>
    choose(wrapStep(current + 1, count)),
  );
  keys.forEach((key, index) => on(key, "click", () => choose(index)));
  on(autoKey, "click", () => {
    auto.on = !auto.on;
    showAuto();
  });
  on(bar, "keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = keyTarget(event.key, current, count);
    if (step === undefined) return;
    event.preventDefault();
    choose(step);
    if (keys.includes(event.target as HTMLElement)) keys[step]?.focus();
  });

  return () => {
    clearTimeout(auto.timer);
    view.disconnect();
    resize.disconnect();
    document.removeEventListener("visibilitychange", schedule);
    for (const cleanup of cleanups) cleanup();
  };
}
