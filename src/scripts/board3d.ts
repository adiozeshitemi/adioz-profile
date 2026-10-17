/*
 * The workflow board: a workflow's parts as components on a printed circuit
 * board floating over the page in three-quarter view, rendered with
 * Three.js. The board's stage is laid out from the data, not measured from
 * the page: each node is a component on a plinth in its grid cell (columns
 * CELL_W wide, rows as tall as their tallest kind in KIND_DEPTH), its part's
 * name marked on it; each edge is a raised trace along the wire routeWires
 * plans through the grid's gutters; the cells no node takes carry
 * board-level parts (boardFills). The current step's parts and traces are
 * lit, glowing softly (ILLUMINATION), earlier steps' passed, following the
 * step-through runner's "flowstep" events. The mouse resting on a part opens
 * its step's card beside it (cardStep picks the step).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorkflowPartKind } from "../data/types";
import {
  routeWires,
  stepHops,
  type Box,
  type FlowStepDetail,
  type Point,
} from "./flow";

/* ---------- The board's data ---------- */

/** A part as the board reads it: its id, its name, its grid cell and its component. */
export interface BoardNode {
  id: string;
  label: string;
  col: number;
  row: number;
  kind?: WorkflowPartKind;
}

/** A hop between two parts, by id, with what travels along it. */
export interface BoardEdge {
  from: string;
  to: string;
  label: string;
}

/**
 * The data Board3D.astro embeds in a .board3d: the silkscreen name, the
 * parts, the hops, and each step's lit part ids.
 */
/** A step's caption as the board's hover card shows it, `**` pairs marking strong emphasis in its text and failure mode. */
export interface BoardCard {
  title: string;
  text: string;
  failure?: string;
}

export interface BoardData {
  name: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
  steps: string[][];
  /** Each step's card, in step order. */
  cards: BoardCard[];
  /** The label before a card's failure mode, e.g. "What can go wrong:". */
  failure: string;
}

/** A part's or a trace's state at a step. */
export type PartState = "idle" | "passed" | "lit";

/* ---------- Small helpers ---------- */
const DEG = Math.PI / 180;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A seeded generator of numbers in [0, 1). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** A 32-bit FNV-1a hash of `text`. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/* ---------- The stage: the grid in nominal stage pixels ---------- */

/** A column's width, the gutters between columns and between rows, and the padding round the grid, in stage pixels. */
export const CELL_W = 169;
const COL_GAP = 26;
const ROW_GAP = 22;
const STAGE_PAD = 20;
/** The board's margin round the stage, in stage pixels. */
const MARGIN = 19;
/** Stage pixels per board unit. */
const PX = 20;

/** Each kind's box height, in stage pixels; a row is as tall as its tallest box. */
export const KIND_DEPTH: Record<WorkflowPartKind, number> = {
  qfp: 51,
  bga: 67,
  socket: 67,
  memory: 51,
  gpu: 51,
  trimmer: 51,
  die: 51,
  rj45: 51,
  radio: 51,
  secure: 51,
  toggle: 67,
  cpu: 67,
  gauge: 67,
  beacon: 51,
};

/**
 * The depth, in stage pixels, a kind takes when an empty cell above or below
 * its own leaves room (nodeAreas): the trimmer bank's three rows.
 */
const KIND_REACH: Partial<Record<WorkflowPartKind, number>> = {
  trimmer: 103,
};

/** A node's component kind: its `kind` when the board knows it, else "qfp". */
export const kindOf = (node: { kind?: string }): WorkflowPartKind =>
  node.kind !== undefined && Object.hasOwn(KIND_DEPTH, node.kind)
    ? (node.kind as WorkflowPartKind)
    : "qfp";

/** The stage's grid: its size, each column's left, each row's top and height, and each node's cell box. */
export interface BoardLayout {
  width: number;
  height: number;
  colLeft: number[];
  rowTop: number[];
  rowHeight: number[];
  boxes: Box[];
}

/**
 * The stage of `nodes`: CELL_W columns, rows as tall as the tallest
 * KIND_DEPTH among their nodes, COL_GAP and ROW_GAP gutters and STAGE_PAD
 * round the grid; each node's box fills its cell, as the 2D diagram's grid
 * stretches its boxes.
 */
export function layoutBoard(nodes: BoardNode[]): BoardLayout {
  const cols = Math.max(...nodes.map((node) => node.col)) + 1;
  const rows = Math.max(...nodes.map((node) => node.row)) + 1;
  const rowHeight = Array.from({ length: rows }, (_, row) =>
    Math.max(
      KIND_DEPTH.qfp,
      ...nodes
        .filter((node) => node.row === row)
        .map((node) => KIND_DEPTH[kindOf(node)]),
    ),
  );
  const colLeft = Array.from(
    { length: cols },
    (_, col) => STAGE_PAD + col * (CELL_W + COL_GAP),
  );
  const rowTop: number[] = [];
  let y = STAGE_PAD;
  for (const height of rowHeight) {
    rowTop.push(y);
    y += height + ROW_GAP;
  }
  return {
    width: 2 * STAGE_PAD + cols * CELL_W + (cols - 1) * COL_GAP,
    height: y - ROW_GAP + STAGE_PAD,
    colLeft,
    rowTop,
    rowHeight,
    boxes: nodes.map((node) => ({
      left: colLeft[node.col]!,
      top: rowTop[node.row]!,
      right: colLeft[node.col]! + CELL_W,
      bottom: rowTop[node.row]! + rowHeight[node.row]!,
    })),
  };
}

/** The wire of each edge through the stage's gutters, as routeWires plans it over the nodes' cell boxes. */
export function boardRoutes(
  layout: BoardLayout,
  nodes: BoardNode[],
  edges: { from: string; to: string }[],
): Point[][] {
  if (edges.length === 0) return [];
  const index = new Map(nodes.map((node, at) => [node.id, at]));
  return routeWires(
    nodes.map((node, at) => ({
      col: node.col,
      row: node.row,
      box: layout.boxes[at]!,
    })),
    edges.map((edge) => ({
      from: index.get(edge.from) ?? 0,
      to: index.get(edge.to) ?? 0,
    })),
    STAGE_PAD,
  );
}

/** Stage pixels kept clear between a wire and a grown part or a board-level part. */
const WIRE_CLEAR = 8;

/** Every straight run of `routes`. */
const runsOf = (routes: Point[][]) =>
  routes.flatMap((points) =>
    points.slice(1).map((point, i) => [points[i]!, point] as [Point, Point]),
  );

/** Whether the run from `a` to `b` comes within `clear` of `box`. */
const nears = (a: Point, b: Point, box: Box, clear: number) =>
  Math.max(a[0], b[0]) > box.left - clear &&
  Math.min(a[0], b[0]) < box.right + clear &&
  Math.max(a[1], b[1]) > box.top - clear &&
  Math.min(a[1], b[1]) < box.bottom + clear;

/**
 * Each node's area on the stage: its cell box, or, for a kind whose
 * KIND_REACH is deeper than its row, the box grown into the near half of the
 * empty cell below it (else above it), by up to the reach's excess and at
 * most the gutter and half that cell, when no wire comes within WIRE_CLEAR
 * of the strip it grows over. An empty cell takes one node's growth.
 */
export function nodeAreas(
  layout: BoardLayout,
  nodes: BoardNode[],
  routes: Point[][],
): Box[] {
  const taken = new Set(nodes.map((node) => `${node.col},${node.row}`));
  const claimed = new Set<string>();
  const runs = runsOf(routes);
  return nodes.map((node, index) => {
    const box = layout.boxes[index]!;
    const reach = KIND_REACH[kindOf(node)];
    const height = layout.rowHeight[node.row]!;
    if (reach === undefined || reach <= height) return { ...box };
    for (const step of [1, -1]) {
      const row = node.row + step;
      const cell = `${node.col},${row}`;
      const below = layout.rowHeight[row];
      if (below === undefined || taken.has(cell) || claimed.has(cell)) continue;
      const grow = Math.min(reach - height, ROW_GAP + below / 2);
      const strip =
        step > 0
          ? { ...box, top: box.bottom, bottom: box.bottom + grow }
          : { ...box, top: box.top - grow, bottom: box.top };
      if (runs.some(([a, b]) => nears(a, b, strip, WIRE_CLEAR))) continue;
      claimed.add(cell);
      return step > 0
        ? { ...box, bottom: strip.bottom }
        : { ...box, top: strip.top };
    }
    return { ...box };
  });
}

/** A board-level part's kind: the regulator under a heatsink, the clock and its battery, or the bulk capacitors. */
export type FillKind = "vrm" | "rtc" | "bulk";

/** A board-level part in the cells no node takes: its kind, its reference designator and its rectangle in stage pixels. */
export interface BoardFill {
  kind: FillKind;
  ref: string;
  rect: Box;
}

/** A board-level part's inset from its cells' sides, its reach into a free gutter and its gap to a grown part, in stage pixels. */
const FILL_INSET = 8;
const FILL_BLEED = 9;
const FILL_GAP = 11;
/** The smallest board-level part, in stage pixels. */
const FILL_MIN = { width: 120, height: 34 };

/**
 * `rect` shrunk until no run of `runs` comes within `clear` of it: each run
 * that does moves one side of `rect` past it, the side that keeps the most
 * area. Null when less than FILL_MIN is left.
 */
export function clearOf(rect: Box, runs: [Point, Point][], clear: number) {
  let box = { ...rect };
  const area = (b: Box) =>
    Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  for (const [a, b] of runs) {
    if (!nears(a, b, box, clear)) continue;
    const options: Box[] = [
      { ...box, top: Math.max(a[1], b[1]) + clear },
      { ...box, bottom: Math.min(a[1], b[1]) - clear },
      { ...box, left: Math.max(a[0], b[0]) + clear },
      { ...box, right: Math.min(a[0], b[0]) - clear },
    ];
    box = options.reduce((best, option) =>
      area(option) > area(best) ? option : best,
    );
  }
  return box.right - box.left >= FILL_MIN.width &&
    box.bottom - box.top >= FILL_MIN.height
    ? box
    : null;
}

/**
 * The board-level parts in the cells no node takes, in reading order: a run
 * of neighbouring empty cells in a row (not split by a wire in the gutter
 * between them) takes the bulk capacitors; the rest of a cell a grown node
 * reaches into takes the clock; other single cells take the regulator and
 * the clock in turn. Each sits FILL_INSET inside its cells' sides, reaches
 * FILL_BLEED into a gutter with a node or the stage's edge beyond it
 * (FILL_GAP clear of a grown node), and keeps WIRE_CLEAR from every wire.
 * Reference designators count up per kind: VR1, BT1, C40.
 */
export function boardFills(
  layout: BoardLayout,
  nodes: BoardNode[],
  areas: Box[],
  routes: Point[][],
): BoardFill[] {
  const runs = runsOf(routes);
  const node = new Set(nodes.map((entry) => `${entry.col},${entry.row}`));
  /** The stage y each grown node reaches into an empty cell, from above (top) or below (bottom). */
  const reached = new Map<string, { top?: number; bottom?: number }>();
  nodes.forEach((entry, index) => {
    const area = areas[index]!;
    const box = layout.boxes[index]!;
    if (area.bottom > box.bottom) {
      reached.set(`${entry.col},${entry.row + 1}`, { top: area.bottom });
    }
    if (area.top < box.top) {
      reached.set(`${entry.col},${entry.row - 1}`, { bottom: area.top });
    }
  });
  const cols = layout.colLeft.length;
  const rows = layout.rowTop.length;
  const empty = (col: number, row: number) =>
    col >= 0 &&
    col < cols &&
    row >= 0 &&
    row < rows &&
    !node.has(`${col},${row}`);
  /** Whether a wire runs down the gutter between columns `col` and `col + 1` in `row`. */
  const split = (col: number, row: number) => {
    const gutter = {
      left: layout.colLeft[col]! + CELL_W,
      right: layout.colLeft[col + 1]!,
      top: layout.rowTop[row]!,
      bottom: layout.rowTop[row]! + layout.rowHeight[row]!,
    };
    return runs.some(([a, b]) => nears(a, b, gutter, 0));
  };

  const fills: BoardFill[] = [];
  const count: Record<FillKind, number> = { vrm: 0, rtc: 0, bulk: 0 };
  let singles = 0;
  const add = (kind: FillKind, rect: Box) => {
    const clear = clearOf(rect, runs, WIRE_CLEAR);
    if (!clear) return;
    count[kind]++;
    const ref =
      kind === "vrm"
        ? `VR${count.vrm}`
        : kind === "rtc"
          ? `BT${count.rtc}`
          : `C${39 + count.bulk}`;
    fills.push({ kind, ref, rect: clear });
  };
  for (let row = 0; row < rows; row++) {
    const top = layout.rowTop[row]!;
    const bottom = top + layout.rowHeight[row]!;
    for (let col = 0; col < cols; col++) {
      if (!empty(col, row)) continue;
      const reach = reached.get(`${col},${row}`);
      if (reach) {
        add("rtc", {
          left: layout.colLeft[col]! + FILL_INSET,
          right: layout.colLeft[col]! + CELL_W - FILL_INSET,
          top:
            reach.top !== undefined
              ? reach.top + FILL_GAP
              : top - (empty(col, row - 1) ? 0 : FILL_BLEED),
          bottom:
            reach.bottom !== undefined
              ? reach.bottom - FILL_GAP
              : bottom + (empty(col, row + 1) ? 0 : FILL_BLEED),
        });
        continue;
      }
      let last = col;
      while (
        empty(last + 1, row) &&
        !reached.has(`${last + 1},${row}`) &&
        !split(last, row)
      ) {
        last++;
      }
      const span = Array.from({ length: last - col + 1 }, (_, i) => col + i);
      const kind: FillKind =
        last > col ? "bulk" : singles++ % 2 === 0 ? "vrm" : "rtc";
      add(kind, {
        left: layout.colLeft[col]! + FILL_INSET,
        right: layout.colLeft[last]! + CELL_W - FILL_INSET,
        top: top - (span.some((at) => empty(at, row - 1)) ? 0 : FILL_BLEED),
        bottom:
          bottom + (span.some((at) => empty(at, row + 1)) ? 0 : FILL_BLEED),
      });
      col = last;
    }
  }
  return fills;
}

/* ---------- The view ---------- */

/**
 * The view: a three-quarter view from the front right, turned `yaw` and
 * raised `elevation`, so the components' heights and shadows read.
 */
const VIEW = { yaw: 4 * DEG, elevation: 50 * DEG };
/**
 * The share of the canvas's half-width (x) and half-height (y) the board and
 * its parts fill when framed, so the canvas's edges never cut the board.
 */
const FIT = { x: 0.965, y: 0.93 };

/**
 * The canvas's width over its height for `layout`: the board's outline as
 * VIEW foreshortens it, within FIT, from 0.75 to 2.4.
 */
export function boardAspect(layout: BoardLayout): number {
  const wide = (layout.width + 2 * MARGIN) / FIT.x;
  const deep =
    ((layout.height + 2 * MARGIN) * Math.sin(VIEW.elevation)) / FIT.y;
  return clamp(wide / deep, 0.75, 2.4);
}

/* ---------- Steps ---------- */

/**
 * Each node's and each edge's state at `step` (from 0): lit by the step,
 * passed when an earlier step lit it, else idle; a hop is lit as stepHops
 * lights it. With `all`, every node and edge is lit.
 */
export function statesAt(
  data: Pick<BoardData, "nodes" | "edges" | "steps">,
  step: number,
  all = false,
): { nodes: PartState[]; wires: PartState[] } {
  if (all || data.steps.length === 0) {
    return {
      nodes: data.nodes.map(() => "lit"),
      wires: data.edges.map(() => "lit"),
    };
  }
  const at = clamp(Math.round(step) || 0, 0, data.steps.length - 1);
  const hops = stepHops(
    data.steps.map((lights) => ({ lights })),
    data.edges,
  );
  const lights = new Set(data.steps[at]);
  const earlier = new Set(data.steps.slice(0, at).flat());
  const lit = new Set(hops[at]);
  const earlierHops = new Set(hops.slice(0, at).flat());
  return {
    nodes: data.nodes.map((node) =>
      lights.has(node.id) ? "lit" : earlier.has(node.id) ? "passed" : "idle",
    ),
    wires: data.edges.map((_, index) =>
      lit.has(index) ? "lit" : earlierHops.has(index) ? "passed" : "idle",
    ),
  };
}

/**
 * The step whose card a part shows while the mouse rests on it: the current
 * `step` when it lights the part (and `all` does not light every step), else
 * the first step that lights it; -1 for a part no step lights.
 */
export function cardStep(
  steps: string[][],
  id: string,
  step: number,
  all: boolean,
): number {
  if (!all && steps[step]?.includes(id)) return step;
  return steps.findIndex((lights) => lights.includes(id));
}

/* ---------- Markings ---------- */

/** Reference-designator prefixes printed beside each kind of component. */
export const REF_PREFIX: Record<WorkflowPartKind, string> = {
  qfp: "U",
  bga: "U",
  socket: "U",
  memory: "DIMM",
  gpu: "PCIE",
  trimmer: "RV",
  die: "U",
  rj45: "J",
  radio: "RF",
  secure: "SE",
  toggle: "SW",
  cpu: "CPU",
  gauge: "M",
  beacon: "D",
};

/** Words left out of a part number's letters. */
const STOP_WORDS = new Set(["and", "of", "the", "for", "to", "in", "on"]);

/**
 * The part number marked under a node's name, from its id and label alone:
 * a maker prefix ("SE" on a secure element, else "AZ"), the initials of the
 * label's first two words (or its first two letters), a series number and a
 * year-and-week date code, e.g. "AZ-FE47 · 2531".
 */
export function partNumber(node: {
  id: string;
  label: string;
  kind?: WorkflowPartKind;
}): string {
  const words = node.label
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()));
  const letters = (
    words.length > 1
      ? words[0]![0]! + words[1]![0]!
      : (words[0] ?? node.id).slice(0, 2)
  ).toUpperCase();
  const value = hash(node.id);
  const series = 10 + (value % 90);
  const year = 24 + ((value >>> 8) % 3);
  const week = String(1 + ((value >>> 12) % 52)).padStart(2, "0");
  const maker = kindOf(node) === "secure" ? "SE" : "AZ";
  return `${maker}-${letters}${series} · ${year}${week}`;
}

/** Every way to set `text` on one line or two, broken after a space or a hyphen. */
export function nameSplits(text: string): string[][] {
  const splits = [[text]];
  for (let i = 1; i < text.length; i++) {
    if (text[i] === " ") splits.push([text.slice(0, i), text.slice(i + 1)]);
    else if (text[i - 1] === "-")
      splits.push([text.slice(0, i), text.slice(i)]);
  }
  return splits;
}

/**
 * A marking's base size, in units per em: fitMarking decides a name's lines
 * and its part number's place at this size, before the block grows to its
 * room.
 */
export const MARK_EM = 0.32;
/** The largest size, in units per em, fitMarking grows a block to where its room holds it. */
export const MARK_MAX = 0.45;
/**
 * The smallest share of MARK_EM a name on one line keeps before fitMarking
 * breaks it onto two; a name that holds it stays on one line however large
 * it then grows.
 */
export const MARK_HOLD = 0.85;
/** A marking's line pitch, in ems. */
const MARK_PITCH = 1.3;
/** The part-number line's size, in the name's ems. */
export const CODE_SCALE = 0.86;
/** The clearance under a block's last baseline, in ems. */
const MARK_FOOT = 0.04;
/** The distance from a name's last baseline to the part number's under it, in ems. */
const CODE_GAP = (MARK_PITCH * (1 + CODE_SCALE)) / 2;
/** The least gap between the name and a part number turned along the block's right edge, in ems. */
export const CODE_SIDE_GAP = 0.7;
/** Sizes closer than this, in units per em, tie when fitMarking picks a break. */
const MARK_TIE = 1e-9;

/** How fitMarking sets a marking in its room. */
export interface MarkFit {
  /** The name's lines, top to bottom; none when the room has no area. */
  lines: string[];
  /** The part number, cut back a word at a time to fit, or "" when it is left off. */
  code: string;
  /**
   * Whether `code` is turned to read upward along the block's right edge
   * instead of sitting under the name. A turned block spans the room's
   * whole width, so the part number runs along the room's right edge.
   */
  side: boolean;
  /** The name's size, in units per em. */
  em: number;
  /** The part number's size, in the name's ems: CODE_SCALE, or less where a turned part number would overrun the room's height. */
  codeScale: number;
  /** The block's width and height, in ems; times `em`, never more than the room's. */
  width: number;
  height: number;
}

/** The marking layout a fit may take: a turned part number, and the largest size. */
export interface MarkLayout {
  /** Turns the part number along the room's right edge wherever it fits there. */
  side?: boolean;
  /** The largest size the block grows to, in units per em; MARK_MAX unless set. */
  max?: number;
}

/**
 * Sets `name`, and its part number `code` when it fits, in a room `width` ×
 * `height` units, measured by `measure` (a text's width in ems) and `cap`
 * (the font's cap height in ems), in two passes.
 *
 * At the base size (MARK_EM, or `max` when smaller) it decides the lines and
 * the part number's place: the name takes one line when it holds MARK_HOLD
 * of the base size there; else it breaks onto the two lines of nameSplits
 * that set it largest, the most even pair among equals, and shrinks further
 * only when neither fits. The part number never shrinks the name: at
 * CODE_SCALE of its size it sits under the name, or with `side` (or when
 * only that fits) turned along the room's right edge, cut back a word at a
 * time, and is left off when neither fits.
 *
 * Then the block grows, its lines and part number unchanged, until it fills
 * the room's width or height or reaches `max`. A turned part number grows
 * with the name only as far as the room's height holds it.
 */
export function fitMarking(
  name: string,
  code: string,
  width: number,
  height: number,
  measure: (text: string) => number,
  cap: number,
  { side = false, max = MARK_MAX }: MarkLayout = {},
): MarkFit {
  const widest = (lines: string[]) =>
    Math.max(...lines.map((line) => measure(line)));
  const nameHeight = (count: number) =>
    cap + (count - 1) * MARK_PITCH + MARK_FOOT;
  const base = Math.min(MARK_EM, max);
  const sizeOf = (lines: string[]) =>
    Math.max(
      0,
      Math.min(base, width / widest(lines), height / nameHeight(lines.length)),
    );
  let lines = [name];
  let em = sizeOf(lines);
  if (em < base * MARK_HOLD) {
    let best: string[] | null = null;
    let size = 0;
    for (const split of nameSplits(name)) {
      if (split.length !== 2) continue;
      const option = sizeOf(split);
      const tie = Math.abs(option - size) <= MARK_TIE;
      if (
        option > size + MARK_TIE ||
        (tie && best && widest(split) < widest(best))
      ) {
        [best, size] = [split, option];
      }
    }
    if (best && size > em + MARK_TIE) [lines, em] = [best, size];
  }
  if (!(em > 0)) {
    return {
      lines: [],
      code: "",
      side: false,
      em: 0,
      codeScale: CODE_SCALE,
      width: 0,
      height: 0,
    };
  }
  const nameW = widest(lines);
  const nameH = nameHeight(lines.length);
  /** `code` cut back a word at a time until it is at most `room` ems long at CODE_SCALE. */
  const cut = (room: number) => {
    const words = code.split(" ").filter(Boolean);
    while (words.length && measure(words.join(" ")) * CODE_SCALE > room) {
      words.pop();
      if (words[words.length - 1] === "·") words.pop();
    }
    return words.join(" ");
  };
  const belowH = nameH + CODE_GAP;
  const below = belowH * em <= height ? cut(width / em) : "";
  const column = CODE_SIDE_GAP + cap * CODE_SCALE;
  const turned =
    (nameW + column) * em <= width ? cut(height / em - MARK_FOOT) : "";
  if (turned && (side || !below)) {
    const grown = Math.max(
      em,
      Math.min(max, width / (nameW + column), height / nameH),
    );
    const length = measure(turned);
    const codeScale = Math.min(
      CODE_SCALE,
      (height / grown - MARK_FOOT) / length,
    );
    return {
      lines,
      code: turned,
      side: true,
      em: grown,
      codeScale,
      width: width / grown,
      height: Math.max(nameH, length * codeScale + MARK_FOOT),
    };
  }
  const blockW = Math.max(nameW, below ? measure(below) * CODE_SCALE : 0);
  const blockH = below ? belowH : nameH;
  return {
    lines,
    code: below,
    side: false,
    em: Math.max(em, Math.min(max, width / blockW, height / blockH)),
    codeScale: CODE_SCALE,
    width: blockW,
    height: blockH,
  };
}

/** The two captions of a gauge's meters: the first word of its label, and the latency scale. */
export function meterCaptions(label: string): [string, string] {
  const first = label.split(/[^A-Za-z0-9]+/).find(Boolean) ?? "LEVEL";
  return [first.toUpperCase().slice(0, 10), "P99 MS"];
}

/**
 * The silkscreen along the board's front edge: `name` in capitals, and its
 * revision, part and hop counts and build.
 */
export function silkscreen(data: Pick<BoardData, "name" | "nodes" | "edges">) {
  const revision = String(1 + (hash(data.name) % 9)).padStart(2, "0");
  return {
    title: data.name.toUpperCase(),
    meta: `REV ${revision} · ${data.nodes.length} PARTS · ${data.edges.length} HOPS · ENIG · 6L`,
  };
}

/* ---------- Trace geometry ---------- */

/**
 * `points` with each corner rounded by up to `radius` stage pixels, as
 * wirePath draws it: each quarter curve sampled at 8 points, and each
 * curve's midpoint (where its via sits) in `corners`.
 */
export function roundedPolyline(
  points: Point[],
  radius = 8,
): { points: Point[]; corners: Point[] } {
  const out: Point[] = [];
  const corners: Point[] = [];
  const first = points[0];
  if (!first) return { points: out, corners };
  out.push([first[0], first[1]]);
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1];
    if (!next) {
      out.push([point[0], point[1]]);
      continue;
    }
    const inLength = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
    const outLength = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const toward = (to: Point, length: number): Point => [
      point[0] + ((to[0] - point[0]) / (length || 1)) * r,
      point[1] + ((to[1] - point[1]) / (length || 1)) * r,
    ];
    const a = toward(prev, inLength);
    const b = toward(next, outLength);
    out.push(a);
    for (let k = 1; k <= 8; k++) {
      const s = k / 8;
      out.push([
        (1 - s) ** 2 * a[0] + 2 * (1 - s) * s * point[0] + s * s * b[0],
        (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * point[1] + s * s * b[1],
      ]);
    }
    corners.push([
      0.25 * a[0] + 0.5 * point[0] + 0.25 * b[0],
      0.25 * a[1] + 0.5 * point[1] + 0.25 * b[1],
    ]);
  }
  return {
    points: out.filter(
      (point, index) =>
        index === 0 ||
        Math.hypot(
          point[0] - out[index - 1]![0],
          point[1] - out[index - 1]![1],
        ) > 0.01,
    ),
    corners,
  };
}

/**
 * Moves the start (or end) of `points` along its first (or last) run's axis
 * onto the near side of `rect`, so the trace meets the plinth there.
 */
export function attachEnd(points: Point[], atStart: boolean, rect: Box) {
  const end = atStart ? 0 : points.length - 1;
  const inner = atStart ? 1 : points.length - 2;
  const tip = points[end];
  const near = points[inner];
  if (!tip || !near) return;
  const [ex, ey] = tip;
  const dx = Math.sign(Math.round(ex - near[0]));
  const dy = Math.sign(Math.round(ey - near[1]));
  if (dx > 0) points[end] = [rect.left, ey];
  else if (dx < 0) points[end] = [rect.right, ey];
  else if (dy > 0) points[end] = [ex, rect.top];
  else if (dy < 0) points[end] = [ex, rect.bottom];
}

/* ---------- The scene ---------- */

/** The board's thickness, its corner radius and the standoffs' height, in units. */
const BOARD_T = 0.3;
const BOARD_CORNER = 0.8;
const STANDOFF = 0.55;
/** Mounting holes HOLE_R wide in a gold ring HOLE_RING wide, in units. */
const HOLE_R = 0.2;
const HOLE_RING = 0.4;
/** A trace's width and height, in units. */
const TRACE_W = 0.22;
const TRACE_H = 0.035;
/** A plinth (the guard ring a component sits in) reaches PLINTH_PAD past its footprint, RIM wide. */
const PLINTH_PAD = 0.1;
const RIM = 0.08;
/** A component covers FILL_W of its area's width and FILL_D of its depth. */
const FILL_W = 0.96;
const FILL_D = 0.96;
/** Canvas pixels per stage pixel on the board's textures. */
const TEX = 2;
/** How long the board waits for its fonts before painting its markings, in ms. */
const FONT_WAIT = 3000;
/**
 * Scales every glow and light the steps add: the trace glow and its beads,
 * the lit parts' lights, gold, under-glow and inner glow, their markings'
 * glow, the status LEDs and their halos, and each part's own lamps. 1 is the
 * tuned level, lower is dimmer; the beacon and the LIVE LED keep their red.
 */
const ILLUMINATION = 0.5;

/** A component part: its object, and update(dt, t, lit, energy, passed), which animates it. */
interface Part {
  object: THREE.Group;
  update(
    dt: number,
    t: number,
    lit: number,
    energy: number,
    passed: number,
  ): void;
}

/** A node placed on the stage: its area, its component's footprint w × d in units centred at (cx, cy), and its plinth. */
interface Placed {
  id: string;
  label: string;
  kind: WorkflowPartKind;
  index: number;
  area: Box;
  w: number;
  d: number;
  cx: number;
  cy: number;
  plinth: Box;
}

type Spot = [x: number, z: number, turn?: number];
/** A finish of a marking's ink: its colour, metalness, roughness and glow. */
interface InkFinish {
  color: THREE.Color;
  metalness: number;
  roughness: number;
  emissive: number;
}
/**
 * A marking's ink: `light` on a dark surface (epoxy, silicon), where the
 * lit letters glow; `dark` on bare metal, where a laser etch darkens it.
 */
type Ink = "light" | "dark";

/** A finish of a part's package: its colour and its roughness. */
interface Finish {
  color: THREE.Color;
  roughness: number;
}
/**
 * A part's package finishes: `metal` its brushed lid, shield, can, plate,
 * heat spreader or heatsink; `facing` the same metal on a face turned to
 * the viewer; `lead` its leads, balls, pins, contacts and castellations;
 * `epoxy` its black moulded package; `silicon` a bare die.
 */
type FinishKind = "metal" | "facing" | "lead" | "epoxy" | "silicon";

interface MarkingOptions {
  /**
   * The room the text block may take on its surface, in units: it reaches
   * `width` from the anchor toward the block's other edge (both ways, half
   * each, when centred), and `height` likewise.
   */
  width: number;
  height: number;
  /** The finish of the surface the marking lies on, which picks its Ink (INK_ON). */
  on: FinishKind;
  /** A legend in place of the name, with no part number. */
  text?: string;
  /** False leaves the part number off; "side" turns it along the room's right edge where it fits there. */
  code?: boolean | "side";
  /** The largest size the block grows to, in units per em (fitMarking's `max`). */
  max?: number;
  /** The share of the room's reflection the ink takes. */
  reflection?: number;
  /** The share of the ink's metalness it keeps. */
  metal?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
}

interface Marking {
  node: string;
  anchor: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  options: MarkingOptions;
  ink: Record<PartState, InkFinish>;
  metal: number;
  name: boolean;
}

/** A node's package material, the finishes it eases between with the node's state, and its glow while lit. */
interface NodeFinish {
  material: THREE.MeshPhysicalMaterial;
  finish: Record<PartState, Finish>;
  glow: number;
}

interface ShadingUniforms {
  [uniform: string]: THREE.IUniform;
  uExposure: { value: number };
  uDesaturate: { value: number };
  uRim: { value: number };
  uRimColour: { value: THREE.Color };
}

interface Shade {
  exposure: number;
  desaturate: number;
  rim: number;
}

/**
 * How a node's part reads in each state, applied after lighting and before
 * tone mapping: `exposure` scales its colour, `desaturate` pulls it toward
 * its luminance and `rim` adds RIM_COLOUR along its silhouette. Parts not
 * yet reached sit back, dimmer and greyer; passed parts read nearly in
 * full; the current step's parts read slightly over, outlined in gold.
 */
const SHADE: Record<PartState, Shade> = {
  idle: { exposure: 0.5, desaturate: 0.6, rim: 0 },
  passed: { exposure: 0.92, desaturate: 0.06, rim: 0 },
  lit: { exposure: 1.0, desaturate: 0, rim: 0.25 * ILLUMINATION },
};
/** The board-level parts' fixed shading, a step behind every node's part. */
const FILL_SHADE: Shade = { exposure: 0.72, desaturate: 0.35, rim: 0 };
/** The lit parts' rim light, in linear RGB before tone mapping. */
const RIM_COLOUR: [number, number, number] = [1.6, 0.92, 0.3];

/** Waits for the self-hosted Montserrat and JetBrains Mono, at most FONT_WAIT ms. */
function fontsReady(): Promise<unknown> {
  const fonts = document.fonts;
  const loads = fonts
    ? Promise.all([
        fonts.load('600 64px "JetBrains Mono"'),
        fonts.load('700 64px "JetBrains Mono"'),
        fonts.load('600 64px "Montserrat"'),
      ]).catch(() => undefined)
    : Promise.resolve();
  return Promise.race([loads, sleep(FONT_WAIT)]);
}

/** A rounded rectangle from (x0, y0) to (x1, y1) traced on `path`, in shape coordinates. */
function traceRounded<T extends THREE.Path>(
  path: T,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): T {
  path.moveTo(x0 + radius, y0);
  path.lineTo(x1 - radius, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + radius);
  path.lineTo(x1, y1 - radius);
  path.quadraticCurveTo(x1, y1, x1 - radius, y1);
  path.lineTo(x0 + radius, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - radius);
  path.lineTo(x0, y0 + radius);
  path.quadraticCurveTo(x0, y0, x0 + radius, y0);
  return path;
}
/** A rounded rectangle Shape from (x0, y0) to (x1, y1). */
const roundedRect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
) => traceRounded(new THREE.Shape(), x0, y0, x1, y1, radius);
/** A rounded rectangle Path from (x0, y0) to (x1, y1), for a Shape's holes. */
const roundedHole = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
) => traceRounded(new THREE.Path(), x0, y0, x1, y1, radius);

/** Traces a rounded rectangle on a 2D canvas context. */
function canvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A canvas `width` × `height` and its 2D context. */
function surface2d(width: number, height: number) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  return { surface, ctx: surface.getContext("2d")! };
}

/* ---------- Marking plans ---------- */

/** A part's footprint w × d in units from its area on the stage: FILL_W of the area's width and FILL_D of its depth. */
export const footprintOf = (area: Box) => ({
  w: ((area.right - area.left) * FILL_W) / PX,
  d: ((area.bottom - area.top) * FILL_D) / PX,
});

/**
 * A marking's place on a face of its part: the face, the rooms its block
 * may take there (its builder sets it in the one that fits it best), and
 * the features standing on the face, each as its bounding box. Lengths are
 * in units from the footprint's centre, x across the face and y down the
 * text: +z on a top face.
 */
export interface MarkPlan {
  face: Box;
  rooms: Box[];
  clear: Box[];
}

/** A box `w` × `h` centred on (x, y). */
const around = (x: number, y: number, w: number, h = w): Box => ({
  left: x - w / 2,
  right: x + w / 2,
  top: y - h / 2,
  bottom: y + h / 2,
});
/** `box` shrunk by `x` at either side, `top` at its top and `bottom` at its bottom. */
const inside = (box: Box, x: number, top: number, bottom = top): Box => ({
  left: box.left + x,
  right: box.right - x,
  top: box.top + top,
  bottom: box.bottom - bottom,
});

/** A gull-wing lead's reach past its package's body. */
const QFP_REACH = 0.26;
/** The test socket's lever housing's width along its right end. */
const SOCKET_LEVER = 1.12;
/** The processor's heat spreader's chamfer round its top face. */
const CPU_CHAMFER = 0.035;
/** A moulded package's pin-1 dimple: its centre's inset from the body's front-left corner, and its radius. */
const PIN_DIMPLE = { inset: 0.2, r: 0.07 };
/** The pin-1 dimple's box on a package's top `face`. */
const dimpleOn = (face: Box) =>
  around(
    face.left + PIN_DIMPLE.inset,
    face.bottom - PIN_DIMPLE.inset,
    2 * PIN_DIMPLE.r,
  );
/** A DIMM's height above its slot. */
const DIMM = { h: 2.2 };
/** A DIMM's DRAM packages: their size across and up the module, the pitch between them, and the height of their centres. */
const DRAM = { w: 0.58, h: 0.8, pitch: 0.66, y: 0.62 };
/** The graphics card's backplate flange: its depth from the card's back. */
const GPU_FLANGE = 0.62;
/** A trimmer bank's 2 × 8 pin header: its body's width and depth, and its centre's inset from the part's right edge. */
const HEADER = { w: 1.8, d: 0.44, inset: 1.15 };
/** A trimmer bank's tag: its largest depth, its gap to the pin header, and its rivets' inset from its ends. */
const TAG = { maxD: 1.3, gap: 0.2, rivet: 0.2 };
/** A trimmer bank's rows: their pitch, and the first row's centre's inset from the part's back edge. */
const TRIM_ROW = { pitch: 1.02, back: 0.5 };
/** How many rows of trimmers a bank `d` deep holds in front of its tag: one to three. */
const trimmerRows = (d: number) =>
  clamp(Math.floor((d - 1.45) / TRIM_ROW.pitch), 1, 3);
/** The bare die: its width and its centre's offset to the right. */
const DIE = { w: 5.1, x: 0.6 };
/**
 * The RJ45 jack's ports and their pitch; the embossed ribs along its
 * shield's back (their inset from that edge, width and depth); the dimples
 * along its front (their inset from that edge, offset either side of a
 * port's centre and radius).
 */
const RJ45 = {
  ports: 4,
  pitch: 1.84,
  rib: { inset: 0.22, w: 1.1, d: 0.08 },
  dimple: { inset: 0.42, x: 0.5, r: 0.07 },
};
/** The radio module's antenna end's width, and its shield can's embossed rim: the rim's outer and inner insets from the can's edge. */
const RADIO = { antenna: 1.05, rim: { outer: 0.08, inner: 0.2 } };
/** The secure element's package width, and its padlock emblem's size. */
const SECURE = { w: 4.9, lock: 0.8 };
/** The toggle panel: the toggle's centre, its lamps' distance either side of it, the fader scale's ticks' depth. */
const TOGGLE = { x: 1.45, z: 0.05, lamp: 1.55, tickD: 0.1 };
/** A lamp bezel's outer radius. */
const BEZEL_R = 0.31;
/** The panel meters' face's slope toward the viewer. */
const GAUGE_SLOPE = 20 * DEG;

/** A padlock emblem's geometry, lying flat: its body with a keyhole and its shackle, `size` tall, `thick` deep. */
function lockGeometry(size = 0.9, thick = 0.03) {
  const k = size / 0.9;
  const body = roundedRect(-0.34 * k, -0.45 * k, 0.34 * k, 0.08 * k, 0.07 * k);
  const keyhole = new THREE.Path();
  const lean = Math.atan2(0.06, 0.025);
  keyhole.moveTo(-0.025 * k, -0.33 * k);
  keyhole.lineTo(0.025 * k, -0.33 * k);
  keyhole.lineTo(0.025 * k, -0.19 * k);
  keyhole.absarc(0, -0.13 * k, 0.065 * k, -lean, Math.PI + lean, false);
  keyhole.closePath();
  body.holes.push(keyhole);
  const shackle = new THREE.Shape();
  shackle.moveTo(-0.24 * k, 0.08 * k);
  shackle.lineTo(-0.24 * k, 0.2 * k);
  shackle.absarc(0, 0.2 * k, 0.24 * k, Math.PI, 0, true);
  shackle.lineTo(0.24 * k, 0.08 * k);
  shackle.lineTo(0.15 * k, 0.08 * k);
  shackle.lineTo(0.15 * k, 0.2 * k);
  shackle.absarc(0, 0.2 * k, 0.15 * k, 0, Math.PI, false);
  shackle.lineTo(-0.15 * k, 0.08 * k);
  shackle.closePath();
  const options = {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
    curveSegments: 16,
  };
  const geometry = mergeGeometries([
    new THREE.ExtrudeGeometry(body, options),
    new THREE.ExtrudeGeometry(shackle, options),
  ]);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  return geometry;
}
/** lockExtent's footprints by padlock size. */
const LOCK_EXTENTS = new Map<number, Box>();
/** The footprint of lockGeometry(`size`) on its face, about its origin. */
function lockExtent(size: number): Box {
  let extent = LOCK_EXTENTS.get(size);
  if (!extent) {
    const geometry = lockGeometry(size);
    const { min, max } = geometry.boundingBox!;
    extent = { left: min.x, right: max.x, top: min.z, bottom: max.z };
    geometry.dispose();
    LOCK_EXTENTS.set(size, extent);
  }
  return extent;
}

/** Where qfp's name lies: on its body's top, behind the pin-1 dimple. */
function qfpPlans(w: number, d: number): MarkPlan[] {
  const bw = 4.9;
  const bd = d - 2 * QFP_REACH - 0.1;
  const face = around(-w / 2 + 0.1 + QFP_REACH + bw / 2, 0, bw, bd);
  return [
    { face, rooms: [inside(face, 0.24, 0.2, 0.3)], clear: [dimpleOn(face)] },
  ];
}

/** Where bga's name lies: on its cap's top, behind the pin-1 dimple. */
function bgaPlans(w: number, d: number): MarkPlan[] {
  const sw = 5.7;
  const face = around(-w / 2 + 0.08 + sw / 2, 0, sw - 0.66, d - 0.12 - 0.66);
  return [
    { face, rooms: [inside(face, 0.24, 0.2, 0.3)], clear: [dimpleOn(face)] },
  ];
}

/** Where socket's name lies: on its chip's top, behind the pin-1 dimple. */
function socketPlans(w: number, d: number): MarkPlan[] {
  const sw = w - SOCKET_LEVER - 0.06;
  const sd = d - 0.06;
  const face = around(
    -w / 2 + 0.03 + sw / 2,
    0,
    4.5,
    Math.min(1.95, sd - 2 * QFP_REACH - 0.6),
  );
  return [
    { face, rooms: [inside(face, 0.22, 0.2, 0.3)], clear: [dimpleOn(face)] },
  ];
}

/** Where memory's name lies: centred on the front module's spreader band, in the module's frame (y down from its top edge's height). */
function memoryPlans(w: number): MarkPlan[] {
  const bandW = w - 0.52 - 0.2;
  const bandFrom = DRAM.y + DRAM.h / 2 + 0.1;
  const face = {
    left: -bandW / 2,
    right: bandW / 2,
    top: -DIMM.h,
    bottom: -bandFrom,
  };
  return [{ face, rooms: [inside(face, 0.4, 0.15)], clear: [] }];
}

/** Where gpu's name lies: along its backplate's flange, left of the power connector. */
function gpuPlans(w: number, d: number): MarkPlan[] {
  const back = -(d - 0.1) / 2;
  const face = {
    left: -(w - 0.06) / 2,
    right: (w - 0.06) / 2,
    top: back,
    bottom: back + GPU_FLANGE,
  };
  const plug = around(w / 2 - 0.95, back + GPU_FLANGE / 2, 0.92, 0.4);
  const left = -w / 2 + 0.36;
  return [
    {
      face,
      rooms: [
        {
          left,
          right: left + w - 2.6,
          top: back + 0.07,
          bottom: back + GPU_FLANGE - 0.07,
        },
      ],
      clear: [plug],
    },
  ];
}

/** Where trimmer's name lies: centred on its tag, between the tag's rivets. */
function trimmerPlans(w: number, d: number): MarkPlan[] {
  const bankFront =
    -d / 2 + TRIM_ROW.back + (trimmerRows(d) - 1) * TRIM_ROW.pitch + 0.25;
  const left = -w / 2 + 0.3;
  const right = w / 2 - HEADER.inset - HEADER.w / 2 - TAG.gap;
  const front = d / 2 - 0.16;
  const depth = Math.min(TAG.maxD, front - bankFront - 0.14);
  const face = { left, right, top: front - depth, bottom: front };
  const x = (left + right) / 2;
  const z = front - depth / 2;
  const reach = (right - left) / 2 - TAG.rivet;
  return [
    {
      face,
      rooms: [around(x, z, right - left - 4 * TAG.rivet, depth - 0.28)],
      clear: [around(x - reach, z, 0.14), around(x + reach, z, 0.14)],
    },
  ];
}

/** Where die's name lies: on the die's top. */
function diePlans(d: number): MarkPlan[] {
  const face = around(DIE.x, 0, DIE.w, d - 0.12 - 0.62);
  return [{ face, rooms: [inside(face, 0.22, 0.18)], clear: [] }];
}

/** Where rj45's name lies: across its shield's top between the ribs and the dimples, its part number along the shield's right edge. */
function rj45Plans(d: number): MarkPlan[] {
  const jw = RJ45.ports * RJ45.pitch + 0.12;
  const jd = d - 0.08;
  const face = around(0, 0, jw, jd);
  const ribZ = face.top + RJ45.rib.inset;
  const dimpleZ = face.bottom - RJ45.dimple.inset;
  const clear: Box[] = [
    {
      left: face.left + 0.12,
      right: face.right - 0.02,
      top: face.bottom - 0.14,
      bottom: face.bottom,
    },
  ];
  for (let i = 0; i < RJ45.ports; i++) {
    const cx = face.left + 0.06 + RJ45.pitch * (i + 0.5);
    clear.push(
      around(cx, ribZ, RJ45.rib.w, RJ45.rib.d),
      around(cx - RJ45.dimple.x, dimpleZ, 2 * RJ45.dimple.r),
      around(cx + RJ45.dimple.x, dimpleZ, 2 * RJ45.dimple.r),
    );
  }
  const gap = 0.1;
  return [
    {
      face,
      rooms: [
        {
          left: face.left + 0.34,
          right: face.right - 0.34,
          top: ribZ + RJ45.rib.d / 2 + gap,
          bottom: dimpleZ - RJ45.dimple.r - gap,
        },
      ],
      clear,
    },
  ];
}

/** Where radio's name lies: on its shield can's top inside the embossed rim, its part number along the can's right edge. */
function radioPlans(w: number, d: number): MarkPlan[] {
  const mw = w - RADIO.antenna - 0.05;
  const canW = mw - 1.3;
  const face = around(-w / 2 + 0.1 + canW / 2, 0, canW, d - 0.18);
  const { outer, inner } = RADIO.rim;
  const rim = inside(face, outer, outer);
  return [
    {
      face,
      rooms: [inside(face, 0.32, 0.3)],
      clear: [
        { ...rim, bottom: rim.top + inner - outer },
        { ...rim, top: rim.bottom - inner + outer },
        { ...rim, right: rim.left + inner - outer },
        { ...rim, left: rim.right - inner + outer },
      ],
    },
  ];
}

/**
 * Where secure's name lies: on its lid, beside the padlock in the lid's
 * front-right corner (the lid's full depth) or behind it (the lid's full
 * width), as far in from the lid's edges as the padlock.
 */
function securePlans(w: number, d: number): MarkPlan[] {
  const face = around(-w / 2 + 0.1 + SECURE.w / 2, 0, SECURE.w - 0.36, d - 0.5);
  const inX = 0.22;
  const inZ = 0.18;
  const lock = lockExtent(SECURE.lock);
  const padlock = {
    left: face.right - inX - (lock.right - lock.left),
    right: face.right - inX,
    top: face.bottom - inZ - (lock.bottom - lock.top),
    bottom: face.bottom - inZ,
  };
  const room = inside(face, inX, inZ);
  const gap = 0.15;
  return [
    {
      face,
      rooms: [
        { ...room, right: padlock.left - gap },
        { ...room, bottom: padlock.top - gap },
      ],
      clear: [padlock],
    },
  ];
}

/**
 * Where toggle's markings lie on its panel: the name at the top-left, left
 * of lamp A and behind the fader's scale; each lamp's A or B legend in
 * front of its bezel.
 */
function togglePlans(w: number, d: number): MarkPlan[] {
  const pw = w - 0.06;
  const pd = d - 0.06;
  const face = around(0, 0, pw - 0.08, pd - 0.08);
  const { x, z, lamp, tickD } = TOGGLE;
  const left = -pw / 2 + 0.6;
  const fz = pd / 2 - 0.62;
  const slotTo = x - lamp - 0.55;
  const clear: Box[] = [
    around(x, z, 0.88),
    around(x, z - 0.48, 0.12, 0.1),
    around(x - lamp, z, 2 * BEZEL_R),
    around(x + lamp, z, 2 * BEZEL_R),
    {
      left: left - 0.17,
      right: slotTo + 0.17,
      top: fz - 0.26,
      bottom: fz + 0.26,
    },
    {
      left: left - 0.01,
      right: slotTo + 0.01,
      top: fz - 0.24 - tickD / 2,
      bottom: fz - 0.2 + tickD / 2,
    },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      clear.push(around(sx * (pw / 2 - 0.32), sz * (pd / 2 - 0.32), 0.24));
    }
  }
  return [
    {
      face,
      rooms: [
        {
          left,
          right: x - lamp - BEZEL_R - 0.15,
          top: -pd / 2 + 0.26,
          bottom: fz - 0.24 - tickD / 2 - 0.06,
        },
      ],
      clear,
    },
    ...[-1, 1].map((side) => ({
      face,
      rooms: [around(x + side * lamp, z + 0.53, 0.6, 0.3)],
      clear,
    })),
  ];
}

/** Where cpu's name lies: on its heat spreader's top, inside its chamfer. */
function cpuPlans(w: number, d: number): MarkPlan[] {
  const sw = 4.6;
  const half = Math.min(1.42, (d - 0.06) / 2 - 0.12);
  const spreader = around(
    -w / 2 + 0.05 + sw / 2 - 0.08,
    0,
    2.9,
    2.5 * (half / 1.42),
  );
  return [
    {
      face: inside(spreader, CPU_CHAMFER, CPU_CHAMFER),
      rooms: [inside(spreader, 0.15, 0.2)],
      clear: [],
    },
  ];
}

/** Where gauge's name lies: centred on its bezel under the meters' windows, in the sloped face's frame (y down its slope). */
function gaugePlans(w: number, d: number): MarkPlan[] {
  const faceL = d / Math.cos(GAUGE_SLOPE);
  const face = around(0, 0, w - 0.04, faceL - 0.04);
  const gap = 0.14;
  const winW = (w - 0.04 - 3 * gap) / 2;
  const winBottom = -faceL / 2 + 0.8;
  const winTop = faceL / 2 - 0.16;
  const windows = [-1, 1].map((side) => ({
    left: side * (winW / 2 + gap / 2) - winW / 2,
    right: side * (winW / 2 + gap / 2) + winW / 2,
    top: -winTop,
    bottom: -winBottom,
  }));
  return [
    {
      face,
      rooms: [around(0, -(-faceL / 2 + winBottom) / 2, w - 0.6, 0.62)],
      clear: windows,
    },
  ];
}

/** Where beacon's name lies: on its alarm relay's top. */
function beaconPlans(w: number, d: number): MarkPlan[] {
  const rw = 2.5;
  const rd = 1.8;
  const face = around(
    -w / 2 + 1.1 + 2.0 + 0.9 + rw / 2,
    -d / 2 + 0.1 + rd / 2,
    rw,
    rd,
  );
  return [{ face, rooms: [inside(face, 0.2, 0.18)], clear: [] }];
}

/**
 * Where each marking of a `kind` part with a footprint `w` × `d` lies: its
 * face, its rooms and the features on the face, as MarkPlan. Every room
 * lies inside its face and clear of every feature; each builder sizes its
 * face and sets its markings from these.
 */
export function markPlans(
  kind: WorkflowPartKind,
  w: number,
  d: number,
): MarkPlan[] {
  switch (kind) {
    case "qfp":
      return qfpPlans(w, d);
    case "bga":
      return bgaPlans(w, d);
    case "socket":
      return socketPlans(w, d);
    case "memory":
      return memoryPlans(w);
    case "gpu":
      return gpuPlans(w, d);
    case "trimmer":
      return trimmerPlans(w, d);
    case "die":
      return diePlans(d);
    case "rj45":
      return rj45Plans(d);
    case "radio":
      return radioPlans(w, d);
    case "secure":
      return securePlans(w, d);
    case "toggle":
      return togglePlans(w, d);
    case "cpu":
      return cpuPlans(w, d);
    case "gauge":
      return gaugePlans(w, d);
    case "beacon":
      return beaconPlans(w, d);
  }
}

/**
 * Renders the board of the BoardData in `host`'s
 * script[type="application/json"] into `host`'s <canvas> and sets
 * data-ready on `host` after its first frame. It builds the scene once the
 * self-hosted fonts load (at most FONT_WAIT ms), since the markings and
 * silkscreen are painted in JetBrains Mono, and caps the device pixel ratio
 * at 2. It follows the step of the closest [data-workflow-steps]: its
 * data-flow ("all" lights every part and trace, held still) and data-step
 * when it starts, then each "flowstep" event's FlowStepDetail. It follows
 * <html data-theme> for the page's shadow, exposure and reflections. Frames
 * run while `host` is on screen and the tab is shown; under reduced motion
 * it renders on change only. Returns a function that stops it and disposes
 * the scene, or null without WebGL or data.
 */
export function startBoard(
  host: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): (() => void) | null {
  const canvas = host.querySelector("canvas");
  const source = host.querySelector('script[type="application/json"]');
  if (!canvas || !source?.textContent) return null;
  let data: BoardData;
  try {
    data = JSON.parse(source.textContent) as BoardData;
  } catch {
    return null;
  }
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }

  let alive = true;
  let teardown: (() => void) | null = null;
  void fontsReady().then(() => {
    if (!alive) {
      renderer.dispose();
      return;
    }
    try {
      teardown = build(host, data, renderer, reduceMotion);
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  });
  return () => {
    alive = false;
    teardown?.();
    teardown = null;
  };
}

/** Builds the board's scene and runs it; returns the function that stops it and disposes everything. */
function build(
  host: HTMLElement,
  data: BoardData,
  renderer: THREE.WebGLRenderer,
  reduceMotion: boolean,
): () => void {
  const html = document.documentElement;
  const root = host.closest<HTMLElement>("[data-workflow-steps]");
  const finePointer = matchMedia("(pointer: fine)").matches;
  /** Whether every animated value holds still: under reduced motion, or while every part is lit. */
  let still = reduceMotion;

  /* ---------- Layout of nodes and traces, in stage pixels ---------- */
  const layout = layoutBoard(data.nodes);
  const routes = boardRoutes(layout, data.nodes, data.edges);
  const areas = nodeAreas(layout, data.nodes, routes);
  const fills = boardFills(layout, data.nodes, areas, routes);
  const silk = silkscreen(data);
  const STAGE_W = layout.width;
  const STAGE_H = layout.height;
  const wx = (x: number) => (x - STAGE_W / 2) / PX;
  const wz = (y: number) => (y - STAGE_H / 2) / PX;
  const FLOOR_Y = -BOARD_T - STANDOFF;
  /** Mounting holes' centres, in stage pixels. */
  const HOLES: Point[] = [
    [-7, -7],
    [STAGE_W + 7, -7],
    [-7, STAGE_H + 7],
    [STAGE_W + 7, STAGE_H + 7],
  ];
  /** The board's outline, in units. */
  const BOARD_W = (STAGE_W + 2 * MARGIN) / PX;
  const BOARD_D = (STAGE_H + 2 * MARGIN) / PX;
  /** The LIVE status LED's centre in stage pixels, after the silkscreen title; paintBoard sets it. */
  const LIVE_LED = { x: 0, y: 0 };
  const STAGE_ASPECT = boardAspect(layout);

  const NODES: Placed[] = data.nodes.map((node, index) => {
    const area = areas[index]!;
    const { w, d } = footprintOf(area);
    const cx = (area.left + area.right) / 2;
    const cy = (area.top + area.bottom) / 2;
    const padX = (w / 2 + PLINTH_PAD) * PX;
    const padY = (d / 2 + PLINTH_PAD) * PX;
    return {
      id: node.id,
      label: node.label,
      kind: kindOf(node),
      index,
      area,
      w,
      d,
      cx,
      cy,
      plinth: {
        left: cx - padX,
        right: cx + padX,
        top: cy - padY,
        bottom: cy + padY,
      },
    };
  });
  const NODE = new Map(NODES.map((node) => [node.id, node]));
  const TRACES = data.edges.map((edge, index) => {
    const { points, corners } = roundedPolyline(routes[index] ?? []);
    const from = NODE.get(edge.from);
    const to = NODE.get(edge.to);
    if (from && points.length > 1) attachEnd(points, true, from.plinth);
    if (to && points.length > 1) attachEnd(points, false, to.plinth);
    return { ...edge, index, points, corners };
  });

  /* ---------- Renderer, scene, camera, lights ---------- */
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  /** The scene has no background: the canvas is transparent, so the board lies on the page. */
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const roomEnvironment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = roomEnvironment;
  scene.environmentIntensity = 0.9;

  /** A moderate lens, so the components' heights read in perspective without stretching the board's front. */
  const camera = new THREE.PerspectiveCamera(17, STAGE_ASPECT, 1, 300);

  /** The key light falls from the back right, as the flat diagram's light from its top right. */
  const keyLight = new THREE.DirectionalLight(0xfff0d0, 2.3);
  keyLight.position.set(13, 24, -11);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  const reachX = Math.max(22, BOARD_W / 2 + 6);
  const reachZ = Math.max(22, BOARD_D / 2 + 6);
  Object.assign(keyLight.shadow.camera, {
    left: -reachX,
    right: reachX,
    top: reachZ,
    bottom: -reachZ,
    near: 1,
    far: 80,
  });
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 2.5;
  const rimLight = new THREE.DirectionalLight(0xa8bcdc, 1.1);
  rimLight.position.set(-16, 9, -14);
  const fillLight = new THREE.DirectionalLight(0xdfe6ef, 0.35);
  fillLight.position.set(-4, 10, 18);
  scene.add(
    keyLight,
    rimLight,
    fillLight,
    new THREE.HemisphereLight(0xdfe6ef, 0x14161a, 0.3),
  );

  /* ---------- Shared materials ---------- */
  const GOLD_METAL = 0xc99a3c;
  const GOLD = new THREE.Color(0xffd27a);
  const HOT = new THREE.Color(0xfff1c4);
  const rimColour = new THREE.Color(...RIM_COLOUR);
  const gold = new THREE.MeshPhysicalMaterial({
    color: GOLD_METAL,
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });
  /** The current step's gold: lit from within, its glow set each frame. */
  const goldLit = gold.clone();
  goldLit.emissive = new THREE.Color(0xff9a2a);
  goldLit.emissiveIntensity = 0.45;
  /** Copper under the solder mask: olive, glossy, dull. */
  const maskCopper = new THREE.MeshPhysicalMaterial({
    color: 0x24301f,
    metalness: 0.45,
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const STATE_MATERIAL: Record<PartState, THREE.Material> = {
    idle: maskCopper,
    passed: gold,
    lit: goldLit,
  };
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xdfe3e8,
    metalness: 1,
    roughness: 0.24,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
  });
  const epoxy = new THREE.MeshPhysicalMaterial({
    color: 0x16171a,
    metalness: 0,
    roughness: 0.6,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
  });
  const drill = new THREE.MeshBasicMaterial({ color: 0x030405 });

  /** A soft round glow texture of `stops` [offset, rgba], on a 128px canvas. */
  function radialTexture(stops: [number, string][]) {
    const size = 128;
    const { surface, ctx } = surface2d(size, size);
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const glowMap = radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.2, "rgba(255,255,255,0.55)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  /** An additive glow sprite of `size` units. */
  function glowSprite(
    color: THREE.ColorRepresentation,
    size: number,
    opacity = 0,
  ) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        color,
        opacity,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    sprite.scale.setScalar(size);
    return sprite;
  }

  /** A soft rounded-rectangle glow, for the light pooling under a lit component. */
  const poolMap = (() => {
    const size = 256;
    const { surface, ctx } = surface2d(size, size);
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetX = size * 4;
    ctx.fillStyle = "#fff";
    canvasRoundRect(ctx, 50 - size * 4, 50, size - 100, size - 100, 26);
    ctx.fill();
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  /* ---------- Ribbon geometry: traces and their glow ---------- */
  /**
   * A ribbon along `path` (Vector2s on x and z): `width` across, its top face
   * at `y0 + height` and, with `height` > 0, walls down to y0. Its uv.x runs
   * 0 to 1 along the path, uv.y 0 to 1 across.
   */
  function ribbonGeometry(
    path: THREE.Vector2[],
    width: number,
    height: number,
    y0: number,
  ) {
    const count = path.length;
    const lengths = [0];
    for (let i = 1; i < count; i++) {
      lengths.push(lengths[i - 1]! + path[i]!.distanceTo(path[i - 1]!));
    }
    const total = lengths[count - 1] || 1;
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    const sides: THREE.Vector2[] = [];
    for (let i = 0; i < count; i++) {
      const before = path[Math.max(0, i - 1)]!;
      const after = path[Math.min(count - 1, i + 1)]!;
      const tangent = new THREE.Vector2().subVectors(after, before).normalize();
      const side = new THREE.Vector2(-tangent.y, tangent.x);
      let reach = width / 2;
      if (i > 0 && i < count - 1) {
        const segment = new THREE.Vector2()
          .subVectors(path[i]!, path[i - 1]!)
          .normalize();
        reach /= Math.max(0.5, segment.dot(tangent));
      }
      left.push(path[i]!.clone().addScaledVector(side, reach));
      right.push(path[i]!.clone().addScaledVector(side, -reach));
      sides.push(side);
    }
    const position: number[] = [];
    const normal: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const top = y0 + height;
    type Triple = [number, number, number];
    /** Adds a quad strip from rail a to rail b, wound to face its normals. */
    function strip(
      a: Triple[],
      b: Triple[],
      normals: Triple[],
      va: number,
      vb: number,
    ) {
      const base = position.length / 3;
      for (let i = 0; i < count; i++) {
        position.push(...a[i]!, ...b[i]!);
        normal.push(...normals[i]!, ...normals[i]!);
        uv.push(lengths[i]! / total, va, lengths[i]! / total, vb);
      }
      const p = (k: number) =>
        new THREE.Vector3(
          position[(base + k) * 3],
          position[(base + k) * 3 + 1],
          position[(base + k) * 3 + 2],
        );
      const face = new THREE.Vector3()
        .subVectors(p(2), p(0))
        .cross(new THREE.Vector3().subVectors(p(1), p(0)));
      const flip = face.dot(new THREE.Vector3(...normals[0]!)) < 0;
      for (let i = 0; i < count - 1; i++) {
        const q = base + i * 2;
        if (flip) index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        else index.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const at = (point: THREE.Vector2, y: number): Triple => [
      point.x,
      y,
      point.y,
    ];
    const up = Array.from({ length: count }, (): Triple => [0, 1, 0]);
    strip(
      left.map((p) => at(p, top)),
      right.map((p) => at(p, top)),
      up,
      1,
      0,
    );
    if (height > 0) {
      strip(
        left.map((p) => at(p, y0)),
        left.map((p) => at(p, top)),
        sides.map((s): Triple => [s.x, 0, s.y]),
        1,
        1,
      );
      strip(
        right.map((p) => at(p, top)),
        right.map((p) => at(p, y0)),
        sides.map((s): Triple => [-s.x, 0, -s.y]),
        0,
        0,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(position, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normal, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    return geometry;
  }

  /** Arc-length sampling of a path of Vector2s: pointAt(u) for u in [0, 1]. */
  function pathSampler(path: THREE.Vector2[]) {
    const lengths = [0];
    for (let i = 1; i < path.length; i++) {
      lengths.push(lengths[i - 1]! + path[i]!.distanceTo(path[i - 1]!));
    }
    const total = lengths[lengths.length - 1]!;
    return {
      total,
      pointAt(u: number, y: number, target = new THREE.Vector3()) {
        const distance = clamp(u, 0, 1) * total;
        let i = 1;
        while (i < lengths.length - 1 && lengths[i]! < distance) i++;
        const span = lengths[i]! - lengths[i - 1]! || 1;
        const s = (distance - lengths[i - 1]!) / span;
        const a = path[i - 1]!;
        const b = path[i] ?? a;
        return target.set(a.x + (b.x - a.x) * s, y, a.y + (b.y - a.y) * s);
      },
    };
  }

  /* ---------- Board texture ---------- */
  /** The fills of each role on the board's textures. */
  interface BoardPaint {
    mask: string;
    pour: string;
    fine: string;
    via: string;
    hole: string;
    gold: string;
    silk: string;
  }

  /** Paints a field of stitching vias at the free end of each board-level part's courtyard: the clock's right end, the bulk capacitors' left end. */
  function paintFill(ctx: CanvasRenderingContext2D, paint: BoardPaint) {
    for (const { kind, rect } of fills) {
      if (kind === "vrm") continue;
      const [x0, y0, x1, y1] =
        kind === "rtc"
          ? [rect.right - 14, rect.top + 3, rect.right - 1, rect.bottom - 2]
          : [rect.left + 2, rect.top + 3, rect.left + 13, rect.bottom - 3];
      for (let x = x0 + 2; x <= x1 - 1; x += 4.5) {
        for (let y = y0 + 2; y <= y1 - 1; y += 4.5) {
          ctx.fillStyle = paint.via;
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = paint.hole;
          ctx.beginPath();
          ctx.arc(x, y, 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** The net labels' font size, their offset across their trace from its centreline, and their clearance, in stage pixels. */
  const NET_FONT = 4.6;
  const NET_OFFSET = 5.4;
  const NET_CLEAR = 1.5;
  /** The silkscreen's reference designators' font. */
  const REF_FONT = `600 6.2px "JetBrains Mono", monospace`;
  /** A courtyard's corner brackets: their gap outside the plinth and their arms' length, in stage pixels. */
  const COURTYARD = { gap: 3, arm: 5 };
  /** Each courtyard corner as the way its arms run: [1, 1] the top-left corner, its arms toward +x and +y. */
  const COURTYARD_CORNERS = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const;
  /** A status LED's centre, in units: in from its plinth's right edge and out past its front edge. */
  const LED_SPOT = { inset: 0.34, out: 0.24 };
  /**
   * Each kind's height standing at its plinth's back edge, in units, for
   * how far it hides the board behind it in the view (a leaning DIMM's top
   * counts less its setback from that edge).
   */
  const KIND_RISE: Record<WorkflowPartKind, number> = {
    qfp: 0.5,
    bga: 0.55,
    socket: 0.5,
    memory: 1.55,
    gpu: 2.8,
    trimmer: 0.5,
    die: 0.5,
    rj45: 1.45,
    radio: 0.6,
    secure: 0.6,
    toggle: 0.6,
    cpu: 1.1,
    gauge: 1.75,
    beacon: 1.2,
  };
  /** Each board-level part's height standing at its back edge, in units, as KIND_RISE. */
  const FILL_RISE: Record<FillKind, number> = { vrm: 1.0, rtc: 0.5, bulk: 1.1 };
  /** How far a height `rise` in units hides the board behind it in the view, in stage pixels. */
  const hidden = (rise: number) => (rise / Math.tan(VIEW.elevation)) * PX;
  /** A net label: its text, its centre on its trace, its turn, and its offset across the trace in the turned frame. */
  interface NetLabel {
    text: string;
    x: number;
    y: number;
    turn: number;
    offset: number;
  }

  /**
   * Each trace's net label, set NET_OFFSET to one side of a straight run of
   * its trace and turned along it, never reading right to left, where its
   * box keeps NET_CLEAR from every part's plinth and the board its height
   * hides behind it (KIND_RISE), its courtyard's corners, its reference
   * designator and its status LED, every board-level part, its designator
   * and the board it hides (FILL_RISE), every mounting hole, every other
   * run of a trace and every label already placed. The longest level or
   * upright run comes first, its side above or left of it first, at the
   * free place nearest its middle; then its other side; then the next run.
   * A trace with no such place has no label. `ctx`, set to the label font,
   * measures the text.
   */
  function netLabels(ctx: CanvasRenderingContext2D): NetLabel[] {
    const half = NET_FONT * 0.55;
    ctx.save();
    ctx.font = REF_FONT;
    const refWidth = (text: string) => ctx.measureText(text).width;
    const keepOut: Box[] = [
      ...NODES.flatMap((node) => {
        const { left, top, right, bottom } = node.plinth;
        const ledX = right - LED_SPOT.inset * PX;
        const ledY = bottom + LED_SPOT.out * PX;
        const ref = `${REF_PREFIX[node.kind]}${node.index + 1}`;
        return [
          {
            left: left - 1,
            right: right + 1,
            top: top - 1 - hidden(KIND_RISE[node.kind]),
            bottom: bottom + 1,
          },
          ...COURTYARD_CORNERS.map(([sx, sy]) => {
            const x = sx > 0 ? left - COURTYARD.gap : right + COURTYARD.gap;
            const y = sy > 0 ? top - COURTYARD.gap : bottom + COURTYARD.gap;
            const arm = COURTYARD.arm;
            return {
              left: Math.min(x, x + sx * arm) - 0.5,
              right: Math.max(x, x + sx * arm) + 0.5,
              top: Math.min(y, y + sy * arm) - 0.5,
              bottom: Math.max(y, y + sy * arm) + 0.5,
            };
          }),
          {
            left: left - COURTYARD.gap - 4,
            right: left + 1 + refWidth(ref),
            top: top - 11,
            bottom: top - 4,
          },
          {
            left: ledX - 4,
            right: ledX + 4,
            top: ledY - 3,
            bottom: ledY + 3,
          },
        ];
      }),
      ...fills.map(({ kind, ref, rect }) => ({
        left: rect.left - 3,
        right: Math.max(rect.right + 3, rect.left + 2 + refWidth(ref)),
        top: Math.min(rect.top - 11, rect.top - 3 - hidden(FILL_RISE[kind])),
        bottom: rect.bottom + 3,
      })),
      ...HOLES.map(([x, y]) => ({
        left: x - 10,
        right: x + 10,
        top: y - 10,
        bottom: y + 10,
      })),
    ];
    ctx.restore();
    const traceHalf = (TRACE_W * PX) / 2;
    const traceRuns = runsOf(TRACES.map((trace) => trace.points));
    const labels: NetLabel[] = [];
    for (const trace of TRACES) {
      const name = trace.label.toUpperCase();
      const width = ctx.measureText(`${name} ▸`).width;
      const reach = width / 2 + NET_CLEAR;
      const runs = runsOf([trace.points])
        .map(([a, b]) => ({
          a,
          b,
          length: Math.hypot(b[0] - a[0], b[1] - a[1]),
        }))
        .filter((run) => run.length >= width + 14)
        .sort((p, q) => q.length - p.length);
      search: for (const { a, b } of runs) {
        const level = Math.abs(b[1] - a[1]) < 0.01;
        if (!level && Math.abs(b[0] - a[0]) >= 0.01) continue;
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const upright = Math.abs(angle) > Math.PI / 2;
        const turn = upright ? angle + Math.PI : angle;
        /** `box`'s extent along the run and across it. */
        const frame = (box: Box) =>
          level
            ? { from: box.left, to: box.right, low: box.top, high: box.bottom }
            : { from: box.top, to: box.bottom, low: box.left, high: box.right };
        const others = traceRuns
          .filter(([p, q]) => p !== a || q !== b)
          .map(([p, q]) => ({
            left: Math.min(p[0], q[0]) - traceHalf,
            right: Math.max(p[0], q[0]) + traceHalf,
            top: Math.min(p[1], q[1]) - traceHalf,
            bottom: Math.max(p[1], q[1]) + traceHalf,
          }));
        const line = level ? a[1] : a[0];
        const ends = level ? [a[0], b[0]] : [a[1], b[1]];
        const first = Math.min(...ends) + 7 + width / 2;
        const last = Math.max(...ends) - 7 - width / 2;
        const middle = (first + last) / 2;
        for (const offset of [-NET_OFFSET, NET_OFFSET]) {
          const across =
            line + (level ? Math.cos(turn) : -Math.sin(turn)) * offset;
          const low = across - half - NET_CLEAR;
          const high = across + half + NET_CLEAR;
          const blocked = [...keepOut, ...others]
            .map(frame)
            .filter((out) => out.high > low && out.low < high)
            .map((out) => [out.from - reach, out.to + reach] as const);
          const free = (at: number) =>
            at >= first &&
            at <= last &&
            blocked.every(([from, to]) => at <= from || at >= to);
          const at = [middle, ...blocked.flat()]
            .map((at) => clamp(at, first, last))
            .filter(free)
            .sort((p, q) => Math.abs(p - middle) - Math.abs(q - middle))[0];
          if (at === undefined) continue;
          const x = level ? at : a[0];
          const y = level ? a[1] : at;
          keepOut.push(
            level
              ? { left: at - reach, right: at + reach, top: low, bottom: high }
              : { left: low, right: high, top: at - reach, bottom: at + reach },
          );
          labels.push({
            text: upright ? `◂ ${name}` : `${name} ▸`,
            x,
            y,
            turn,
            offset,
          });
          break search;
        }
      }
    }
    return labels;
  }

  /**
   * Paints the board's top face onto `ctx` in stage pixels: solder mask over
   * a copper pour with clearances around every trace, plinth and hole,
   * breakout traces and vias, the gold perimeter band, fiducials and the
   * silkscreen. `paint` maps each role to a fill: albedo colours, or packed
   * height (R), roughness (G) and metalness (B) for the surface map;
   * `albedo` adds the hatching and contact shadows that only colour carries.
   */
  function paintBoard(
    ctx: CanvasRenderingContext2D,
    paint: BoardPaint,
    albedo: boolean,
  ) {
    const random = seeded(11);
    const L = -MARGIN;
    const T = -MARGIN;
    const W = STAGE_W + 2 * MARGIN;
    const H = STAGE_H + 2 * MARGIN;
    ctx.save();
    ctx.setTransform(TEX, 0, 0, TEX, MARGIN * TEX, MARGIN * TEX);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.fillStyle = paint.mask;
    ctx.fillRect(L, T, W, H);

    // The copper pour, inset from the edge, cleared around traces, plinths and holes.
    ctx.fillStyle = paint.pour;
    canvasRoundRect(ctx, L + 10, T + 10, W - 20, H - 20, 12);
    ctx.fill();
    if (albedo) {
      ctx.save();
      canvasRoundRect(ctx, L + 10, T + 10, W - 20, H - 20, 12);
      ctx.clip();
      ctx.strokeStyle = "rgba(120,170,130,0.035)";
      ctx.lineWidth = 0.6;
      for (let k = -H; k < W; k += 5) {
        ctx.beginPath();
        ctx.moveTo(L + k, T);
        ctx.lineTo(L + k + H, T + H);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = paint.mask;
    ctx.lineWidth = 13;
    for (const trace of TRACES) {
      ctx.beginPath();
      trace.points.forEach(([x, y], i) =>
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
      );
      ctx.stroke();
    }
    ctx.fillStyle = paint.mask;
    for (const node of NODES) {
      const { left, top, right, bottom } = node.plinth;
      canvasRoundRect(
        ctx,
        left - 6,
        top - 6,
        right - left + 12,
        bottom - top + 12,
        6,
      );
      ctx.fill();
    }
    for (const [x, y] of HOLES) {
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fill();
    }

    // Breakout traces: short runs out of each plinth's back and sides, each
    // ending in a via, clear of the traces' ends and of the board-level parts.
    const vias: Point[] = [];
    const ends = TRACES.flatMap((trace) =>
      trace.points.length ? [trace.points[0]!, trace.points.at(-1)!] : [],
    );
    const nearEnd = (x: number, y: number) =>
      ends.some(([ex, ey]) => Math.abs(ex - x) < 8 && Math.abs(ey - y) < 8);
    const inFill = (x: number, y: number) =>
      fills.some(
        ({ rect }) =>
          x > rect.left - 4 &&
          x < rect.right + 4 &&
          y > rect.top - 4 &&
          y < rect.bottom + 4,
      );
    ctx.strokeStyle = paint.fine;
    ctx.lineWidth = 1.3;
    for (const node of NODES) {
      const { left, top, right, bottom } = node.plinth;
      const lanes: [number, number, number, number][] = [];
      for (let x = left + 5; x <= right - 5; x += 4.5)
        lanes.push([x, top, 0, -1]);
      for (let y = top + 4; y <= bottom - 6; y += 4.5) {
        lanes.push([left, y, -1, 0], [right, y, 1, 0]);
      }
      for (const [x, y, dx, dy] of lanes) {
        if (random() < 0.45 || nearEnd(x, y)) continue;
        const run = 3 + random() * 5;
        const bend = (random() < 0.5 ? -1 : 1) * (2 + random() * 4);
        const mx = x + dx * run;
        const my = y + dy * run;
        const ex = mx + dx * Math.abs(bend) + (dy ? bend : 0);
        const ey = my + dy * Math.abs(bend) + (dx ? bend : 0);
        if (ex < node.area.left - 6 || ex > node.area.right + 6) continue;
        if (ey < node.area.top - 8 || ey > node.area.bottom + 2) continue;
        if (inFill(ex, ey) || nearEnd(ex, ey)) continue;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(mx, my);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        vias.push([ex, ey]);
      }
    }
    // Stitching vias along the board's edge.
    for (let x = L + 22; x < L + W - 20; x += 13) {
      vias.push([x, T + 5.5], [x, T + H - 5.5]);
    }
    for (let y = T + 22; y < T + H - 20; y += 13) {
      vias.push([L + 5.5, y], [L + W - 5.5, y]);
    }
    for (const [x, y] of vias) {
      ctx.fillStyle = paint.via;
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = paint.hole;
      ctx.beginPath();
      ctx.arc(x, y, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    paintFill(ctx, paint);

    // Contact shadows under each plinth.
    if (albedo) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 9 * TEX;
      ctx.shadowOffsetX = 10000 * TEX;
      ctx.fillStyle = "#000";
      for (const node of NODES) {
        const { left, top, right, bottom } = node.plinth;
        canvasRoundRect(
          ctx,
          left - 10000 - 1,
          top + 1,
          right - left + 2,
          bottom - top + 2,
          4,
        );
        ctx.fill();
      }
      ctx.restore();
    }

    // The gold perimeter band, the mounting rings and three fiducials.
    ctx.strokeStyle = paint.gold;
    ctx.lineWidth = 2.4;
    canvasRoundRect(
      ctx,
      L + 2.6,
      T + 2.6,
      W - 5.2,
      H - 5.2,
      BOARD_CORNER * PX - 2.6,
    );
    ctx.stroke();
    ctx.fillStyle = paint.gold;
    for (const [x, y] of HOLES) {
      ctx.beginPath();
      ctx.arc(x, y, HOLE_RING * PX, 0, Math.PI * 2);
      ctx.fill();
    }
    const fiducials: Point[] = [
      [STAGE_W * 0.5, -9],
      [STAGE_W + 9, STAGE_H * 0.49],
      [-9, STAGE_H * 0.51],
    ];
    for (const [x, y] of fiducials) {
      ctx.fillStyle = paint.mask;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = paint.gold;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Silkscreen: courtyard brackets, reference designators, net names, the board's name.
    ctx.strokeStyle = paint.silk;
    ctx.fillStyle = paint.silk;
    ctx.lineWidth = 0.9;
    ctx.lineCap = "square";
    for (const node of NODES) {
      const left = node.plinth.left - COURTYARD.gap;
      const right = node.plinth.right + COURTYARD.gap;
      const top = node.plinth.top - COURTYARD.gap;
      const bottom = node.plinth.bottom + COURTYARD.gap;
      const arm = COURTYARD.arm;
      ctx.beginPath();
      for (const [sx, sy] of COURTYARD_CORNERS) {
        const x = sx > 0 ? left : right;
        const y = sy > 0 ? top : bottom;
        ctx.moveTo(x + sx * arm, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + sy * arm);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(left - 2.5, top - 2.5, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = REF_FONT;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(
        `${REF_PREFIX[node.kind]}${node.index + 1}`,
        left + 4,
        top - 2.5,
      );
    }
    for (const { ref, rect } of fills) {
      ctx.strokeRect(
        rect.left - 2,
        rect.top - 2,
        rect.right - rect.left + 4,
        rect.bottom - rect.top + 4,
      );
      ctx.fillText(ref, rect.left + 1, rect.top - 4);
    }
    ctx.font = `600 ${NET_FONT}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const label of netLabels(ctx)) {
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate(label.turn);
      ctx.fillText(label.text, 0, label.offset);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.font = `700 8px "JetBrains Mono", monospace`;
    ctx.fillText(silk.title, 34, STAGE_H + 12.5);
    // The LIVE status LED's courtyard and legend, after the title; buildLiveLed sets the LED on LIVE_LED.
    LIVE_LED.x = 34 + ctx.measureText(silk.title).width + 10;
    LIVE_LED.y = STAGE_H + 9.6;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(LIVE_LED.x - 5, LIVE_LED.y - 3.4, 10, 6.8);
    ctx.font = `600 6px "JetBrains Mono", monospace`;
    ctx.fillText("LIVE", LIVE_LED.x + 7.5, STAGE_H + 12.5);
    const legendEnd = LIVE_LED.x + 7.5 + ctx.measureText("LIVE").width;
    // The revision line, right-aligned, when it clears the title and its legend.
    if (STAGE_W - 30 - ctx.measureText(silk.meta).width > legendEnd + 12) {
      ctx.textAlign = "right";
      ctx.fillText(silk.meta, STAGE_W - 30, STAGE_H + 12.5);
    }
    ctx.restore();
  }

  /** The board's colour map and its packed height/roughness/metalness map. */
  function boardTextures() {
    const width = (STAGE_W + 2 * MARGIN) * TEX;
    const height = (STAGE_H + 2 * MARGIN) * TEX;
    const colourCanvas = surface2d(width, height);
    paintBoard(
      colourCanvas.ctx,
      {
        mask: "#06100a",
        pour: "#0c1a12",
        fine: "#11271a",
        via: "#173022",
        hole: "#040605",
        gold: "#c99a3c",
        silk: "rgba(222,226,214,0.92)",
      },
      true,
    );
    const surfaceCanvas = surface2d(width, height);
    paintBoard(
      surfaceCanvas.ctx,
      {
        mask: "rgb(0,62,0)",
        pour: "rgb(30,58,0)",
        fine: "rgb(62,54,0)",
        via: "rgb(70,56,0)",
        hole: "rgb(0,210,0)",
        gold: "rgb(80,52,255)",
        silk: "rgb(130,205,0)",
      },
      false,
    );
    const colour = new THREE.CanvasTexture(colourCanvas.surface);
    colour.colorSpace = THREE.SRGBColorSpace;
    const surface = new THREE.CanvasTexture(surfaceCanvas.surface);
    surface.colorSpace = THREE.NoColorSpace;
    for (const texture of [colour, surface]) {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
    }
    return { colour, surface };
  }

  /* ---------- Component materials ---------- */
  /**
   * Brushed grain, as pipeline3d.ts's: streaks along u whose brightness
   * drifts along them, linear greys around 0.9 that tile in u and v.
   */
  const brushTexture = (() => {
    const WIDTH = 256;
    const HEIGHT = 512;
    const OCTAVES = [
      [2, 32, 0.34],
      [3, 16, 0.26],
      [4, 8, 0.2],
      [5, 4, 0.14],
      [6, 2, 0.1],
    ] as const;
    const random = seeded(5);
    const value = new Float32Array(WIDTH * HEIGHT);
    for (const [cellsU, cellV, amplitude] of OCTAVES) {
      const cellsV = HEIGHT / cellV;
      const lattice = Float32Array.from(
        { length: cellsU * cellsV },
        () => random() * 2 - 1,
      );
      const point = (i: number, j: number) =>
        lattice[(j % cellsV) * cellsU + (i % cellsU)]!;
      for (let y = 0; y < HEIGHT; y++) {
        const j = Math.floor(y / cellV);
        const ty = smooth(y / cellV - j);
        for (let x = 0; x < WIDTH; x++) {
          const i = Math.floor((x / WIDTH) * cellsU);
          const tx = smooth((x / WIDTH) * cellsU - i);
          const near = point(i, j) + (point(i + 1, j) - point(i, j)) * tx;
          const far =
            point(i, j + 1) + (point(i + 1, j + 1) - point(i, j + 1)) * tx;
          value[y * WIDTH + x]! += amplitude * (near + (far - near) * ty);
        }
      }
    }
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    for (let n = 0; n < WIDTH * HEIGHT; n++) {
      const grey = Math.round(255 * clamp(0.9 + 0.16 * value[n]!, 0, 1));
      pixels[n * 4] = pixels[n * 4 + 1] = pixels[n * 4 + 2] = grey;
      pixels[n * 4 + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, WIDTH, HEIGHT);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  })();

  /**
   * Moulding grain: value noise in three octaves over a fine speckle, greys
   * from about 0.78 to 1 that tile in u and v, for the matte finish of
   * moulded epoxy (its roughness and its bump).
   */
  const grainTexture = (() => {
    const SIZE = 128;
    const OCTAVES = [
      [8, 0.5],
      [16, 0.3],
      [32, 0.2],
    ] as const;
    const random = seeded(23);
    const value = new Float32Array(SIZE * SIZE);
    for (const [cells, amplitude] of OCTAVES) {
      const lattice = Float32Array.from({ length: cells * cells }, () =>
        random(),
      );
      const point = (i: number, j: number) =>
        lattice[(j % cells) * cells + (i % cells)]!;
      for (let y = 0; y < SIZE; y++) {
        const j = Math.floor((y / SIZE) * cells);
        const ty = smooth((y / SIZE) * cells - j);
        for (let x = 0; x < SIZE; x++) {
          const i = Math.floor((x / SIZE) * cells);
          const tx = smooth((x / SIZE) * cells - i);
          const near = point(i, j) + (point(i + 1, j) - point(i, j)) * tx;
          const far =
            point(i, j + 1) + (point(i + 1, j + 1) - point(i, j + 1)) * tx;
          value[y * SIZE + x]! += amplitude * (near + (far - near) * ty);
        }
      }
    }
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    for (let n = 0; n < SIZE * SIZE; n++) {
      const grey = Math.round(
        255 * clamp(0.78 + 0.22 * value[n]! + (random() - 0.5) * 0.1, 0, 1),
      );
      pixels[n * 4] = pixels[n * 4 + 1] = pixels[n * 4 + 2] = grey;
      pixels[n * 4 + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, SIZE, SIZE);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  })();

  /*
   * A material's envMapIntensity takes effect only with its own envMap, so
   * the materials that take less of the room's reflection carry
   * roomEnvironment.
   */
  /** Bright tin plating: the small parts' leads and terminations. */
  const tin = new THREE.MeshPhysicalMaterial({
    color: 0xc4c9cf,
    metalness: 1,
    roughness: 0.28,
    envMap: roomEnvironment,
    envMapIntensity: 1,
  });
  /** Brushed nickel: the processor socket's loading frame and the clock's coin cell. */
  const nickel = new THREE.MeshPhysicalMaterial({
    color: 0x969ca3,
    metalness: 1,
    roughness: 0.4,
    map: brushTexture,
    clearcoat: 0.2,
    clearcoatRoughness: 0.32,
    envMap: roomEnvironment,
    envMapIntensity: 0.55,
  });
  const gunmetal = new THREE.MeshPhysicalMaterial({
    color: 0x30353c,
    metalness: 0.9,
    roughness: 0.36,
    map: brushTexture,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });
  const blackPlastic = new THREE.MeshPhysicalMaterial({
    color: 0x111215,
    roughness: 0.5,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
  });
  const pcbBlack = new THREE.MeshPhysicalMaterial({
    color: 0x0c0e10,
    roughness: 0.34,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
  });
  const substrate = new THREE.MeshPhysicalMaterial({
    color: 0x22401e,
    roughness: 0.4,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    envMap: roomEnvironment,
    envMapIntensity: 0.45,
  });
  const aluminium = new THREE.MeshPhysicalMaterial({
    color: 0xaab0b7,
    metalness: 1,
    roughness: 0.4,
    envMap: roomEnvironment,
    envMapIntensity: 0.68,
  });
  const mlcc = new THREE.MeshStandardMaterial({
    color: 0x86704f,
    roughness: 0.55,
  });
  const ferrite = new THREE.MeshStandardMaterial({
    color: 0x2c2f34,
    metalness: 0.2,
    roughness: 0.68,
  });
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0x24252a,
    roughness: 0.42,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x151619,
    roughness: 0.82,
  });
  const sleeve = new THREE.MeshPhysicalMaterial({
    color: 0x15171b,
    roughness: 0.34,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const brass = gold.clone();
  brass.color.set(0xb8913f);
  brass.roughness = 0.34;
  const darkness = new THREE.MeshBasicMaterial({ color: 0x020203 });
  /** Moulded epoxy: black and matte, its roughness and bump mottled by grainTexture. */
  const mould = new THREE.MeshPhysicalMaterial({
    color: 0x141518,
    roughness: 0.74,
    roughnessMap: grainTexture,
    bumpMap: grainTexture,
    bumpScale: 0.5,
    clearcoat: 0.1,
    clearcoatRoughness: 0.55,
  });
  /** A moulded body's pin-1 dimple. */
  const dimple = new THREE.MeshStandardMaterial({
    color: 0x07080a,
    roughness: 0.26,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  /** Amber PEI: the test socket's frame. */
  const pei = new THREE.MeshPhysicalMaterial({
    color: 0x4a260a,
    roughness: 0.42,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xb8742e),
    envMap: roomEnvironment,
    envMapIntensity: 0.6,
  });
  /**
   * A module's solder mask on a face turned to the viewer: rough enough
   * that the fill light's highlight spreads instead of mirroring into the
   * view.
   */
  const facingGreen = new THREE.MeshStandardMaterial({
    color: 0x184a2c,
    roughness: 0.8,
    envMap: roomEnvironment,
    envMapIntensity: 0.25,
  });
  const terminalGreen = new THREE.MeshPhysicalMaterial({
    color: 0x1f5a3a,
    roughness: 0.45,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  });
  const latchGrey = new THREE.MeshPhysicalMaterial({
    color: 0x8c929a,
    roughness: 0.45,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  });
  /** The meters' cover glass: a faint film that takes the room's reflection. */
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b0d10,
    roughness: 0.05,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    depthWrite: false,
    envMap: roomEnvironment,
    envMapIntensity: 1.4,
  });

  /* ---------- Node finishes ---------- */
  /**
   * Each FinishKind's finish per state. The metals are brushed silver when
   * idle, silver with a gold cast once passed and gold while lit; `facing`
   * is darker and rougher and takes less of the room's reflection (its own
   * envMap in FINISH_PARAMETERS), so a face turned to the viewer reads as
   * the same metal instead of mirroring the room and the fill light.
   * `epoxy` stays black, a shade warmer and rougher once passed and while
   * lit, so the lit part's lights spread across it instead of glinting; its
   * marking's light ink and its gold leads carry the light. `silicon` is a
   * dark blue-grey mirror that warms faintly from within (FINISH_GLOW)
   * while lit.
   */
  const FINISHES: Record<FinishKind, Record<PartState, Finish>> = {
    metal: {
      idle: { color: new THREE.Color(0xc6cbd2), roughness: 0.3 },
      passed: { color: new THREE.Color(0xb4b0a4), roughness: 0.28 },
      lit: { color: new THREE.Color(0xf0bd58), roughness: 0.22 },
    },
    facing: {
      idle: { color: new THREE.Color(0x7a8089), roughness: 0.5 },
      passed: { color: new THREE.Color(0x837e6e), roughness: 0.5 },
      lit: { color: new THREE.Color(0xb68a3c), roughness: 0.44 },
    },
    lead: {
      idle: { color: new THREE.Color(0xe2e6eb), roughness: 0.16 },
      passed: { color: new THREE.Color(0xd4cdb6), roughness: 0.16 },
      lit: { color: new THREE.Color(0xffcf6a), roughness: 0.12 },
    },
    epoxy: {
      idle: { color: new THREE.Color(0x141518), roughness: 0.74 },
      passed: { color: new THREE.Color(0x171513), roughness: 0.78 },
      lit: { color: new THREE.Color(0x161411), roughness: 0.84 },
    },
    silicon: {
      idle: { color: new THREE.Color(0x161a2a), roughness: 0.22 },
      passed: { color: new THREE.Color(0x1e1d22), roughness: 0.22 },
      lit: { color: new THREE.Color(0x2a2219), roughness: 0.22 },
    },
  };
  /** Each FinishKind's fixed material parameters; setFinish changes colour, roughness and glow only, so no program recompiles. */
  const FINISH_PARAMETERS: Record<
    FinishKind,
    THREE.MeshPhysicalMaterialParameters
  > = {
    metal: {
      metalness: 1,
      map: brushTexture,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
    },
    facing: {
      metalness: 1,
      map: brushTexture,
      clearcoat: 0.05,
      clearcoatRoughness: 0.6,
      envMap: roomEnvironment,
      envMapIntensity: 0.35,
    },
    lead: { metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.15 },
    epoxy: {
      metalness: 0,
      roughnessMap: grainTexture,
      bumpMap: grainTexture,
      bumpScale: 0.5,
      clearcoat: 0.1,
      clearcoatRoughness: 0.55,
      envMap: roomEnvironment,
      envMapIntensity: 0.45,
    },
    silicon: {
      metalness: 0.6,
      iridescence: 0.5,
      iridescenceIOR: 1.45,
      iridescenceThicknessRange: [120, 320],
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMap: roomEnvironment,
      envMapIntensity: 0.55,
    },
  };
  /** Each FinishKind's glow from within while lit, before the pulse and a landing pulse's energy. */
  const FINISH_GLOW: Record<FinishKind, number> = {
    metal: 0.04,
    facing: 0.04,
    lead: 0.04,
    epoxy: 0,
    silicon: 0.03,
  };
  /** Every node's package finishes by node id, driven by setFinish. */
  const NODE_FINISHES = new Map<string, NodeFinish[]>();
  /**
   * A new `kind` material for `node`'s part, idle, with `extra` parameters
   * (such as a `map`), registered in NODE_FINISHES. A builder uses one per
   * kind across its meshes; no other part shares it, so the state shading
   * applies to it in place.
   */
  function partFinish(
    node: Placed,
    kind: FinishKind,
    extra: THREE.MeshPhysicalMaterialParameters = {},
  ) {
    const finish = FINISHES[kind];
    const material = new THREE.MeshPhysicalMaterial({
      ...FINISH_PARAMETERS[kind],
      color: finish.idle.color.clone(),
      roughness: finish.idle.roughness,
      emissive: new THREE.Color(0xffb54a),
      emissiveIntensity: 0,
      ...extra,
    });
    const finishes = NODE_FINISHES.get(node.id) ?? [];
    finishes.push({ material, finish, glow: FINISH_GLOW[kind] });
    NODE_FINISHES.set(node.id, finishes);
    return material;
  }
  /**
   * Eases a node's package material between its idle, passed and lit
   * finishes; while lit it glows from within by its `glow`, with `pulse`
   * (0 to 1) and `energy`.
   */
  function setFinish(
    { material, finish, glow }: NodeFinish,
    passed: number,
    lit: number,
    pulse: number,
    energy: number,
  ) {
    material.color
      .copy(finish.idle.color)
      .lerp(finish.passed.color, passed)
      .lerp(finish.lit.color, lit);
    material.roughness = mix(
      mix(finish.idle.roughness, finish.passed.roughness, passed),
      finish.lit.roughness,
      lit,
    );
    material.emissiveIntensity =
      lit * glow * (1 + pulse + 2 * energy) * ILLUMINATION;
  }

  /** A mesh at (x, y, z) that casts and receives shadows. */
  function solid(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    x = 0,
    y = 0,
    z = 0,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  /** A rounded box whose radius is clamped below half its smallest side. */
  function rbox(w: number, h: number, d: number, radius: number, segments = 2) {
    const limit = Math.min(w, h, d) / 2 - 0.001;
    return new RoundedBoxGeometry(
      w,
      h,
      d,
      segments,
      Math.max(0.001, Math.min(radius, limit)),
    );
  }
  /** A rounded box `w` × `h` × `d` standing on y = `y0`, centred on (x, z). */
  function slab(
    w: number,
    h: number,
    d: number,
    radius: number,
    material: THREE.Material,
    x = 0,
    y0 = 0,
    z = 0,
  ) {
    return solid(rbox(w, h, d, radius), material, x, y0 + h / 2, z);
  }
  /** An emissive clone of `material`, so one part can glow without the rest. */
  function glowing<T extends THREE.MeshStandardMaterial>(
    material: T,
    colour: THREE.ColorRepresentation = 0xffa63a,
  ): T {
    const clone = material.clone() as T;
    clone.emissive = new THREE.Color(colour);
    clone.emissiveIntensity = 0;
    return clone;
  }
  /** A colour CanvasTexture of `surface`, mipmapped and filtered at the renderer's maximum anisotropy. */
  function canvasTexture(surface: HTMLCanvasElement) {
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Printed lines of text centred on a transparent canvas, for the small
   * parts' value codes: each line is [text, size in px, weight].
   */
  function markingTexture(
    lines: [text: string, size: number, weight?: number][],
    { width = 256, height = 256, ink = "rgba(200,205,212,0.82)" } = {},
  ) {
    const { surface, ctx } = surface2d(width, height);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const total = lines.reduce((sum, [, size]) => sum + size * 1.32, 0);
    let y = height / 2 - total / 2;
    for (const [text, size, weight = 600] of lines) {
      ctx.font = `${weight} ${size}px "JetBrains Mono", monospace`;
      y += size * 0.66;
      ctx.fillText(text, width / 2, y);
      y += size * 0.66;
    }
    return canvasTexture(surface);
  }
  /** A flat decal of `texture`, `w` by `d`, lying at height y. */
  function decal(
    texture: THREE.Texture,
    w: number,
    d: number,
    y: number,
    { roughness = 0.85, metalness = 0 } = {},
  ) {
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness,
      metalness,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Small SMD parts: a body with tin ends, `size` [w, h, d], one per [x, z, turn]. */
  function passives(
    spots: Spot[],
    size: [number, number, number],
    bodyMaterial: THREE.Material = mlcc,
  ) {
    const [w, h, d] = size;
    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w * 0.72, h, d),
      bodyMaterial,
      spots.length,
    );
    const ends = new THREE.InstancedMesh(
      new THREE.BoxGeometry(w * 0.16, h * 1.02, d * 1.02),
      tin,
      spots.length * 2,
    );
    const matrix = new THREE.Matrix4();
    const offset = new THREE.Matrix4();
    spots.forEach(([x, z, turn = 0], index) => {
      matrix.makeRotationY(turn).setPosition(x, h / 2 + 0.005, z);
      bodies.setMatrixAt(index, matrix);
      for (const side of [-1, 1]) {
        offset.makeTranslation(side * w * 0.43, 0, 0);
        ends.setMatrixAt(
          index * 2 + (side > 0 ? 1 : 0),
          matrix.clone().multiply(offset),
        );
      }
    });
    const group = new THREE.Group();
    group.add(bodies, ends);
    bodies.castShadow = true;
    return group;
  }

  const SCREW_HEAD = new THREE.CylinderGeometry(0.075, 0.085, 0.045, 20);
  const SCREW_SLOT = new THREE.BoxGeometry(0.12, 0.012, 0.024);
  /** A pan-head screw sitting on y = `y`, its slot turned `turn`. */
  function screw(x: number, y: number, z: number, turn = 0.6) {
    const head = new THREE.Group();
    head.position.set(x, y, z);
    head.add(solid(SCREW_HEAD, steel, 0, 0.0225, 0));
    const slot = new THREE.Mesh(SCREW_SLOT, darkness);
    slot.position.y = 0.046;
    slot.rotation.y = turn;
    head.add(slot);
    return head;
  }

  /** An InstancedMesh of `geometry` in `material`, one per [x, z, turn] of `spots`, at height y. */
  function instances(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    spots: Spot[],
    y = 0,
  ) {
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    const matrix = new THREE.Matrix4();
    spots.forEach(([x, z, turn = 0], index) =>
      mesh.setMatrixAt(index, matrix.makeRotationY(turn).setPosition(x, y, z)),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * A moulded body `w` × `h` × `d` standing on y = 0: straight sides between
   * top and bottom edges chamfered `chamfer` wide, its UVs in units so that
   * grainTexture keeps one scale on every package.
   */
  function mouldGeometry(
    w: number,
    h: number,
    d: number,
    chamfer = 0.035,
    radius = 0.02,
  ) {
    const c = Math.min(chamfer, h / 3);
    const shape = roundedRect(
      -w / 2 + c,
      -d / 2 + c,
      w / 2 - c,
      d / 2 - c,
      radius,
    );
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: h - 2 * c,
      bevelEnabled: true,
      bevelThickness: c,
      bevelSize: c,
      bevelSegments: 1,
      curveSegments: 3,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, c, 0);
    return geometry;
  }

  /** Lead geometries by shape, shared between packages. */
  const LEADS = new Map<string, THREE.BufferGeometry>();
  /**
   * A gull-wing lead along +x from a package's side: out of the body at
   * `rise`, bent down to a foot on y = 0 that ends `reach` out, `width`
   * across and `thick` thick.
   */
  function leadGeometry(
    reach: number,
    rise: number,
    width = 0.05,
    thick = 0.022,
  ) {
    const key = [reach, rise, width, thick].join();
    let geometry = LEADS.get(key);
    if (!geometry) {
      const shoulder = reach * 0.3;
      const foot = reach * 0.62;
      const shape = new THREE.Shape();
      shape.moveTo(-0.03, rise);
      shape.lineTo(shoulder, rise);
      shape.lineTo(foot - thick * 0.5, 0);
      shape.lineTo(reach, 0);
      shape.lineTo(reach, thick);
      shape.lineTo(foot + thick * 0.5, thick);
      shape.lineTo(shoulder + thick * 0.8, rise + thick);
      shape.lineTo(-0.03, rise + thick);
      shape.closePath();
      geometry = new THREE.ExtrudeGeometry(shape, {
        depth: width,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -width / 2);
      LEADS.set(key, geometry);
    }
    return geometry;
  }

  /**
   * Lead placements at `pitch` along a body `bw` × `bd`, `margin` clear of
   * its corners: along its front and back, and along its ends too when
   * `ends` is set. Each is [x, z, turn], turning a lead's +x outward.
   */
  function leadSpots(
    bw: number,
    bd: number,
    pitch: number,
    margin: number,
    ends = true,
  ): Spot[] {
    const spots: Spot[] = [];
    const row = (length: number, place: (at: number) => Spot) => {
      const count = Math.max(
        1,
        Math.floor((length - 2 * margin) / pitch + 1e-6) + 1,
      );
      const span = (count - 1) * pitch;
      for (let i = 0; i < count; i++) spots.push(place(-span / 2 + i * pitch));
    };
    row(bw, (x) => [x, bd / 2, -Math.PI / 2]);
    row(bw, (x) => [x, -bd / 2, Math.PI / 2]);
    if (ends) {
      row(bd, (z) => [bw / 2, z, 0]);
      row(bd, (z) => [-bw / 2, z, Math.PI]);
    }
    return spots;
  }

  const BALL = new THREE.SphereGeometry(0.06, 10, 6);
  const PIN_ONE = new THREE.CircleGeometry(PIN_DIMPLE.r, 20).rotateX(
    -Math.PI / 2,
  );
  const SMALL_DOT = new THREE.CircleGeometry(0.035, 14).rotateX(-Math.PI / 2);
  /** A domed rivet head standing on y = 0. */
  const RIVET = new THREE.SphereGeometry(
    0.07,
    16,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  ).scale(1, 0.55, 1);

  /**
   * A quad flat package: a body `bw` × `bd` in `body`, `bh` tall, held up by
   * gull-wing leads in `lead` at `pitch` round all four sides that reach
   * `reach` past it, and a pin-1 dimple at its front-left corner. `top` is
   * the height of its top face.
   */
  function qfp(
    bw: number,
    bd: number,
    body: THREE.Material,
    lead: THREE.Material,
    { bh = 0.3, pitch = 0.15, reach = 0.26 } = {},
  ) {
    const group = new THREE.Group();
    const lift = 0.05;
    group.add(solid(mouldGeometry(bw, bh, bd), body, 0, lift, 0));
    group.add(
      instances(
        leadGeometry(reach, lift + bh * 0.4),
        lead,
        leadSpots(bw, bd, pitch, 0.22),
      ),
    );
    const top = lift + bh;
    const dot = new THREE.Mesh(PIN_ONE, dimple);
    dot.position.set(
      -bw / 2 + PIN_DIMPLE.inset,
      top + 0.001,
      bd / 2 - PIN_DIMPLE.inset,
    );
    group.add(dot);
    return { group, top };
  }

  /**
   * A ball grid array: an organic substrate `sw` × `sd` on a ring of solder
   * balls in `ball`, a cap `cw` × `cd` in `body` over its die, a row of
   * capacitors in the margin in front of and behind the cap, and a pin-1
   * dimple. `top` is the height of the cap's top face.
   */
  function bga(
    sw: number,
    sd: number,
    cw: number,
    cd: number,
    body: THREE.Material,
    ball: THREE.Material,
    { ch = 0.3 } = {},
  ) {
    const group = new THREE.Group();
    const pitch = 0.17;
    const balls: Spot[] = [];
    for (let x = -sw / 2 + 0.12; x <= sw / 2 - 0.11; x += pitch) {
      balls.push([x, sd / 2 - 0.12], [x, -sd / 2 + 0.12]);
    }
    for (
      let z = -sd / 2 + 0.12 + pitch;
      z <= sd / 2 - 0.12 - pitch;
      z += pitch
    ) {
      balls.push([sw / 2 - 0.12, z], [-sw / 2 + 0.12, z]);
    }
    group.add(instances(BALL, ball, balls, 0.06));
    const deck = 0.11;
    group.add(slab(sw, 0.1, sd, 0.02, substrate, 0, deck));
    const capY = deck + 0.1;
    group.add(solid(mouldGeometry(cw, ch, cd, 0.04), body, 0, capY, 0));
    const margin = (sd - cd) / 4;
    const caps: Spot[] = [];
    for (let x = -cw / 2 + 0.25; x <= cw / 2 - 0.2; x += 0.36) {
      caps.push([x, cd / 2 + margin], [x, -cd / 2 - margin]);
    }
    const row = passives(caps, [0.16, 0.07, 0.08]);
    row.position.y = capY;
    group.add(row);
    const top = capY + ch;
    const dot = new THREE.Mesh(PIN_ONE, dimple);
    dot.position.set(
      -cw / 2 + PIN_DIMPLE.inset,
      top + 0.001,
      cd / 2 - PIN_DIMPLE.inset,
    );
    group.add(dot);
    return { group, top };
  }

  /** A small-outline package `bw` × `bd` with `pins` gull-wing leads along its front and back, its pin-1 dot at front-left. */
  function soic(bw: number, bd: number, pins = 4, bh = 0.16) {
    const group = new THREE.Group();
    const lift = 0.03;
    group.add(solid(mouldGeometry(bw, bh, bd, 0.02, 0.01), mould, 0, lift, 0));
    const pitch = (bw - 0.24) / Math.max(1, pins - 1);
    group.add(
      instances(
        leadGeometry(0.15, lift + bh * 0.4, 0.05, 0.018),
        tin,
        leadSpots(bw, bd, pitch, 0.12, false),
      ),
    );
    const dot = new THREE.Mesh(SMALL_DOT, dimple);
    dot.position.set(-bw / 2 + 0.12, lift + bh + 0.001, bd / 2 - 0.12);
    group.add(dot);
    return group;
  }

  /** A SOT-23 package: a small moulded body on three gull-wing leads. */
  function sot23() {
    const group = new THREE.Group();
    group.add(
      solid(mouldGeometry(0.3, 0.11, 0.16, 0.012, 0.005), mould, 0, 0.02, 0),
    );
    const geometry = leadGeometry(0.08, 0.06, 0.04, 0.014);
    group.add(
      instances(geometry, tin, [
        [-0.09, 0.08, -Math.PI / 2],
        [0.09, 0.08, -Math.PI / 2],
        [0, -0.08, Math.PI / 2],
      ]),
    );
    return group;
  }

  /** An HC-49 crystal: a tin can `w` long with rounded ends, on a black base. */
  function crystal(w = 1.2, d = 0.44) {
    const group = new THREE.Group();
    group.add(slab(w + 0.1, 0.06, d + 0.08, 0.02, blackPlastic));
    group.add(slab(w, 0.4, d, d / 2 - 0.01, tin, 0, 0.06));
    return group;
  }

  const chokeMark = () =>
    markingTexture([["R22", 64, 700]], {
      width: 256,
      height: 128,
      ink: "rgba(214,220,228,0.8)",
    });
  /** An SMD power choke `size` square and `height` tall on (x, z), its value printed on top. */
  function choke(
    x: number,
    z: number,
    size = 0.8,
    height = 0.6,
    mark: THREE.Texture = chokeMark(),
  ) {
    const group = new THREE.Group();
    group.add(slab(size, height, size, 0.06, ferrite, x, 0, z));
    const label = decal(mark, size * 0.7, size * 0.35, height + 0.002);
    label.position.set(x, height + 0.002, z);
    group.add(label);
    return group;
  }
  /** A row of `count` SMD power chokes at depth z, from x0 to x1. */
  function chokes(
    group: THREE.Group,
    count: number,
    x0: number,
    x1: number,
    z: number,
    size = 0.85,
  ) {
    const mark = chokeMark();
    for (let i = 0; i < count; i++) {
      const x = count > 1 ? x0 + (i * (x1 - x0)) / (count - 1) : (x0 + x1) / 2;
      group.add(choke(x, z, size, 0.62, mark));
    }
  }

  /** An SMD aluminium electrolytic: a can `r` round and `h` tall on its square black base, its vent scored on top. */
  function smdCan(x: number, z: number, r = 0.32, h = 0.62) {
    const group = new THREE.Group();
    group.add(
      slab(r * 2 + 0.08, 0.08, r * 2 + 0.08, 0.02, blackPlastic, x, 0, z),
    );
    group.add(
      solid(
        new THREE.CylinderGeometry(r, r, h - 0.08, 32),
        aluminium,
        x,
        0.08 + (h - 0.08) / 2,
        z,
      ),
    );
    for (const turn of [0, Math.PI / 2]) {
      const cut = new THREE.Mesh(
        new THREE.BoxGeometry(r * 1.3, 0.008, 0.02),
        darkness,
      );
      cut.position.set(x, h + 0.002, z);
      cut.rotation.y = turn + 0.4;
      group.add(cut);
    }
    return group;
  }

  /** Contact-shadow textures by footprint, so equal footprints share one. */
  const SHADOWS = new Map<string, THREE.Texture>();
  /** How far a contact shadow fades out past its footprint, in units. */
  const SHADOW_SPREAD = 0.32;
  /**
   * A soft contact shadow on the floor under a footprint `w` × `d` centred
   * on (x, z): black, darkest under the footprint, fading out over
   * SHADOW_SPREAD round it. The framing leaves it out (userData.decor).
   */
  function contactShadow(w: number, d: number, x = 0, z = 0, opacity = 0.6) {
    const pw = w + 2 * SHADOW_SPREAD;
    const pd = d + 2 * SHADOW_SPREAD;
    const key = `${w.toFixed(2)}:${d.toFixed(2)}`;
    let texture = SHADOWS.get(key);
    if (!texture) {
      const k = 40;
      const { surface, ctx } = surface2d(Math.ceil(pw * k), Math.ceil(pd * k));
      const away = surface.width * 4;
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = SHADOW_SPREAD * k;
      ctx.shadowOffsetX = away;
      ctx.fillStyle = "#fff";
      const inset = SHADOW_SPREAD * 0.8 * k;
      canvasRoundRect(
        ctx,
        inset - away,
        inset,
        surface.width - 2 * inset,
        surface.height - 2 * inset,
        0.08 * k,
      );
      ctx.fill();
      texture = new THREE.CanvasTexture(surface);
      texture.colorSpace = THREE.SRGBColorSpace;
      SHADOWS.set(key, texture);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, pd),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.002, z);
    mesh.userData.decor = true;
    return mesh;
  }

  /* ---------- Markings ---------- */
  /*
   * Every part carries its node's name as a manufacturer's marking:
   * JetBrains Mono 600 in capitals, set by fitMarking in a room on the
   * surface it lies on, with its part number (partNumber) under it or turned
   * along the room's right edge. Its ink (INK_ON) eases between three
   * finishes with its node's state. Light ink on epoxy and silicon is pale
   * grey (idle), gold (passed) and glowing pale gold under a bloom (lit);
   * dark ink etched into metal is a dark etch (idle), a bronze fill (passed)
   * and a deep amber etch over a warm halo (lit).
   */
  const MARK_FONT = (px: number) =>
    `600 ${px}px "JetBrains Mono", ui-monospace, monospace`;
  /** A marking's letter spacing, and its texture's clear margin round the block, in ems. */
  const MARK_TRACKING = 0.05;
  const MARK_MARGIN = 0.45;
  /** Texture pixels per em of a marking, and the glow layer's share of them. */
  const MARK_TEXEL = 64;
  const GLOW_SCALE = 0.5;
  /** Each Ink's finish per state. */
  const INKS: Record<Ink, Record<PartState, InkFinish>> = {
    light: {
      idle: {
        color: new THREE.Color(0xc4cad2),
        metalness: 0.3,
        roughness: 0.55,
        emissive: 0,
      },
      passed: {
        color: new THREE.Color(0xdca546),
        metalness: 0.75,
        roughness: 0.34,
        emissive: 0.16,
      },
      lit: {
        color: new THREE.Color(0xffe6a8),
        metalness: 0.45,
        roughness: 0.26,
        emissive: 1.45,
      },
    },
    dark: {
      idle: {
        color: new THREE.Color(0x22252a),
        metalness: 0.4,
        roughness: 0.72,
        emissive: 0,
      },
      passed: {
        color: new THREE.Color(0x5a3a12),
        metalness: 0.55,
        roughness: 0.46,
        emissive: 0.03,
      },
      lit: {
        color: new THREE.Color(0x2a1803),
        metalness: 0.3,
        roughness: 0.55,
        emissive: 0.04,
      },
    },
  };
  /** The Ink a marking takes on each FinishKind of surface. */
  const INK_ON: Record<FinishKind, Ink> = {
    metal: "dark",
    facing: "dark",
    lead: "dark",
    epoxy: "light",
    silicon: "light",
  };
  /** Every marking, painted by paintMarkings once the fonts have loaded. */
  const MARKINGS: Marking[] = [];
  const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

  /**
   * A marking for `node`: an anchor whose local +z faces out of the surface
   * it lies on and whose +y runs up the text, its text block meeting the
   * anchor at the block's `align` and `valign` edges, inside the room
   * `width` × `height` that reaches from the anchor across the surface. Its
   * name's glow draws over light ink, so the lit letters bloom, and under
   * dark ink, so the etched letters stay dark over it.
   */
  function marking(node: Placed, options: MarkingOptions) {
    const ink = INK_ON[options.on];
    const palette = INKS[ink];
    const material = new THREE.MeshStandardMaterial({
      color: palette.idle.color.clone(),
      metalness: palette.idle.metalness,
      roughness: palette.idle.roughness,
      emissive: new THREE.Color(0xffb547),
      emissiveIntensity: 0,
      envMap: roomEnvironment,
      envMapIntensity: options.reflection ?? 1,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    material.visible = false;
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.position.z = 0.002;
    mesh.scale.setScalar(0.001);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa83a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    glowMaterial.visible = false;
    const glow = new THREE.Mesh(UNIT_PLANE, glowMaterial);
    glow.position.z = 0.01;
    glow.renderOrder = ink === "light" ? 3 : 1;
    mesh.add(glow);
    const anchor = new THREE.Group();
    anchor.add(mesh);
    MARKINGS.push({
      node: node.id,
      anchor,
      mesh,
      glow,
      options,
      ink: palette,
      metal: options.metal ?? 1,
      name: options.text === undefined,
    });
    return anchor;
  }

  /** Lays a marking's anchor flat on a top face at height y, the text's top toward the back. */
  function onTop(anchor: THREE.Group, x: number, y: number, z: number) {
    anchor.rotation.x = -Math.PI / 2;
    anchor.position.set(x, y, z);
    return anchor;
  }

  /** The coordinate of a span `from` to `to` at `edge`: its start, its middle or its end. */
  const edgeAt = (
    from: number,
    to: number,
    edge: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) =>
    edge === "center" || edge === "middle"
      ? (from + to) / 2
      : edge === "right" || edge === "bottom"
        ? to
        : from;
  /** A marking's options without its room, which markIn takes from a MarkPlan's room. */
  type RoomOptions = Omit<MarkingOptions, "width" | "height">;
  /** Sets a marking's block in the middle of its room, its lines centred. */
  const CENTRED = { align: "center", valign: "middle" } as const;
  /**
   * A marking for `node` set in `room` (a box on its face, y down the
   * text): its anchor, and the point of the room its block meets at its
   * `align` and `valign` edges, in the room's frame.
   */
  function markIn(node: Placed, room: Box, options: RoomOptions) {
    const align = options.align ?? "left";
    const valign = options.valign ?? "top";
    const anchor = marking(node, {
      ...options,
      width: room.right - room.left,
      height: room.bottom - room.top,
    });
    return {
      anchor,
      x: edgeAt(room.left, room.right, align),
      y: edgeAt(room.top, room.bottom, valign),
    };
  }
  /** A marking for `node` in `room` on a top face at height y (MarkPlan's y running toward the viewer). */
  function markOnTop(node: Placed, room: Box, y: number, options: RoomOptions) {
    const { anchor, x, y: z } = markIn(node, room, options);
    return onTop(anchor, x, y, z);
  }
  /** A marking for `node` in `room` on an upright face at depth z in its frame (MarkPlan's y running down the face). */
  function markOnFace(
    node: Placed,
    room: Box,
    z: number,
    options: RoomOptions,
  ) {
    const { anchor, x, y } = markIn(node, room, options);
    anchor.position.set(x, -y, z);
    return anchor;
  }

  const measurer = surface2d(1, 1).ctx;
  /** Sets `ctx` to the marking font at `px`, tracked. */
  function setMarkFont(ctx: CanvasRenderingContext2D, px: number) {
    ctx.font = MARK_FONT(px);
    ctx.letterSpacing = `${MARK_TRACKING * px}px`;
  }
  /** The width of `text` set one em tall, in ems, short of the tracking after its last letter. */
  function markWidth(text: string) {
    setMarkFont(measurer, 100);
    return (measurer.measureText(text).width - MARK_TRACKING * 100) / 100;
  }
  let capRatio = 0;
  /** The marking font's cap height, in ems. */
  function markCap() {
    if (!capRatio) {
      setMarkFont(measurer, 100);
      capRatio =
        measurer.measureText("H").actualBoundingBoxAscent / 100 || 0.73;
    }
    return capRatio;
  }

  /** A line of a marking's texture: its text, size and baseline start in texels, whether it is a name line, and whether it is turned to read upward. */
  interface InkItem {
    text: string;
    size: number;
    x: number;
    y: number;
    name: boolean;
    turned: boolean;
  }

  /**
   * Paints `items` as laser-etched ink on a transparent canvas: white
   * letters, a shade darker toward their tops, streaked faintly across. The
   * material's colour tints them.
   */
  function paintInk(
    ctx: CanvasRenderingContext2D,
    items: InkItem[],
    cw: number,
    ch: number,
    seed: number,
  ) {
    ctx.clearRect(0, 0, cw, ch);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    for (const item of items) {
      setMarkFont(ctx, item.size);
      ctx.save();
      ctx.translate(item.x, item.y);
      if (item.turned) ctx.rotate(-Math.PI / 2);
      const shade = ctx.createLinearGradient(0, -item.size * 0.74, 0, 0);
      shade.addColorStop(0, "#d6d6d6");
      shade.addColorStop(1, "#ffffff");
      ctx.fillStyle = shade;
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    }
    const random = seeded(seed);
    ctx.globalCompositeOperation = "source-atop";
    for (let y = 0; y < ch; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${(random() * 0.12).toFixed(3)})`;
      ctx.fillRect(0, y, cw, 1 + random());
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** The glow over the name lines in `items`: white and blurred, on a canvas `scale` of the ink's. */
  function paintGlow(
    ctx: CanvasRenderingContext2D,
    items: InkItem[],
    cw: number,
    scale: number,
  ) {
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const away = cw * 4;
    ctx.shadowColor = "#fff";
    ctx.shadowOffsetX = away;
    ctx.fillStyle = "#fff";
    for (const item of items) {
      if (!item.name) continue;
      setMarkFont(ctx, item.size * scale);
      for (const blur of [item.size * scale * 0.4, item.size * scale * 0.14]) {
        ctx.shadowBlur = blur;
        ctx.fillText(item.text, item.x * scale - away, item.y * scale);
      }
    }
    ctx.shadowColor = "transparent";
  }

  /** Where a length `inner` starts inside a span `outer` set at `edge`. */
  const inset = (
    outer: number,
    inner: number,
    edge: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) =>
    edge === "center" || edge === "middle"
      ? (outer - inner) / 2
      : edge === "right" || edge === "bottom"
        ? outer - inner
        : 0;

  /**
   * Paints every marking: sets its name and part number in its room
   * (fitMarking), paints its ink and its name's glow, and sizes and places
   * its plane so the block meets the anchor at its `align` and `valign`
   * edges.
   */
  function paintMarkings() {
    const cap = markCap();
    const margin = MARK_MARGIN * MARK_TEXEL;
    MARKINGS.forEach((entry, order) => {
      const { mesh, glow, options } = entry;
      const node = NODE.get(entry.node)!;
      const fit = fitMarking(
        (options.text ?? node.label).toUpperCase(),
        entry.name && options.code !== false ? partNumber(node) : "",
        options.width,
        options.height,
        markWidth,
        cap,
        { side: options.code === "side", max: options.max },
      );
      if (!fit.lines.length) return;
      const align = options.align ?? "left";
      const valign = options.valign ?? "top";
      const blockW = fit.width * MARK_TEXEL;
      const blockH = fit.height * MARK_TEXEL;
      const cw = Math.ceil(blockW + 2 * margin);
      const ch = Math.ceil(blockH + 2 * margin);
      const items: InkItem[] = [];
      /** Adds `text` at `size` ems, its baseline starting `x`, `y` ems into the block. */
      const place = (
        text: string,
        size: number,
        x: number,
        y: number,
        name: boolean,
        turned = false,
      ) =>
        items.push({
          text,
          size: size * MARK_TEXEL,
          x: margin + x * MARK_TEXEL,
          y: margin + y * MARK_TEXEL,
          name,
          turned,
        });
      const nameH = cap + (fit.lines.length - 1) * MARK_PITCH + MARK_FOOT;
      const nameW = fit.side
        ? fit.width - CODE_SIDE_GAP - cap * fit.codeScale
        : fit.width;
      const nameTop = fit.side ? inset(fit.height, nameH, valign) : 0;
      fit.lines.forEach((line, i) =>
        place(
          line,
          1,
          inset(nameW, markWidth(line), align),
          nameTop + cap + i * MARK_PITCH,
          true,
        ),
      );
      if (fit.code) {
        const length = markWidth(fit.code) * fit.codeScale;
        if (fit.side) {
          const top = inset(fit.height - MARK_FOOT, length, valign);
          place(fit.code, fit.codeScale, fit.width, top + length, false, true);
        } else {
          place(
            fit.code,
            fit.codeScale,
            inset(fit.width, length, align),
            nameTop + nameH - MARK_FOOT + CODE_GAP,
            false,
          );
        }
      }

      const ink = surface2d(cw, ch);
      paintInk(ink.ctx, items, cw, ch, entry.node.length * 7 + order);
      const texture = canvasTexture(ink.surface);
      mesh.material.map = texture;
      mesh.material.emissiveMap = texture;
      mesh.material.visible = true;
      mesh.material.needsUpdate = true;
      const halo = surface2d(
        Math.max(8, Math.round(cw * GLOW_SCALE)),
        Math.max(8, Math.round(ch * GLOW_SCALE)),
      );
      paintGlow(halo.ctx, items, halo.surface.width, GLOW_SCALE);
      glow.material.map = canvasTexture(halo.surface);
      glow.material.visible = true;
      glow.material.needsUpdate = true;

      // The plane's size in units, and the anchor's place on the block in texels.
      const sizeX = (cw / MARK_TEXEL) * fit.em;
      const sizeY = (ch / MARK_TEXEL) * fit.em;
      const ax =
        margin +
        (align === "center" ? blockW / 2 : align === "right" ? blockW : 0);
      const ay =
        margin +
        (valign === "middle" ? blockH / 2 : valign === "bottom" ? blockH : 0);
      mesh.scale.set(sizeX, sizeY, 1);
      mesh.position.set(
        -(ax / cw - 0.5) * sizeX,
        -(0.5 - ay / ch) * sizeY,
        0.002,
      );
      mesh.updateMatrixWorld(true);
    });
  }

  /**
   * Sets a marking's ink between its idle, passed and lit finishes; `pulse`
   * (0 to 1) pulses the lit ink and its glow. Its `metal` share scales the
   * metalness: ink on a face turned to the viewer keeps less, so it does not
   * mirror the fill light.
   */
  function setInk(entry: Marking, passed: number, lit: number, pulse: number) {
    const { idle, passed: inlay, lit: hot } = entry.ink;
    const material = entry.mesh.material;
    material.color
      .copy(idle.color)
      .lerp(inlay.color, passed)
      .lerp(hot.color, lit);
    material.metalness =
      mix(mix(idle.metalness, inlay.metalness, passed), hot.metalness, lit) *
      entry.metal;
    material.roughness =
      mix(mix(idle.roughness, inlay.roughness, passed), hot.roughness, lit) +
      0.3 * (1 - entry.metal);
    material.emissiveIntensity =
      mix(
        mix(idle.emissive, inlay.emissive, passed),
        hot.emissive * (0.75 + 0.35 * pulse),
        lit,
      ) * ILLUMINATION;
    entry.glow.material.opacity = lit * (0.65 + 0.35 * pulse) * ILLUMINATION;
  }

  /* ---------- Parts ---------- */
  const none = () => {};

  /**
   * qfp: a QFP controller in a black moulded body on metal gull-wing leads,
   * its marking at its top-left clear of the pin-1 dimple, beside its
   * crystal and load capacitors, a SOIC flash, a SOT-23 regulator and its
   * decoupling capacitors.
   */
  function buildQfp(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const [plan] = markPlans("qfp", w, d);
    const { face } = plan!;
    const reach = QFP_REACH;
    const bw = face.right - face.left;
    const bd = face.bottom - face.top;
    const bx = (face.left + face.right) / 2;
    const chip = qfp(
      bw,
      bd,
      partFinish(node, "epoxy"),
      partFinish(node, "lead"),
      { reach },
    );
    chip.group.position.x = bx;
    object.add(contactShadow(bw + 0.3, bd + 0.3, bx, 0), chip.group);
    object.add(
      markOnTop(node, plan!.rooms[0]!, chip.top, {
        on: "epoxy",
        max: MARK_EM,
        ...CENTRED,
      }),
    );
    const rx = bx + bw / 2 + reach + 0.24;
    const right = w / 2 - 0.12;
    const xtal = crystal(1.2, 0.44);
    xtal.position.set(rx + 0.66, 0, -d / 2 + 0.44);
    const flash = soic(0.95, 0.6, 4);
    flash.position.set(rx + 0.62, 0, d / 2 - 0.58);
    const regulator = sot23();
    regulator.position.set(right - 0.3, 0, 0.1);
    object.add(
      contactShadow(1.3, 0.52, rx + 0.66, -d / 2 + 0.44, 0.5),
      xtal,
      contactShadow(1.0, 0.9, rx + 0.62, d / 2 - 0.58, 0.45),
      flash,
      regulator,
      passives(
        [
          [rx + 1.58, -d / 2 + 0.3],
          [rx + 1.58, -d / 2 + 0.6],
          [rx + 1.58, 0.3, Math.PI / 2],
          [rx + 1.58, 0.62, Math.PI / 2],
          [rx + 1.58, 0.94, Math.PI / 2],
          [right - 0.3, -0.42],
          [right - 0.3, 0.62],
          [right - 0.3, 0.92],
        ],
        [0.2, 0.09, 0.11],
      ),
    );
    return { object, update: none };
  }

  /**
   * bga: a BGA accelerator, its black moulded cap over an organic substrate
   * on a ring of metal solder balls, its marking at the cap's top-left clear
   * of the pin-1 dimple, beside two power chokes, a polymer capacitor and
   * decoupling.
   */
  function buildBga(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const [plan] = markPlans("bga", w, d);
    const { face } = plan!;
    const cw = face.right - face.left;
    const cd = face.bottom - face.top;
    const sx = (face.left + face.right) / 2;
    const sw = cw + 0.66;
    const sd = cd + 0.66;
    const chip = bga(
      sw,
      sd,
      cw,
      cd,
      partFinish(node, "epoxy"),
      partFinish(node, "lead"),
    );
    chip.group.position.x = sx;
    object.add(contactShadow(sw + 0.1, sd + 0.1, sx, 0), chip.group);
    object.add(
      markOnTop(node, plan!.rooms[0]!, chip.top, { on: "epoxy", ...CENTRED }),
    );
    const px = sx + sw / 2 + 0.28;
    const cx = px + 0.55;
    const mark = chokeMark();
    for (const z of [-d / 2 + 0.55, -d / 2 + 1.55]) {
      object.add(
        contactShadow(0.86, 0.86, cx, z, 0.5),
        choke(cx, z, 0.86, 0.6, mark),
      );
    }
    object.add(
      smdCan(cx, d / 2 - 0.55, 0.34, 0.66),
      contactShadow(0.76, 0.76, cx, d / 2 - 0.55, 0.45),
    );
    const column: Spot[] = [];
    for (let k = 0; -d / 2 + 0.35 + k * 0.42 <= d / 2 - 0.2 && k < 7; k++) {
      column.push([w / 2 - 0.26, -d / 2 + 0.35 + k * 0.42, Math.PI / 2]);
    }
    object.add(passives(column, [0.2, 0.09, 0.11]));
    return { object, update: none };
  }

  /**
   * socket: a black moulded QFP in an open-top test socket, its amber frame
   * round the package, metal contacts under every lead, screws and
   * alignment pins at its corners, and the socket's steel lever along its
   * right end.
   */
  function buildSocket(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "epoxy");
    const lead = partFinish(node, "lead");
    const [plan] = markPlans("socket", w, d);
    const { face } = plan!;
    const lever = SOCKET_LEVER;
    const sw = w - lever - 0.06;
    const sd = d - 0.06;
    const sx = (face.left + face.right) / 2;
    const baseH = 0.2;
    object.add(contactShadow(sw, sd, sx, 0, 0.6));
    object.add(slab(sw, baseH, sd, 0.05, blackPlastic, sx, 0));
    const reach = QFP_REACH;
    const bw = face.right - face.left;
    const bd = face.bottom - face.top;
    const windowW = bw + 2 * reach + 0.16;
    const windowD = bd + 2 * reach + 0.16;
    const frameH = 0.22;
    const frame = roundedRect(
      -sw / 2 + 0.05,
      -sd / 2 + 0.05,
      sw / 2 - 0.05,
      sd / 2 - 0.05,
      0.1,
    );
    frame.holes.push(
      roundedHole(-windowW / 2, -windowD / 2, windowW / 2, windowD / 2, 0.05),
    );
    const frameGeometry = new THREE.ExtrudeGeometry(frame, {
      depth: frameH - 0.04,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
      curveSegments: 6,
    });
    frameGeometry.rotateX(-Math.PI / 2);
    object.add(solid(frameGeometry, pei, sx, baseH + 0.02, 0));
    const contact = new THREE.BoxGeometry(0.2, 0.026, 0.05);
    contact.translate(reach - 0.06, 0.013, 0);
    object.add(
      instances(
        contact,
        lead,
        leadSpots(bw, bd, 0.15, 0.22).map(([x, z, turn]): Spot => [
          sx + x,
          z,
          turn,
        ]),
        baseH,
      ),
    );
    const chip = qfp(bw, bd, body, lead, { reach });
    chip.group.position.set(sx, baseH + 0.026, 0);
    object.add(chip.group);
    const top = baseH + 0.026 + chip.top;
    object.add(
      markOnTop(node, plan!.rooms[0]!, top, { on: "epoxy", ...CENTRED }),
    );
    const frameTop = baseH + frameH;
    for (const ix of [-1, 1]) {
      for (const iz of [-1, 1]) {
        object.add(
          screw(
            sx + ix * (sw / 2 - 0.3),
            frameTop,
            iz * (sd / 2 - 0.3),
            0.4 + ix * 0.5 + iz * 0.3,
          ),
        );
      }
    }
    for (const [ix, iz] of [
      [-1, -1],
      [1, 1],
    ] as const) {
      object.add(
        solid(
          new THREE.CylinderGeometry(0.06, 0.07, 0.12, 16),
          lead,
          sx + ix * (windowW / 2 + 0.22),
          frameTop + 0.06,
          iz * 0.62,
        ),
      );
    }
    const lx = w / 2 - lever / 2 + 0.04;
    object.add(
      slab(lever - 0.14, 0.3, 0.6, 0.05, blackPlastic, lx, 0, -d / 2 + 0.34),
    );
    object.add(
      slab(lever - 0.3, 0.16, d - 0.7, 0.04, blackPlastic, lx, 0, 0.2),
    );
    const rod = new THREE.CylinderGeometry(0.05, 0.05, d - 0.5, 16);
    rod.rotateX(Math.PI / 2);
    object.add(solid(rod, steel, lx + 0.12, 0.38, 0.03));
    object.add(
      solid(
        new THREE.CylinderGeometry(0.06, 0.06, 0.42, 16),
        steel,
        lx + 0.12,
        0.38 + 0.21,
        d / 2 - 0.22,
      ),
    );
    object.add(
      solid(
        new THREE.SphereGeometry(0.11, 18, 12),
        steel,
        lx + 0.12,
        0.82,
        d / 2 - 0.22,
      ),
    );
    object.add(slab(0.28, 0.2, 0.16, 0.03, steel, lx - 0.22, 0, d / 2 - 0.2));
    return { object, update: none };
  }

  /**
   * die: a bare iridescent die flip-chipped onto a black moulded substrate
   * on metal solder balls, inside a brushed metal stiffener ring, capacitor
   * arrays either side, the package on its interposer socket, the marking
   * on the die.
   */
  function buildDie(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "metal");
    const baseH = 0.24;
    object.add(contactShadow(w, d, 0, 0, 0.55));
    object.add(slab(w, baseH, d, 0.05, blackPlastic));
    const sw = w - 0.12;
    const sd = d - 0.12;
    const balls: Spot[] = [];
    for (let x = -sw / 2 + 0.12; x <= sw / 2 - 0.11; x += 0.17) {
      balls.push([x, sd / 2 - 0.12], [x, -sd / 2 + 0.12]);
    }
    object.add(instances(BALL, partFinish(node, "lead"), balls, baseH + 0.06));
    object.add(
      slab(sw, 0.1, sd, 0.02, partFinish(node, "epoxy"), 0, baseH + 0.11),
    );
    const deck = baseH + 0.21;
    const ring = roundedRect(
      -sw / 2 + 0.04,
      -sd / 2 + 0.04,
      sw / 2 - 0.04,
      sd / 2 - 0.04,
      0.08,
    );
    ring.holes.push(
      roundedHole(
        -sw / 2 + 0.24,
        -sd / 2 + 0.24,
        sw / 2 - 0.24,
        sd / 2 - 0.24,
        0.04,
      ),
    );
    const ringGeometry = new THREE.ExtrudeGeometry(ring, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 1,
      curveSegments: 6,
    });
    ringGeometry.rotateX(-Math.PI / 2);
    object.add(solid(ringGeometry, body, 0, deck + 0.015, 0));
    const [plan] = markPlans("die", w, d);
    const { face } = plan!;
    const dieW = face.right - face.left;
    const dieD = face.bottom - face.top;
    const dx = (face.left + face.right) / 2;
    object.add(slab(dieW + 0.14, 0.04, dieD + 0.14, 0.03, mould, dx, deck));
    object.add(
      slab(
        dieW,
        0.12,
        dieD,
        0.012,
        partFinish(node, "silicon"),
        dx,
        deck + 0.035,
      ),
    );
    const top = deck + 0.155;
    object.add(
      markOnTop(node, plan!.rooms[0]!, top, { on: "silicon", ...CENTRED }),
    );
    const spots: Spot[] = [];
    const inner = sw / 2 - 0.3;
    for (let x = -inner + 0.18; x < dx - dieW / 2 - 0.2; x += 0.34) {
      for (let z = -dieD / 2 + 0.12; z <= dieD / 2 - 0.1; z += 0.34) {
        spots.push([x, z, Math.PI / 2]);
      }
    }
    for (let z = -dieD / 2 + 0.12; z <= dieD / 2 - 0.1; z += 0.34) {
      spots.push([dx + dieW / 2 + 0.28, z, Math.PI / 2]);
    }
    const caps = passives(spots, [0.16, 0.07, 0.08]);
    caps.position.y = deck;
    object.add(caps);
    return { object, update: none };
  }

  /** A canvas texture of gold fingers: bright pads with dark gaps, `count` across. */
  function fingerTexture(count: number) {
    const { surface, ctx } = surface2d(512, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 512, 4);
    ctx.fillStyle = "#2a2418";
    const pitch = 512 / count;
    for (let x = 0; x < 512; x += pitch) ctx.fillRect(x, 0, pitch * 0.28, 4);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * memory: two registered DIMMs in latching slots, leaning back LEAN so
   * their faces turn to the viewer: each a green module with ten black DRAM
   * packages, five either side of its register chip, a brushed metal heat
   * spreader band clipped over its top edge above them, and metal contact
   * fingers at its slot; the marking centred on the front module's band.
   */
  function buildMemory(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const LEAN = 40 * DEG;
    const stickW = w - 0.52;
    const stickH = DIMM.h;
    const [plan] = markPlans("memory", w, d);
    const { face } = plan!;
    const fingers = partFinish(node, "lead", { map: fingerTexture(80) });
    const spreader = partFinish(node, "facing");
    const chip = partFinish(node, "epoxy", {
      envMap: roomEnvironment,
      envMapIntensity: 0.25,
    });
    /** The spreader band's span up the module, from a gap above the DRAMs to the module's top edge, and its width. */
    const bandFrom = -face.bottom;
    const bandH = face.bottom - face.top;
    const bandW = face.right - face.left;
    const plate = rbox(bandW, bandH, 0.035, 0.015);
    const clip = rbox(bandW, 0.05, 0.12, 0.015);
    const dram = mouldGeometry(DRAM.w, 0.07, DRAM.h, 0.012, 0.01).rotateX(
      Math.PI / 2,
    );
    const register = mouldGeometry(0.5, 0.07, 0.5, 0.012, 0.01).rotateX(
      Math.PI / 2,
    );
    const chips: Spot[] = [];
    for (let i = 0; i < 5; i++) {
      const x = DRAM.pitch * (i + 1);
      chips.push([-x, DRAM.y], [x, DRAM.y]);
    }
    [d / 2 - 0.68, d / 2 - 0.22].forEach((z, row) => {
      object.add(slab(w - 0.04, 0.28, 0.34, 0.04, blackPlastic, 0, 0, z));
      for (const side of [-1, 1]) {
        object.add(
          slab(0.18, 0.46, 0.3, 0.05, latchGrey, side * (w / 2 - 0.11), 0, z),
        );
      }
      const stick = new THREE.Group();
      stick.position.set(0, 0.2, z);
      stick.rotation.x = -LEAN;
      const drams = new THREE.InstancedMesh(dram, chip, chips.length);
      const matrix = new THREE.Matrix4();
      chips.forEach(([x, y], index) =>
        drams.setMatrixAt(index, matrix.makeTranslation(x, y, 0.025)),
      );
      drams.castShadow = true;
      drams.receiveShadow = true;
      stick.add(
        solid(
          new THREE.BoxGeometry(stickW, stickH, 0.05),
          facingGreen,
          0,
          stickH / 2,
          0,
        ),
        solid(
          new THREE.BoxGeometry(stickW - 0.26, 0.12, 0.054),
          fingers,
          0,
          0.1,
          0,
        ),
        drams,
        solid(register, chip, 0, DRAM.y, 0.025),
        solid(plate, spreader, 0, bandFrom + bandH / 2, 0.0425),
        solid(clip, spreader, 0, stickH + 0.02, 0.005),
      );
      if (row === 1) {
        stick.add(
          markOnFace(node, plan!.rooms[0]!, 0.06, {
            on: "facing",
            align: "center",
            valign: "middle",
            reflection: 0.15,
            metal: 0.6,
          }),
        );
      }
      object.add(stick);
    });
    return { object, update: none };
  }

  /**
   * gpu: a triple-fan graphics card standing in its PCIe slot. From above:
   * the brushed metal backplate's top flange carrying the marking, the metal
   * fin stack through the shroud's open top with four heat pipes looped in
   * U-bends across it, the power connector, and the shroud's front face
   * with its three fans toward the viewer.
   */
  function buildGpu(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "metal");
    const lead = partFinish(node, "lead");
    const thick = d - 0.1;
    const front = thick / 2;
    const height = 2.4;
    const lift = 0.32;
    const top = lift + height;
    const pcbZ = -front + 0.3;
    object.add(contactShadow(w, thick, 0, 0, 0.6));
    object.add(
      slab(w * 0.8, lift + 0.06, 0.44, 0.04, blackPlastic, -w * 0.08, 0, pcbZ),
    );
    object.add(
      solid(
        new THREE.BoxGeometry(w - 0.14, height - 0.08, 0.07),
        pcbBlack,
        0,
        lift + (height - 0.08) / 2,
        pcbZ,
      ),
    );
    object.add(
      slab(
        w - 0.06,
        height - 0.1,
        0.06,
        0.02,
        body,
        0,
        lift + 0.02,
        -front + 0.04,
      ),
    );
    const [plan] = markPlans("gpu", w, d);
    const flangeD = GPU_FLANGE;
    const [plugBox] = plan!.clear;
    object.add(
      slab(
        w - 0.06,
        0.06,
        flangeD,
        0.025,
        body,
        0,
        top - 0.06,
        -front + flangeD / 2,
      ),
    );
    const finFrom = -front + flangeD + 0.05;
    const finTo = front - 0.2;
    const finH = height - 0.42;
    const finCount = Math.round((w - 1.0) / 0.1);
    const fins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.022, finH, finTo - finFrom),
      body,
      finCount,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < finCount; i++) {
      matrix.makeTranslation(
        -w / 2 + 0.5 + (i * (w - 1.0)) / (finCount - 1),
        lift + 0.12 + finH / 2,
        (finFrom + finTo) / 2,
      );
      fins.setMatrixAt(i, matrix);
    }
    fins.castShadow = true;
    fins.receiveShadow = true;
    object.add(fins);
    const pipeY = lift + 0.12 + finH + 0.01;
    const pipeFrom = -w / 2 + 0.75;
    const pipeTo = w / 2 - 1.2;
    const lanes = [0, 1, 2, 3].map(
      (k) => finFrom + 0.2 + (k * (finTo - finFrom - 0.4)) / 3,
    );
    const pipe = new THREE.CylinderGeometry(0.07, 0.07, pipeTo - pipeFrom, 18);
    pipe.rotateZ(Math.PI / 2);
    for (const z of lanes)
      object.add(solid(pipe, lead, (pipeFrom + pipeTo) / 2, pipeY, z));
    for (const [a, b] of [
      [0, 3],
      [1, 2],
    ] as const) {
      const radius = (lanes[b]! - lanes[a]!) / 2;
      const bend = new THREE.TorusGeometry(radius, 0.07, 12, 24, Math.PI);
      bend.rotateX(Math.PI / 2).rotateY(Math.PI / 2);
      object.add(solid(bend, lead, pipeTo, pipeY, (lanes[a]! + lanes[b]!) / 2));
    }
    const radius = (height - 0.5) / 2;
    const fanX = [-w / 3, 0, w / 3];
    const faceShape = roundedRect(-w / 2, 0, w / 2, height, 0.14);
    for (const x of fanX) {
      const hole = new THREE.Path();
      hole.absarc(x, height / 2, radius + 0.05, 0, Math.PI * 2, true);
      faceShape.holes.push(hole);
    }
    const faceGeometry = new THREE.ExtrudeGeometry(faceShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 2,
      curveSegments: 40,
    });
    object.add(
      solid(faceGeometry, [gunmetal, blackPlastic], 0, lift, front - 0.125),
    );
    object.add(
      slab(w, 0.08, 0.26, 0.03, gunmetal, 0, top - 0.08, front - 0.13),
    );
    for (const side of [-1, 1]) {
      object.add(
        slab(
          0.4,
          height - 0.1,
          finTo - finFrom + 0.12,
          0.03,
          gunmetal,
          side * (w / 2 - 0.2),
          lift,
          (finFrom + finTo) / 2,
        ),
      );
    }
    object.add(
      slab(
        0.04,
        height + 0.2,
        thick + 0.04,
        0.01,
        steel,
        -w / 2 - 0.03,
        0.05,
        0,
      ),
    );
    const plug = new THREE.Group();
    plug.position.set(
      (plugBox!.left + plugBox!.right) / 2,
      top,
      (plugBox!.top + plugBox!.bottom) / 2,
    );
    plug.add(
      slab(
        plugBox!.right - plugBox!.left,
        0.28,
        plugBox!.bottom - plugBox!.top,
        0.04,
        blackPlastic,
      ),
    );
    const pinHoleGeometry = new THREE.PlaneGeometry(0.09, 0.09);
    for (let i = 0; i < 6; i++) {
      for (const row of [-1, 1]) {
        const pinHole = new THREE.Mesh(pinHoleGeometry, darkness);
        pinHole.rotation.x = -Math.PI / 2;
        pinHole.position.set(-0.3 + i * 0.12, 0.282, row * 0.08);
        plug.add(pinHole);
      }
    }
    object.add(plug);
    const accent = glowing(gold, 0xffa63a);
    object.add(
      solid(
        new THREE.BoxGeometry(w - 0.5, 0.02, 0.05),
        accent,
        0,
        top + 0.01,
        front - 0.06,
      ),
    );
    const blades = mergeGeometries(
      Array.from({ length: 9 }, (_, k) => {
        const blade = new THREE.BoxGeometry(radius - 0.22, 0.014, 0.26);
        blade.rotateX(0.42);
        blade.translate(0.22 + (radius - 0.22) / 2, 0, 0);
        blade.rotateY((k / 9) * Math.PI * 2);
        return blade;
      }),
    );
    const rimGeometry = new THREE.TorusGeometry(radius + 0.05, 0.022, 8, 64);
    const hubGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 32);
    const capGeometry = new THREE.CircleGeometry(0.16, 32);
    const rotors = fanX.map((x) => {
      const mount = new THREE.Group();
      mount.position.set(x, lift + height / 2, front - 0.08);
      mount.rotation.x = Math.PI / 2;
      const rotor = new THREE.Group();
      rotor.add(solid(blades, blackPlastic));
      rotor.add(solid(hubGeometry, gunmetal));
      const cap = new THREE.Mesh(capGeometry, accent);
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = 0.041;
      rotor.add(cap);
      mount.add(rotor);
      const rim = new THREE.Mesh(rimGeometry, accent);
      rim.position.set(x, lift + height / 2, front + 0.005);
      object.add(mount, rim);
      return rotor;
    });
    object.add(
      markOnTop(node, plan!.rooms[0]!, top, {
        on: "metal",
        max: MARK_EM,
        valign: "middle",
      }),
    );
    let speed = 0;
    return {
      object,
      update(dt, _t, lit, energy, passed) {
        speed += (lit * 9 + passed * 1.5 - speed) * (1 - Math.exp(-dt * 1.5));
        if (!still) {
          rotors.forEach(
            (rotor, index) =>
              (rotor.rotation.y -= dt * speed * (1 + index * 0.04)),
          );
        }
        accent.emissiveIntensity =
          (passed * 0.06 + lit * (0.55 + energy * 0.5)) * ILLUMINATION;
      },
    };
  }

  const QFN_PAD = new THREE.BoxGeometry(0.08, 0.03, 0.05).translate(
    0.02,
    0.015,
    0,
  );
  /**
   * trimmer: a bank of multi-turn trimmers in black moulded cases, five to
   * a row and as many rows (up to three) as the part's depth holds in front
   * of its tag, their metal adjusting screws turning while lit; beside
   * them, where the part is at least 4 units deep, the search controller (a
   * QFN with its crystal); the marking centred on a riveted metal tag along
   * the front, left of a 2 × 8 pin header.
   */
  function buildTrimmer(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "metal");
    const lead = partFinish(node, "lead");
    const cased = partFinish(node, "epoxy");
    const rows = trimmerRows(d);
    const roomy = d >= 4;
    if (roomy) {
      const qx = -w / 2 + 0.95;
      const qz = -d / 2 + 0.95;
      object.add(contactShadow(1.4, 1.4, qx, qz, 0.5));
      object.add(
        solid(mouldGeometry(1.3, 0.16, 1.3, 0.02, 0.01), mould, qx, 0.01, qz),
      );
      object.add(
        instances(
          QFN_PAD,
          lead,
          leadSpots(1.3, 1.3, 0.13, 0.2).map(([x, z, turn]): Spot => [
            qx + x,
            qz + z,
            turn,
          ]),
        ),
      );
      const dot = new THREE.Mesh(SMALL_DOT, dimple);
      dot.position.set(qx - 0.5, 0.171, qz + 0.5);
      object.add(dot);
      const xtal = crystal(1.1, 0.42);
      xtal.position.set(qx, 0, -d / 2 + 2.1);
      object.add(xtal, contactShadow(1.2, 0.5, qx, -d / 2 + 2.1, 0.45));
      object.add(
        passives(
          [
            [qx - 0.45, qz + 0.9],
            [qx + 0.1, qz + 0.9],
            [qx + 0.65, qz + 0.9],
            [qx - 0.5, -d / 2 + 2.6],
            [qx + 0.5, -d / 2 + 2.6],
          ],
          [0.2, 0.09, 0.11],
        ),
      );
    }
    const x0 = roomy ? -w / 2 + 2.45 : -w / 2 + 0.75;
    const z0 = -d / 2 + TRIM_ROW.back;
    const slot = new THREE.BoxGeometry(0.2, 0.03, 0.035);
    const head = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 24);
    const valueMaterial = new THREE.MeshStandardMaterial({
      map: markingTexture([["103", 44, 700]], { width: 192, height: 96 }),
      transparent: true,
      depthWrite: false,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const screws: THREE.Group[] = [];
    const cases: Spot[] = [];
    object.add(
      contactShadow(
        5.2 + 0.95,
        (rows - 1) * TRIM_ROW.pitch + 0.5,
        x0 + 2.6,
        z0 + ((rows - 1) * TRIM_ROW.pitch) / 2,
        0.45,
      ),
    );
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 5; col++) {
        const x = x0 + col * 1.3;
        const z = z0 + row * TRIM_ROW.pitch;
        cases.push([x, z]);
        const screwHead = new THREE.Group();
        screwHead.position.set(x + 0.26, 0.95, z);
        screwHead.add(solid(head, lead, 0, 0.04, 0));
        const cut = new THREE.Mesh(slot, darkness);
        cut.position.y = 0.082;
        cut.rotation.y = (row * 5 + col) * 0.7;
        screwHead.add(cut);
        object.add(screwHead);
        screws.push(screwHead);
      }
    }
    object.add(instances(rbox(0.95, 0.95, 0.5, 0.04), cased, cases, 0.475));
    const values = instances(
      new THREE.PlaneGeometry(0.36, 0.18).rotateX(-Math.PI / 2),
      valueMaterial,
      cases.map(([x, z]): Spot => [x - 0.16, z]),
      0.952,
    );
    values.castShadow = false;
    object.add(values);
    const hx = w / 2 - HEADER.inset;
    const hz = d / 2 - 0.7;
    // The tag fills the strip between the bank's front row and the part's
    // front edge, from the part's left edge to TAG.gap short of the HEADER.
    const [plan] = markPlans("trimmer", w, d);
    const { face: tag } = plan!;
    const tagW = tag.right - tag.left;
    const tagD = tag.bottom - tag.top;
    const tagX = (tag.left + tag.right) / 2;
    const tagZ = (tag.top + tag.bottom) / 2;
    const tagH = 0.05;
    object.add(
      contactShadow(tagW, tagD, tagX, tagZ, 0.35),
      slab(tagW, tagH, tagD, 0.04, body, tagX, 0, tagZ),
    );
    for (const rivet of plan!.clear) {
      object.add(
        solid(
          RIVET,
          lead,
          (rivet.left + rivet.right) / 2,
          tagH,
          (rivet.top + rivet.bottom) / 2,
        ),
      );
    }
    object.add(
      markOnTop(node, plan!.rooms[0]!, tagH, {
        on: "metal",
        max: MARK_EM,
        align: "center",
        valign: "middle",
      }),
    );
    object.add(slab(HEADER.w, 0.24, HEADER.d, 0.02, blackPlastic, hx, 0, hz));
    const pins: Spot[] = [];
    for (let i = 0; i < 8; i++) {
      pins.push(
        [hx - 0.77 + i * 0.22, hz - 0.11],
        [hx - 0.77 + i * 0.22, hz + 0.11],
      );
    }
    object.add(
      instances(
        new THREE.BoxGeometry(0.06, 0.6, 0.06).translate(0, 0.3, 0),
        lead,
        pins,
        0,
      ),
    );
    object.add(
      passives(
        [
          [hx - 0.6, hz - 0.62],
          [hx - 0.2, hz - 0.62],
          [hx + 0.2, hz - 0.62],
          [hx + 0.6, hz - 0.62],
        ],
        [0.2, 0.09, 0.11],
      ),
    );
    return {
      object,
      update(dt, _t, lit) {
        if (still) return;
        screws.forEach(
          (screwHead, index) =>
            (screwHead.rotation.y += dt * lit * (1.4 + (index % 5) * 0.5)),
        );
      },
    };
  }

  /**
   * rj45: a ganged 1 × 4 RJ45 jack under one brushed metal shield, each
   * port with its contacts and its link and activity LEDs in the shield's
   * front, spring fingers along the front edge, embossed ribs and dimples
   * on top, and the marking etched into the shield's top between them, its
   * part number turned along the shield's right edge.
   */
  function buildRj45(node: Placed): Part {
    const { d } = node;
    const object = new THREE.Group();
    const shield = partFinish(node, "metal");
    const [plan] = markPlans("rj45", node.w, d);
    const { face } = plan!;
    const PORTS = RJ45.ports;
    const pitch = RJ45.pitch;
    const jw = face.right - face.left;
    const jd = face.bottom - face.top;
    const jh = 1.36;
    const front = jd / 2;
    object.add(contactShadow(jw, jd, 0, 0, 0.6));
    object.add(
      slab(jw - 0.08, jh - 0.06, jd - 0.46, 0.03, blackPlastic, 0, 0, -0.22),
    );
    object.add(
      slab(jw - 0.08, 0.14, 0.44, 0.02, blackPlastic, 0, 0, front - 0.24),
    );
    object.add(slab(jw, 0.04, jd, 0.015, shield, 0, jh - 0.04, 0));
    for (const side of [-1, 1]) {
      object.add(
        slab(0.04, jh - 0.04, jd, 0.012, shield, side * (jw / 2 - 0.02), 0, 0),
      );
    }
    object.add(slab(jw, jh - 0.02, 0.04, 0.012, shield, 0, 0, -jd / 2 + 0.02));
    const plate = roundedRect(
      -jw / 2 + 0.04,
      0,
      jw / 2 - 0.04,
      jh - 0.04,
      0.02,
    );
    const link = glowing(
      new THREE.MeshPhysicalMaterial({
        color: 0x2b2416,
        roughness: 0.2,
        clearcoat: 1,
      }),
      0xffb54a,
    );
    const activity: THREE.MeshPhysicalMaterial[] = [];
    const contacts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.04, 0.014, 0.22).rotateX(0.55),
      partFinish(node, "lead"),
      PORTS * 8,
    );
    const place = new THREE.Matrix4();
    const lamp = new THREE.BoxGeometry(0.26, 0.14, 0.04);
    for (let i = 0; i < PORTS; i++) {
      const cx = -jw / 2 + 0.06 + pitch * (i + 0.5);
      const opening = new THREE.Path();
      opening.moveTo(cx - 0.6, 0.3);
      opening.lineTo(cx - 0.6, 1.0);
      opening.lineTo(cx + 0.6, 1.0);
      opening.lineTo(cx + 0.6, 0.3);
      opening.lineTo(cx + 0.22, 0.3);
      opening.lineTo(cx + 0.22, 0.17);
      opening.lineTo(cx - 0.22, 0.17);
      opening.lineTo(cx - 0.22, 0.3);
      opening.closePath();
      plate.holes.push(opening);
      for (const side of [-1, 1]) {
        plate.holes.push(
          roundedHole(
            cx + side * 0.55 - 0.14,
            1.08,
            cx + side * 0.55 + 0.14,
            1.24,
            0.02,
          ),
        );
      }
      for (let k = 0; k < 8; k++) {
        contacts.setMatrixAt(
          i * 8 + k,
          place.makeTranslation(cx - 0.42 + k * 0.12, 0.92, front - 0.2),
        );
      }
      const blink = glowing(
        new THREE.MeshPhysicalMaterial({
          color: 0x18261a,
          roughness: 0.2,
          clearcoat: 1,
        }),
        0x7dff9a,
      );
      activity.push(blink);
      for (const [side, material] of [
        [-1, link],
        [1, blink],
      ] as const) {
        object.add(solid(lamp, material, cx + side * 0.55, 1.16, front - 0.04));
      }
    }
    object.add(contacts);
    const plateGeometry = new THREE.ExtrudeGeometry(plate, {
      depth: 0.04,
      bevelEnabled: false,
      curveSegments: 6,
    });
    object.add(solid(plateGeometry, shield, 0, 0, front - 0.04));
    const fingers: Spot[] = [];
    for (let x = -jw / 2 + 0.2; x < jw / 2 - 0.1; x += 0.3)
      fingers.push([x, front - 0.07]);
    const finger = new THREE.BoxGeometry(0.16, 0.025, 0.12);
    finger.rotateX(0.35);
    object.add(instances(finger, shield, fingers, jh + 0.004));
    const ribZ = face.top + RJ45.rib.inset;
    const dimpleZ = face.bottom - RJ45.dimple.inset;
    const ribs: Spot[] = [];
    const dimples: Spot[] = [];
    for (let i = 0; i < PORTS; i++) {
      const cx = -jw / 2 + 0.06 + pitch * (i + 0.5);
      ribs.push([cx, ribZ]);
      dimples.push(
        [cx - RJ45.dimple.x, dimpleZ],
        [cx + RJ45.dimple.x, dimpleZ],
      );
    }
    object.add(
      instances(
        new THREE.BoxGeometry(RJ45.rib.w, 0.014, RJ45.rib.d),
        shield,
        ribs,
        jh + 0.007,
      ),
    );
    object.add(
      instances(
        new THREE.SphereGeometry(
          RJ45.dimple.r,
          14,
          6,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ).scale(1, 0.3, 1),
        shield,
        dimples,
        jh,
      ),
    );
    object.add(
      markOnTop(node, plan!.rooms[0]!, jh, {
        on: "metal",
        code: "side",
        ...CENTRED,
      }),
    );
    return {
      object,
      update(_dt, t, lit, _energy, passed) {
        link.emissiveIntensity = (passed * 0.8 + lit * 2.2) * ILLUMINATION;
        activity.forEach((material, index) => {
          const phase = t * (11 + index * 2.3) + index * 1.7;
          const blink =
            Math.sin(phase) > 0.2 || Math.sin(phase * 0.31) > 0.7 ? 1 : 0.15;
          material.emissiveIntensity =
            lit * (still ? 1.4 : blink * 2.2) * ILLUMINATION;
        });
      },
    };
  }

  /**
   * radio: a radio module on its header, castellated along both long edges,
   * a brushed metal shield can with an embossed rim and the marking etched
   * inside it, its part number turned along the marking's right edge, a
   * meander antenna and a u.FL socket on the module's free end, beside an
   * SMA jack and a rubber whip antenna standing on it.
   */
  function buildRadio(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const can = partFinish(node, "metal");
    const lead = partFinish(node, "lead");
    const [plan] = markPlans("radio", w, d);
    const { face } = plan!;
    const antennaW = RADIO.antenna;
    const mw = w - antennaW - 0.05;
    const mx = -w / 2 + mw / 2;
    object.add(contactShadow(mw, d, mx, 0, 0.6));
    object.add(slab(mw - 0.12, 0.2, d - 0.2, 0.03, blackPlastic, mx, 0));
    object.add(slab(mw, 0.07, d, 0.02, pcbBlack, mx, 0.2));
    const count = Math.floor(mw / 0.3);
    const castellations: Spot[] = [];
    for (let i = 0; i < count; i++) {
      const x = mx - mw / 2 + 0.2 + (i * (mw - 0.4)) / (count - 1);
      castellations.push([x, d / 2 + 0.01], [x, -d / 2 - 0.01]);
    }
    object.add(
      instances(
        new THREE.BoxGeometry(0.12, 0.09, 0.05),
        lead,
        castellations,
        0.235,
      ),
    );
    const canW = face.right - face.left;
    const canD = face.bottom - face.top;
    const cx = (face.left + face.right) / 2;
    object.add(slab(canW, 0.4, canD, 0.04, can, cx, 0.27));
    const { outer, inner } = RADIO.rim;
    const rim = roundedRect(
      -canW / 2 + outer,
      -canD / 2 + outer,
      canW / 2 - outer,
      canD / 2 - outer,
      0.06,
    );
    rim.holes.push(
      roundedHole(
        -canW / 2 + inner,
        -canD / 2 + inner,
        canW / 2 - inner,
        canD / 2 - inner,
        0.04,
      ),
    );
    const rimGeometry = new THREE.ExtrudeGeometry(rim, {
      depth: 0.012,
      bevelEnabled: false,
      curveSegments: 4,
    });
    rimGeometry.rotateX(-Math.PI / 2);
    object.add(solid(rimGeometry, can, cx, 0.67, 0));
    object.add(
      markOnTop(node, plan!.rooms[0]!, 0.67, {
        on: "metal",
        code: "side",
        ...CENTRED,
      }),
    );
    const freeLeft = cx + canW / 2 + 0.14;
    const freeRight = mx + mw / 2 - 0.1;
    const meander: THREE.Vector2[] = [];
    const legs = 4;
    for (let k = 0; k <= legs; k++) {
      const x = freeLeft + 0.05 + (k * (freeRight - freeLeft - 0.5)) / legs;
      const [z0, z1] =
        k % 2 ? [d / 2 - 0.35, -d / 2 + 0.35] : [-d / 2 + 0.35, d / 2 - 0.35];
      meander.push(new THREE.Vector2(x, z0), new THREE.Vector2(x, z1));
    }
    object.add(solid(ribbonGeometry(meander, 0.06, 0.008, 0.27), lead));
    const ux = freeRight - 0.18;
    object.add(slab(0.3, 0.05, 0.3, 0.01, lead, ux, 0.27, d / 2 - 0.4));
    object.add(
      solid(
        new THREE.CylinderGeometry(0.1, 0.1, 0.1, 20),
        lead,
        ux,
        0.37,
        d / 2 - 0.4,
      ),
    );
    const ax = w / 2 - antennaW / 2;
    object.add(
      solid(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 6), lead, ax, 0.08, 0),
    );
    object.add(
      solid(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 24), lead, ax, 0.31, 0),
    );
    object.add(
      solid(
        new THREE.CylinderGeometry(0.21, 0.23, 0.34, 24),
        rubber,
        ax,
        0.63,
        0,
      ),
    );
    object.add(
      solid(
        new THREE.CylinderGeometry(0.11, 0.17, 1.9, 24),
        rubber,
        ax,
        0.8 + 0.95,
        0,
      ),
    );
    const tip = glowing(
      new THREE.MeshPhysicalMaterial({
        color: 0x2b2416,
        roughness: 0.2,
        clearcoat: 1,
      }),
      0xffb54a,
    );
    object.add(solid(new THREE.SphereGeometry(0.12, 18, 12), tip, ax, 2.72, 0));
    return {
      object,
      update(_dt, _t, lit, energy, passed) {
        tip.emissiveIntensity =
          (passed * 0.4 + lit * (1.6 + energy)) * ILLUMINATION;
      },
    };
  }

  /**
   * secure: a secure element in a sealed ceramic package on its socket,
   * castellated along its long sides, its brushed metal lid seam-welded
   * inside a polished seal ring, the marking at the lid's top-left and a
   * bronze padlock emblem in its front-right corner, glowing faintly while
   * lit; beside it, two SOIC flash packages and their decoupling.
   */
  function buildSecure(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const lid = partFinish(node, "metal");
    const lead = partFinish(node, "lead");
    const pw = SECURE.w;
    const pd = d - 0.14;
    const px = -w / 2 + 0.1 + pw / 2;
    const baseH = 0.22;
    object.add(contactShadow(pw + 0.1, pd + 0.1, px, 0));
    object.add(slab(pw + 0.06, baseH, pd + 0.04, 0.05, blackPlastic, px, 0));
    const bh = 0.3;
    object.add(slab(pw, bh, pd, 0.04, ceramic, px, baseH));
    const count = Math.floor(pw / 0.36);
    const castellations: Spot[] = [];
    for (let i = 0; i < count; i++) {
      const x = px - pw / 2 + 0.24 + (i * (pw - 0.48)) / (count - 1);
      castellations.push([x, pd / 2 + 0.012], [x, -pd / 2 - 0.012]);
    }
    object.add(
      instances(
        new THREE.BoxGeometry(0.14, bh - 0.02, 0.05),
        lead,
        castellations,
        baseH + bh / 2,
      ),
    );
    const top = baseH + bh;
    const seal = roundedRect(
      -pw / 2 + 0.06,
      -pd / 2 + 0.06,
      pw / 2 - 0.06,
      pd / 2 - 0.06,
      0.06,
    );
    seal.holes.push(
      roundedHole(
        -pw / 2 + 0.16,
        -pd / 2 + 0.16,
        pw / 2 - 0.16,
        pd / 2 - 0.16,
        0.04,
      ),
    );
    const sealGeometry = new THREE.ExtrudeGeometry(seal, {
      depth: 0.022,
      bevelEnabled: false,
      curveSegments: 6,
    });
    sealGeometry.rotateX(-Math.PI / 2);
    object.add(solid(sealGeometry, lead, px, top, 0));
    const lidW = pw - 0.36;
    const lidD = pd - 0.36;
    object.add(slab(lidW, 0.06, lidD, 0.03, lid, px, top));
    const lidTop = top + 0.06;
    const emblem = new THREE.MeshPhysicalMaterial({
      color: 0x7a4c1a,
      metalness: 1,
      roughness: 0.32,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      emissive: new THREE.Color(0xff9a2a),
      emissiveIntensity: 0,
    });
    const [plan] = markPlans("secure", w, d);
    const [padlock] = plan!.clear;
    const lock = lockGeometry(SECURE.lock);
    const { min } = lock.boundingBox!;
    object.add(
      solid(lock, emblem, padlock!.left - min.x, lidTop, padlock!.top - min.z),
    );
    // The marking takes the room of the plan's that sets it larger, keeping
    // its part number where either does.
    const fits = plan!.rooms.map((room) =>
      fitMarking(
        node.label.toUpperCase(),
        partNumber(node),
        room.right - room.left,
        room.bottom - room.top,
        markWidth,
        markCap(),
      ),
    );
    const rank = (fit: MarkFit) => Number(!!fit.code) * 10 + fit.em;
    const best = fits.reduce(
      (chosen, fit, index) =>
        rank(fit) > rank(fits[chosen]!) ? index : chosen,
      0,
    );
    object.add(
      markOnTop(node, plan!.rooms[best]!, lidTop, { on: "metal", ...CENTRED }),
    );
    const fx = px + pw / 2 + 0.25;
    for (const [x, z] of [
      [fx + 0.7, -0.45],
      [fx + 2.05, -0.45],
    ] as const) {
      const flash = soic(0.95, 0.6, 4);
      flash.position.set(x, 0, z);
      object.add(contactShadow(1.0, 0.9, x, z, 0.45), flash);
    }
    object.add(
      passives(
        [
          [fx + 0.4, 0.55],
          [fx + 0.8, 0.55],
          [fx + 1.2, 0.55],
          [fx + 1.6, 0.55],
          [fx + 2.0, 0.55],
          [fx + 2.4, 0.55],
          [fx + 0.6, 0.9],
          [fx + 2.2, 0.9],
        ],
        [0.2, 0.09, 0.11],
      ),
    );
    return {
      object,
      update(_dt, _t, lit, energy, passed) {
        emblem.emissiveIntensity =
          (passed * 0.03 + lit * (0.12 + energy * 0.2)) * ILLUMINATION;
      },
    };
  }

  /** A lamp bezel's turned profile: a chromed ring BEZEL_R round the lens, standing on y = 0. */
  const BEZEL = new THREE.LatheGeometry(
    [
      [0.17, 0],
      [0.3, 0],
      [BEZEL_R, 0.02],
      [0.3, 0.09],
      [0.26, 0.12],
      [0.2, 0.12],
      [0.18, 0.1],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    40,
  );
  /**
   * toggle: a bat-handle toggle through a chamfered brushed metal panel on
   * polished standoffs: hex nut, keyed washer and threaded bushing; an
   * indicator lamp in a chromed bezel either side, the one the toggle
   * selects lit, with its A or B legend; a slide fader along the front over
   * an engraved scale; cap screws at the corners and the marking at the
   * panel's top-left.
   */
  function buildToggle(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "metal");
    const lead = partFinish(node, "lead");
    const pw = w - 0.06;
    const pd = d - 0.06;
    const rise = 0.26;
    const thick = 0.12;
    object.add(contactShadow(pw, pd, 0, 0, 0.55));
    const post = new THREE.CylinderGeometry(0.13, 0.13, rise, 6);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        object.add(
          solid(
            post,
            lead,
            sx * (pw / 2 - 0.32),
            rise / 2,
            sz * (pd / 2 - 0.32),
          ),
        );
      }
    }
    const panel = roundedRect(
      -pw / 2 + 0.04,
      -pd / 2 + 0.04,
      pw / 2 - 0.04,
      pd / 2 - 0.04,
      0.14,
    );
    const panelGeometry = new THREE.ExtrudeGeometry(panel, {
      depth: thick - 0.08,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 8,
    });
    panelGeometry.rotateX(-Math.PI / 2);
    object.add(solid(panelGeometry, body, 0, rise + 0.04, 0));
    const top = rise + thick;
    const capScrew = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 24);
    const socketGeometry = new THREE.CircleGeometry(0.05, 6).rotateX(
      -Math.PI / 2,
    );
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (pw / 2 - 0.32);
        const z = sz * (pd / 2 - 0.32);
        object.add(solid(capScrew, steel, x, top + 0.035, z));
        const socket = new THREE.Mesh(socketGeometry, darkness);
        socket.position.set(x, top + 0.071, z);
        object.add(socket);
      }
    }
    const [name, ...legends] = markPlans("toggle", w, d);
    const { x: tx, z: tz, lamp: lampX, tickD } = TOGGLE;
    object.add(
      solid(
        new THREE.CylinderGeometry(0.44, 0.44, 0.02, 40),
        steel,
        tx,
        top + 0.01,
        tz,
      ),
    );
    object.add(slab(0.12, 0.02, 0.1, 0.01, steel, tx, top + 0.02, tz - 0.48));
    object.add(
      solid(
        new THREE.CylinderGeometry(0.36, 0.36, 0.1, 6),
        steel,
        tx,
        top + 0.07,
        tz,
      ),
    );
    object.add(
      solid(
        new THREE.CylinderGeometry(0.22, 0.22, 0.3, 32),
        steel,
        tx,
        top + 0.27,
        tz,
      ),
    );
    const thread = new THREE.TorusGeometry(0.22, 0.016, 6, 32);
    thread.rotateX(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      object.add(solid(thread, steel, tx, top + 0.15 + i * 0.05, tz));
    }
    const pivot = new THREE.Group();
    pivot.position.set(tx, top + 0.42, tz);
    const bat = new THREE.CylinderGeometry(0.05, 0.08, 1.35, 20);
    bat.translate(0, 0.675, 0);
    pivot.add(solid(bat, steel));
    pivot.add(
      solid(new THREE.SphereGeometry(0.075, 16, 10), steel, 0, 1.35, 0),
    );
    object.add(pivot);
    const lamps: {
      lens: THREE.MeshPhysicalMaterial;
      halo: THREE.Sprite;
      side: number;
    }[] = [];
    const dome = new THREE.SphereGeometry(
      0.19,
      28,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    dome.scale(1, 0.6, 1);
    for (const [text, side, legend] of [
      ["A", -1, legends[0]!],
      ["B", 1, legends[1]!],
    ] as const) {
      const lx = tx + side * lampX;
      object.add(solid(BEZEL, steel, lx, top, tz));
      const lens = glowing(
        new THREE.MeshPhysicalMaterial({
          color: 0x3a2a12,
          roughness: 0.15,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        }),
        0xffb54a,
      );
      object.add(solid(dome, lens, lx, top + 0.08, tz));
      const halo = glowSprite(GOLD, 1.2);
      halo.position.set(lx, top + 0.25, tz);
      object.add(halo);
      lamps.push({ lens, halo, side });
      object.add(
        markOnTop(node, legend.rooms[0]!, top, {
          text,
          on: "metal",
          max: MARK_EM,
          align: "center",
        }),
      );
    }
    const left = -pw / 2 + 0.6;
    const fz = pd / 2 - 0.62;
    object.add(
      markOnTop(node, name!.rooms[0]!, top, { on: "metal", max: MARK_EM }),
    );
    const slotFrom = left;
    const slotTo = tx - lampX - 0.55;
    object.add(
      solid(
        new THREE.BoxGeometry(slotTo - slotFrom + 0.12, 0.012, 0.16),
        steel,
        (slotFrom + slotTo) / 2,
        top,
        fz,
      ),
    );
    object.add(
      solid(
        new THREE.BoxGeometry(slotTo - slotFrom + 0.04, 0.014, 0.07),
        darkness,
        (slotFrom + slotTo) / 2,
        top + 0.001,
        fz,
      ),
    );
    const ticks: Spot[] = [];
    for (let k = 0; k <= 10; k++) {
      ticks.push([
        slotFrom + (k * (slotTo - slotFrom)) / 10,
        fz - 0.2 - (k % 5 ? 0 : 0.04),
      ]);
    }
    object.add(
      instances(
        new THREE.BoxGeometry(0.018, 0.006, tickD),
        darkness,
        ticks,
        top + 0.003,
      ),
    );
    const fader = new THREE.Group();
    fader.position.set(slotFrom, top, fz);
    fader.add(slab(0.34, 0.24, 0.52, 0.06, aluminium, 0, 0.01, 0));
    const grip = new THREE.BoxGeometry(0.3, 0.02, 0.03);
    for (const dz of [-0.16, -0.08, 0.08, 0.16]) {
      fader.add(solid(grip, blackPlastic, 0, 0.255, dz));
    }
    const pointer = glowing(gold, 0xffb24a);
    fader.add(
      solid(new THREE.BoxGeometry(0.035, 0.012, 0.5), pointer, 0, 0.256, 0),
    );
    object.add(fader);
    let share = 0.1;
    let angle = -0.42;
    return {
      object,
      /**
       * The toggle rests at A (leaning left, -x) when idle, at B once passed,
       * and flips between them while lit; the fader rests low when idle, at
       * half once passed, and sweeps the scale while lit. Held still, both
       * take their resting places at once.
       */
      update(dt, t, lit, energy, passed) {
        let target = passed > 0.5 ? 0.42 : -0.42;
        if (lit > 0.5)
          target = still ? 0.42 : Math.sin(t * 1.9) > 0 ? 0.42 : -0.42;
        angle = still
          ? target
          : angle + (target - angle) * (1 - Math.exp(-dt * 14));
        pivot.rotation.z = -angle;
        const power = clamp(passed + lit, 0, 1);
        const want =
          lit > 0.5 && !still
            ? 0.5 + 0.36 * Math.sin(t * 0.9)
            : 0.1 + 0.4 * power;
        share = still ? want : share + (want - share) * (1 - Math.exp(-dt * 4));
        fader.position.x = slotFrom + share * (slotTo - slotFrom);
        pointer.emissiveIntensity =
          (passed * 0.08 + lit * (0.6 + energy * 0.5)) * ILLUMINATION;
        for (const lamp of lamps) {
          const chosen = clamp(0.5 + (lamp.side * angle) / 0.84, 0, 1);
          lamp.lens.emissiveIntensity =
            power * chosen * (0.9 + lit * (1.2 + energy)) * ILLUMINATION;
          lamp.halo.material.opacity =
            power * chosen * (0.12 + lit * 0.3) * ILLUMINATION;
        }
      },
    };
  }

  /**
   * cpu: a processor in its LGA socket under a nickel loading frame and
   * steel load lever, its brushed metal heat spreader carrying the etched
   * marking; beside it, the voltage regulator under a finned heatsink in
   * the same metal and its row of chokes.
   */
  function buildCpu(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "metal");
    const sw = 4.6;
    const sd = d - 0.06;
    const sx = -w / 2 + 0.05 + sw / 2;
    /** The package's half-depth inside the socket's loading frame. */
    const half = Math.min(1.42, sd / 2 - 0.12);
    object.add(contactShadow(sw, sd, sx, 0, 0.6));
    object.add(slab(sw, 0.16, sd, 0.05, blackPlastic, sx, 0));
    const frame = roundedRect(-2.06, -sd / 2 + 0.06, 2.06, sd / 2 - 0.06, 0.1);
    frame.holes.push(roundedHole(-1.92, -half, 1.92, half, 0.06));
    const frameGeometry = new THREE.ExtrudeGeometry(frame, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 1,
      curveSegments: 6,
    });
    frameGeometry.rotateX(-Math.PI / 2);
    const cx = sx - 0.08;
    object.add(solid(frameGeometry, nickel, cx, 0.17, 0));
    const knuckle = new THREE.CylinderGeometry(0.07, 0.07, 0.42, 16);
    knuckle.rotateX(Math.PI / 2);
    for (const z of [-0.9, 0.9]) {
      object.add(
        solid(knuckle, steel, sx - sw / 2 + 0.14, 0.2, z * (half / 1.42)),
      );
    }
    const lx = sx + sw / 2 - 0.18;
    const rod = new THREE.CylinderGeometry(0.045, 0.045, sd - 0.3, 14);
    rod.rotateX(Math.PI / 2);
    object.add(solid(rod, steel, lx, 0.24, 0));
    const hook = new THREE.TorusGeometry(0.1, 0.045, 10, 16, Math.PI);
    hook.rotateY(Math.PI / 2);
    object.add(solid(hook, steel, lx, 0.34, sd / 2 - 0.15));
    object.add(
      slab(0.2, 0.14, 0.3, 0.03, steel, lx - 0.06, 0.16, -sd / 2 + 0.3),
    );
    const scale = half / 1.42;
    object.add(slab(3.7, 0.07, 2.75 * scale, 0.02, substrate, cx, 0.17));
    const lands: Spot[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++)
        lands.push([cx + side * 1.72, (-1.05 + k * 0.42) * scale, Math.PI / 2]);
    }
    const landCaps = passives(lands, [0.14, 0.06, 0.07]);
    landCaps.position.y = 0.24;
    object.add(landCaps);
    object.add(slab(3.3, 0.05, 2.15 * scale, 0.02, body, cx, 0.24));
    const [plan] = markPlans("cpu", w, d);
    const { face } = plan!;
    const ihsW = face.right - face.left + 2 * CPU_CHAMFER;
    const ihsD = face.bottom - face.top + 2 * CPU_CHAMFER;
    const ihsH = 0.15;
    object.add(
      solid(
        mouldGeometry(ihsW, ihsH, ihsD, CPU_CHAMFER, 0.06),
        body,
        (face.left + face.right) / 2,
        0.24,
      ),
    );
    object.add(
      markOnTop(node, plan!.rooms[0]!, 0.24 + ihsH, {
        on: "metal",
        max: MARK_EM,
        ...CENTRED,
      }),
    );
    const hl = sx + sw / 2 + 0.2;
    const hr = w / 2 - 0.06;
    const hw = hr - hl;
    const hx = (hl + hr) / 2;
    const hd = Math.min(2.0, d - 1.0);
    const hz = -d / 2 + 0.06 + hd / 2;
    object.add(contactShadow(hw, hd, hx, hz, 0.55));
    object.add(slab(hw, 0.14, hd, 0.03, body, hx, 0, hz));
    const finCount = Math.floor((hw - 0.2) / 0.16) + 1;
    const fins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 0.86, hd - 0.1),
      body,
      finCount,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < finCount; i++) {
      matrix.makeTranslation(
        hl + 0.1 + (i * (hw - 0.2)) / (finCount - 1),
        0.14 + 0.43,
        hz,
      );
      fins.setMatrixAt(i, matrix);
    }
    fins.castShadow = true;
    fins.receiveShadow = true;
    object.add(fins);
    const mark = chokeMark();
    for (let i = 0; i < 4; i++) {
      const x = hl + 0.4 + (i * (hw - 0.8)) / 3;
      object.add(choke(x, d / 2 - 0.42, 0.62, 0.44, mark));
    }
    return { object, update: none };
  }

  /** A meter's hub's reach above its pivot, in units: the needle's domed hub and its steel ring. */
  const HUB_REACH = 0.15;
  /**
   * The room for a meter's caption between its hub and its scale, in units:
   * as wide as the scale arc's chord less a clearance either side, and as
   * tall as the gap from the hub's top to the arc's ends less a clearance
   * above and below; `middle` is the room's centre above the pivot.
   */
  function captionRoom(radius: number, sweep: number) {
    const clear = 0.15;
    const low = HUB_REACH + clear;
    const high = radius * Math.cos(sweep) - clear;
    return {
      width: 2 * radius * Math.sin(sweep) - 2 * clear,
      height: Math.max(0, high - low),
      middle: (low + high) / 2,
    };
  }
  /**
   * A meter's dial `winW` × `winL` units: a dark face with a gold scale arc
   * from 0 to 100, red past 80, round a pivot `pivot` units above the
   * dial's lower edge, `radius` out and `sweep` either side of upright,
   * numbered every 25, `caption` printed `size` units per em in the
   * marking font, centred in its captionRoom.
   */
  function meterTexture(
    winW: number,
    winL: number,
    pivot: number,
    radius: number,
    sweep: number,
    caption: string,
    size: number,
  ) {
    const cw = 1024;
    const ch = Math.round((cw * winL) / winW);
    const k = cw / winW;
    const { surface, ctx } = surface2d(cw, ch);
    const face = ctx.createLinearGradient(0, 0, 0, ch);
    face.addColorStop(0, "#22272e");
    face.addColorStop(1, "#101317");
    ctx.fillStyle = face;
    ctx.fillRect(0, 0, cw, ch);
    const px = cw / 2;
    const py = ch - pivot * k;
    const r = radius * k;
    const from = -Math.PI / 2 - sweep;
    const span = 2 * sweep;
    ctx.lineCap = "butt";
    ctx.lineWidth = 0.035 * k;
    ctx.strokeStyle = "rgba(230,192,98,0.95)";
    ctx.beginPath();
    ctx.arc(px, py, r, from, from + span * 0.8);
    ctx.stroke();
    ctx.strokeStyle = "#e0482d";
    ctx.lineWidth = 0.07 * k;
    ctx.beginPath();
    ctx.arc(px, py, r + 0.018 * k, from + span * 0.8, from + span);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let i = 0; i <= 20; i++) {
      const angle = from + (span * i) / 20;
      const major = i % 5 === 0;
      const r1 = r + (major ? 0.16 : 0.09) * k;
      ctx.strokeStyle =
        i >= 16 ? "#ff6a4a" : major ? "#f2d17b" : "rgba(214,222,232,0.7)";
      ctx.lineWidth = (major ? 0.035 : 0.02) * k;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(angle) * r, py + Math.sin(angle) * r);
      ctx.lineTo(px + Math.cos(angle) * r1, py + Math.sin(angle) * r1);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = i >= 16 ? "#ff8a6a" : "#c9d0d8";
        ctx.font = `600 ${0.13 * k}px "JetBrains Mono", monospace`;
        const rt = r + 0.27 * k;
        ctx.save();
        ctx.translate(px + Math.cos(angle) * rt, py + Math.sin(angle) * rt);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(String(i * 5), 0, 0.045 * k);
        ctx.restore();
      }
    }
    ctx.fillStyle = "#9aa3ae";
    setMarkFont(ctx, size * k);
    const room = captionRoom(radius, sweep);
    ctx.fillText(caption, px, py - (room.middle - (markCap() * size) / 2) * k);
    return canvasTexture(surface);
  }

  /**
   * gauge: twin panel meters in a wedge housing, the face sloped SLOPE
   * toward the viewer: a brushed metal bezel with two windows under cover glass,
   * each with its dial (captioned by meterCaptions, both captions at one
   * size: the largest at which the wider fits its captionRoom, at most
   * MARK_EM), its needle and the needle's domed hub, and the marking
   * centred on the bezel under the hubs.
   */
  function buildGauge(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const bezelMetal = partFinish(node, "facing");
    const SLOPE = GAUGE_SLOPE;
    const front = 0.5;
    const back = front + d * Math.tan(SLOPE);
    object.add(contactShadow(w, d, 0, 0, 0.6));
    const profile = new THREE.Shape();
    profile.moveTo(-d / 2, 0);
    profile.lineTo(d / 2, 0);
    profile.lineTo(d / 2, front);
    profile.lineTo(-d / 2, back);
    profile.closePath();
    const housing = new THREE.ExtrudeGeometry(profile, {
      depth: w - 0.08,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    housing.rotateY(-Math.PI / 2).translate((w - 0.08) / 2, 0, 0);
    object.add(solid(housing, blackPlastic));
    const faceL = d / Math.cos(SLOPE);
    const face = new THREE.Group();
    face.position.set(
      0,
      (front + back) / 2 + 0.04 * Math.cos(SLOPE),
      0.04 * Math.sin(SLOPE),
    );
    face.rotation.x = -Math.PI / 2 + SLOPE;
    object.add(face);
    const [plan] = markPlans("gauge", w, d);
    const windows = plan!.clear;
    const winW = windows[0]!.right - windows[0]!.left;
    const winBottom = -windows[0]!.bottom;
    const winTop = -windows[0]!.top;
    const winL = winTop - winBottom;
    const centres = windows.map((window) => (window.left + window.right) / 2);
    const bezel = roundedRect(
      -w / 2 + 0.02,
      -faceL / 2 + 0.02,
      w / 2 - 0.02,
      faceL / 2 - 0.02,
      0.12,
    );
    for (const cx of centres) {
      bezel.holes.push(
        roundedHole(cx - winW / 2, winBottom, cx + winW / 2, winTop, 0.08),
      );
    }
    face.add(
      solid(
        new THREE.ExtrudeGeometry(bezel, {
          depth: 0.05,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.02,
          bevelSegments: 2,
          curveSegments: 8,
        }),
        bezelMetal,
      ),
    );
    const pivot = 0.3;
    const radius = winL - pivot - 0.42;
    const sweep = 46 * DEG;
    const captions = meterCaptions(node.label);
    const room = captionRoom(radius, sweep);
    const captionSize = Math.min(
      MARK_EM,
      room.width / Math.max(...captions.map(markWidth)),
      room.height / markCap(),
    );
    const hub = new THREE.SphereGeometry(
      0.12,
      24,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    hub.rotateX(Math.PI / 2).scale(1, 1, 0.3);
    const ring = new THREE.TorusGeometry(0.13, 0.018, 8, 32);
    const needles = centres.map((cx, index) => {
      const dial = new THREE.Mesh(
        new THREE.PlaneGeometry(winW, winL),
        new THREE.MeshStandardMaterial({
          map: meterTexture(
            winW,
            winL,
            pivot,
            radius,
            sweep,
            captions[index]!,
            captionSize,
          ),
          roughness: 0.75,
          envMap: roomEnvironment,
          envMapIntensity: 0.4,
        }),
      );
      dial.position.set(cx, (winBottom + winTop) / 2, 0.004);
      dial.receiveShadow = true;
      face.add(dial);
      const needle = new THREE.Group();
      needle.position.set(cx, winBottom + pivot, 0.016);
      const pointer = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, radius + 0.04, 0.008),
        new THREE.MeshBasicMaterial({ color: 0xff7a4d }),
      );
      pointer.position.y = (radius + 0.04) / 2;
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.24, 0.01),
        blackPlastic,
      );
      tail.position.y = -0.1;
      needle.add(pointer, tail);
      face.add(needle);
      face.add(solid(hub, blackPlastic, cx, winBottom + pivot, 0.024));
      face.add(solid(ring, steel, cx, winBottom + pivot, 0.024));
      const cover = new THREE.Mesh(new THREE.PlaneGeometry(winW, winL), glass);
      cover.position.set(cx, (winBottom + winTop) / 2, 0.06);
      cover.renderOrder = 2;
      face.add(cover);
      return { needle, value: 0.08, seed: index * 1.9 };
    });
    face.add(
      markOnFace(node, plan!.rooms[0]!, 0.07, {
        on: "facing",
        max: MARK_EM,
        align: "center",
        valign: "middle",
        reflection: 0.4,
      }),
    );
    return {
      object,
      update(dt, t, lit, energy, passed) {
        for (const meter of needles) {
          const rest = 0.08 + passed * 0.28 + lit * 0.32 + meter.seed * 0.03;
          const time = t + meter.seed * 3.1;
          const wobble = still
            ? 0
            : (Math.sin(time * 2.3) * 0.5 +
                Math.sin(time * 5.1) * 0.3 +
                Math.sin(time * 11.7) * 0.2) *
              (0.02 + lit * 0.08);
          const want = rest + wobble + energy * 0.12;
          meter.value = still
            ? want
            : meter.value + (want - meter.value) * (1 - Math.exp(-dt * 6));
          meter.needle.rotation.z = sweep * (1 - 2 * clamp(meter.value, 0, 1));
        }
      },
    };
  }

  /** The beacon's red, and how brightly its dome glows when idle. */
  const BEACON_RED = new THREE.Color(0xff2a12);
  const BEACON_IDLE = 0.32;

  /**
   * beacon: a tall red warning beacon on its base, its gold reflector
   * turning and its dome flashing while lit, beside a piezo siren, the alarm
   * relay in a brushed metal can carrying the marking on its top, and a
   * two-way screw terminal.
   */
  function buildBeacon(node: Placed): Part {
    const { w, d } = node;
    const object = new THREE.Group();
    const body = partFinish(node, "metal");
    const bx = -w / 2 + 1.1;
    object.add(contactShadow(2.1, 2.1, bx, 0, 0.6));
    object.add(
      solid(
        new THREE.CylinderGeometry(1.0, 1.04, 0.24, 48),
        blackPlastic,
        bx,
        0.12,
        0,
      ),
    );
    for (let k = 0; k < 3; k++) {
      const angle = (k / 3) * Math.PI * 2 + 0.5;
      object.add(
        screw(bx + Math.cos(angle) * 0.9, 0.24, Math.sin(angle) * 0.9, angle),
      );
    }
    object.add(
      solid(
        new THREE.CylinderGeometry(0.74, 0.8, 0.36, 48),
        blackPlastic,
        bx,
        0.24 + 0.18,
        0,
      ),
    );
    const y0 = 0.6;
    const collar = new THREE.TorusGeometry(0.71, 0.035, 8, 48);
    collar.rotateX(Math.PI / 2);
    object.add(solid(collar, partFinish(node, "lead"), bx, y0, 0));
    // Red warning glass: deep red, lit faintly from within when idle
    // (BEACON_IDLE), flashing BEACON_RED when current; not tone mapped, so
    // its red holds at any brightness.
    const dome = new THREE.MeshPhysicalMaterial({
      color: 0x9e0d06,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: BEACON_RED.clone(),
      emissiveIntensity: BEACON_IDLE,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const lensH = 1.3;
    object.add(
      solid(
        new THREE.CylinderGeometry(0.68, 0.68, lensH, 48, 1, true),
        dome,
        bx,
        y0 + lensH / 2,
        0,
      ),
    );
    object.add(
      solid(
        new THREE.SphereGeometry(0.68, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
        dome,
        bx,
        y0 + lensH,
        0,
      ),
    );
    for (const [height, radius] of [
      [0.15, 0.685],
      [0.45, 0.685],
      [0.75, 0.685],
      [1.05, 0.685],
      [lensH + 0.3, 0.6],
      [lensH + 0.5, 0.46],
    ] as const) {
      const rib = new THREE.TorusGeometry(radius, 0.014, 6, 48);
      rib.rotateX(Math.PI / 2);
      object.add(solid(rib, dome, bx, y0 + height, 0));
    }
    const reflector = new THREE.Group();
    reflector.position.set(bx, y0 + lensH * 0.6, 0);
    reflector.add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.44, 0.62, 24, 1, true, 0, Math.PI),
        new THREE.MeshPhysicalMaterial({
          color: GOLD_METAL,
          metalness: 1,
          roughness: 0.15,
          side: THREE.DoubleSide,
        }),
      ),
    );
    reflector.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
      ),
    );
    object.add(reflector);
    const halo = glowSprite(BEACON_RED, 3.4);
    halo.position.set(bx, y0 + lensH * 0.7, 0);
    object.add(halo);
    // A red light inside the dome that spills onto the board around it while the beacon flashes.
    const spill = new THREE.PointLight(BEACON_RED, 0, 7, 2);
    spill.position.set(bx, y0 + lensH * 0.6, 0);
    object.add(spill);
    const sx = bx + 2.0;
    object.add(contactShadow(1.5, 1.5, sx, 0, 0.55));
    object.add(
      solid(
        new THREE.CylinderGeometry(0.7, 0.74, 0.62, 48),
        blackPlastic,
        sx,
        0.31,
        0,
      ),
    );
    for (const radius of [0.56, 0.42, 0.28]) {
      const groove = new THREE.TorusGeometry(radius, 0.02, 6, 40);
      groove.rotateX(Math.PI / 2);
      object.add(solid(groove, sleeve, sx, 0.62, 0));
    }
    const port = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 24).rotateX(-Math.PI / 2),
      darkness,
    );
    port.position.set(sx, 0.622, 0);
    object.add(port);
    const [plan] = markPlans("beacon", w, d);
    const { face: relay } = plan!;
    const rw = relay.right - relay.left;
    const rd = relay.bottom - relay.top;
    const rx = (relay.left + relay.right) / 2;
    const rz = (relay.top + relay.bottom) / 2;
    const rh = 1.05;
    object.add(contactShadow(rw, rd, rx, rz, 0.55));
    object.add(slab(rw, rh, rd, 0.05, body, rx, 0, rz));
    object.add(
      markOnTop(node, plan!.rooms[0]!, rh, {
        on: "metal",
        max: MARK_EM,
        ...CENTRED,
      }),
    );
    const tw = w / 2 - 0.1 - (rx + rw / 2 + 0.2);
    const tx = w / 2 - 0.1 - tw / 2;
    object.add(contactShadow(tw, 1.1, tx, -0.25, 0.5));
    object.add(slab(tw, 0.86, 1.1, 0.04, terminalGreen, tx, 0, -0.25));
    for (const k of [-1, 1]) {
      const x = tx + k * tw * 0.25;
      object.add(
        solid(
          new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24),
          steel,
          x,
          0.885,
          -0.25,
        ),
      );
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.012, 0.04),
        darkness,
      );
      slot.position.set(x, 0.912, -0.25);
      slot.rotation.y = 0.5 + k * 0.4;
      object.add(slot);
    }
    object.add(
      passives(
        [
          [rx - 0.8, d / 2 - 0.3],
          [rx - 0.4, d / 2 - 0.3],
          [rx, d / 2 - 0.3],
          [rx + 0.6, d / 2 - 0.3],
          [tx, d / 2 - 0.3],
        ],
        [0.2, 0.09, 0.11],
      ),
    );
    return {
      object,
      update(dt, t, lit, energy) {
        const flash = still ? 0.8 : Math.pow(0.5 + 0.5 * Math.sin(t * 6.5), 3);
        dome.emissiveIntensity =
          BEACON_IDLE + lit * (0.35 + flash * 0.75 + energy * 0.3);
        halo.material.opacity = 0.08 + lit * (0.22 + flash * 0.5);
        spill.intensity = lit * (1.5 + flash * 9);
        if (!still) reflector.rotation.y += dt * lit * 7;
      },
    };
  }

  const BUILDERS: Record<WorkflowPartKind, (node: Placed) => Part> = {
    qfp: buildQfp,
    bga: buildBga,
    socket: buildSocket,
    memory: buildMemory,
    gpu: buildGpu,
    trimmer: buildTrimmer,
    die: buildDie,
    rj45: buildRj45,
    radio: buildRadio,
    secure: buildSecure,
    toggle: buildToggle,
    cpu: buildCpu,
    gauge: buildGauge,
    beacon: buildBeacon,
  };
  /**
   * A node's component, on its plinth at the footprint's centre;
   * update(dt, t, lit, energy, passed) animates it, `lit` and `passed`
   * easing between 0 and 1 with the node's state and `energy` 1 when a
   * pulse lands, decaying.
   */
  function buildPart(node: Placed): Part {
    const part = BUILDERS[node.kind](node);
    part.object.position.y = TRACE_H;
    return part;
  }

  /* ---------- Board-level parts ---------- */
  /** A group centred on `rect` (stage pixels), on the board's top face, and the rectangle's size in units. */
  function fillGroup(rect: Box) {
    const group = new THREE.Group();
    group.position.set(
      wx((rect.left + rect.right) / 2),
      0,
      wz((rect.top + rect.bottom) / 2),
    );
    return {
      group,
      w: (rect.right - rect.left) / PX,
      d: (rect.bottom - rect.top) / PX,
    };
  }
  /**
   * vrm: a voltage regulator: a finned gunmetal heatsink over its MOSFETs at
   * the back, a row of chokes along the front and, at least 3.3 units deep,
   * a row of capacitors between them.
   */
  function buildVrm(rect: Box) {
    const { group, w, d } = fillGroup(rect);
    const hd = clamp(d - 1.9, 0.9, 1.55);
    const hz = -d / 2 + hd / 2 + 0.06;
    group.add(slab(w - 0.2, 0.22, hd, 0.04, gunmetal, 0, 0, hz));
    const finCount = 24;
    const fins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.72, hd - 0.1),
      gunmetal,
      finCount,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < finCount; i++) {
      matrix.makeTranslation(
        -(w - 0.4) / 2 + (i * (w - 0.4)) / (finCount - 1),
        0.22 + 0.36,
        hz,
      );
      fins.setMatrixAt(i, matrix);
    }
    fins.castShadow = true;
    group.add(fins);
    chokes(
      group,
      Math.max(2, Math.round(w / 1.25)),
      -w / 2 + 0.6,
      w / 2 - 0.6,
      d / 2 - 0.62,
    );
    if (d >= 3.3) {
      const spots: Spot[] = [];
      for (let i = 0; i < 10; i++)
        spots.push([-w / 2 + 0.5 + i * ((w - 1) / 9), d / 2 - 1.18]);
      group.add(passives(spots, [0.16, 0.08, 0.09]));
    }
    return group;
  }

  /** rtc: the clock: a coin cell in its holder, the 32.768 kHz crystal and, at least 7.2 units wide, a SOIC flash. */
  function buildRtc(rect: Box) {
    const { group, w } = fillGroup(rect);
    const cx = -w / 2 + 1.0;
    group.add(
      solid(
        new THREE.CylinderGeometry(0.9, 0.9, 0.14, 48),
        blackPlastic,
        cx,
        0.07,
        0,
      ),
    );
    group.add(
      solid(
        new THREE.CylinderGeometry(0.8, 0.8, 0.18, 48),
        nickel,
        cx,
        0.23,
        0,
      ),
    );
    const cellMark = decal(
      markingTexture(
        [
          ["+", 70, 700],
          ["CR2032", 34, 700],
        ],
        { ink: "rgba(30,34,40,0.8)" },
      ),
      1.1,
      1.1,
      0.322,
    );
    cellMark.position.set(cx, 0.322, 0);
    group.add(cellMark);
    const xx = cx + 1.75;
    group.add(slab(1.3, 0.48, 0.5, 0.22, tin, xx, 0, 0));
    const value = decal(
      markingTexture([["32.768", 48, 700]], {
        width: 256,
        height: 96,
        ink: "rgba(40,44,50,0.8)",
      }),
      0.9,
      0.34,
      0.482,
    );
    value.position.set(xx, 0.482, 0);
    group.add(value);
    const spots: Spot[] = [
      [xx, -0.62],
      [xx, 0.62],
    ];
    if (w >= 7.2) {
      const sx = xx + 1.75;
      group.add(slab(0.95, 0.16, 0.62, 0.02, epoxy, sx, 0.02, 0));
      const lead = rbox(0.06, 0.04, 0.2, 0.01);
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1])
          group.add(solid(lead, tin, sx - 0.33 + i * 0.22, 0.02, side * 0.4));
      }
      spots.push([sx + 1.0, -0.4], [sx + 1.0, 0.4, Math.PI / 2], [sx + 1.6, 0]);
    }
    group.add(passives(spots, [0.18, 0.09, 0.1]));
    return group;
  }

  /**
   * bulk: bulk electrolytic capacitors and chokes along the front edge,
   * beside the chipset's heatsink at the right; at least 17 units wide, a
   * 2 × 10 pin header and a SOIC between them.
   */
  function buildBulk(rect: Box) {
    const { group, w, d } = fillGroup(rect);
    const can = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 32);
    const lid = new THREE.CircleGeometry(0.36, 32);
    lid.rotateX(-Math.PI / 2);
    const score = new THREE.BoxGeometry(0.5, 0.01, 0.03);
    const stripe = new THREE.CylinderGeometry(
      0.405,
      0.405,
      0.98,
      16,
      1,
      true,
      -0.35,
      0.7,
    );
    const wide = w >= 17;
    const capCount = wide ? 8 : clamp(Math.floor((w - 4.75) / 0.98), 2, 8);
    for (let i = 0; i < capCount; i++) {
      const x = -w / 2 + 1.0 + i * 0.98;
      const z = d / 2 - 0.62;
      group.add(solid(can, sleeve, x, 0.5, z));
      group.add(solid(stripe, gold, x, 0.5, z));
      const top = new THREE.Mesh(lid, aluminium);
      top.position.set(x, 1.002, z);
      group.add(top);
      for (const turn of [0, Math.PI / 2]) {
        const cut = new THREE.Mesh(score, darkness);
        cut.position.set(x, 1.004, z);
        cut.rotation.y = turn + 0.4;
        group.add(cut);
      }
    }
    const chokeCount = clamp(Math.floor((capCount * 0.98) / 1.2) - 1, 2, 4);
    chokes(
      group,
      chokeCount,
      -w / 2 + 1.2,
      -w / 2 + 1.2 + (chokeCount - 1) * 1.2,
      -d / 2 + 0.62,
      0.8,
    );
    const hx = w / 2 - 2.0;
    group.add(slab(3.7, 0.22, d - 0.3, 0.05, gunmetal, hx, 0));
    const ridges = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.5, 0.5, 0.1),
      gunmetal,
      9,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 9; i++) {
      matrix.makeTranslation(
        hx,
        0.22 + 0.25,
        -(d - 0.6) / 2 + (i * (d - 0.6)) / 8,
      );
      ridges.setMatrixAt(i, matrix);
    }
    ridges.castShadow = true;
    group.add(ridges);
    const inlay = glowing(gold, 0xffb24a);
    group.add(
      solid(
        new THREE.BoxGeometry(3.66, 0.02, 0.05),
        inlay,
        hx,
        0.231,
        d / 2 - 0.2,
      ),
    );
    if (wide) {
      const px = -w / 2 + 9.7;
      group.add(slab(2.2, 0.26, 0.5, 0.02, blackPlastic, px, 0, 0.35));
      const pins = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.06, 0.62, 0.06),
        gold,
        20,
      );
      for (let i = 0; i < 10; i++) {
        for (const row of [0, 1]) {
          matrix.makeTranslation(px - 0.99 + i * 0.22, 0.31, 0.24 + row * 0.22);
          pins.setMatrixAt(i * 2 + row, matrix);
        }
      }
      pins.castShadow = true;
      group.add(pins);
      const sx = px + 2.4;
      group.add(slab(1.0, 0.16, 0.66, 0.02, epoxy, sx, 0.02, 0.3));
      const lead = rbox(0.06, 0.04, 0.2, 0.01);
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          group.add(
            solid(lead, tin, sx - 0.33 + i * 0.22, 0.02, 0.3 + side * 0.42),
          );
        }
      }
      const spots: Spot[] = [];
      for (let i = 0; i < 8; i++)
        spots.push([px - 1.0 + i * 0.3, -0.55, Math.PI / 2]);
      for (let i = 0; i < 4; i++)
        spots.push([sx - 0.45 + i * 0.3, -0.55, Math.PI / 2]);
      group.add(passives(spots, [0.18, 0.08, 0.09]));
    }
    return group;
  }

  const FILL_BUILDERS: Record<FillKind, (rect: Box) => THREE.Group> = {
    vrm: buildVrm,
    rtc: buildRtc,
    bulk: buildBulk,
  };

  /* ---------- The board ---------- */
  function buildBoard() {
    const x0 = wx(-MARGIN);
    const x1 = wx(STAGE_W + MARGIN);
    const z0 = wz(-MARGIN);
    const z1 = wz(STAGE_H + MARGIN);
    // Shape y is world -z, so the shape is rotated onto the XZ plane by -90 degrees about x.
    const outline = roundedRect(x0, -z1, x1, -z0, BOARD_CORNER);
    for (const [hx, hy] of HOLES) {
      const hole = new THREE.Path();
      hole.absarc(wx(hx), -wz(hy), HOLE_R, 0, Math.PI * 2, true);
      outline.holes.push(hole);
    }
    const slabGeometry = new THREE.ExtrudeGeometry(outline, {
      depth: BOARD_T - 0.003,
      bevelEnabled: false,
      curveSegments: 16,
    });
    slabGeometry.rotateX(-Math.PI / 2);
    slabGeometry.translate(0, -BOARD_T, 0);
    const underside = new THREE.MeshStandardMaterial({
      color: 0x08100c,
      roughness: 0.5,
    });
    const edgeGold = gold.clone();
    edgeGold.roughness = 0.28;
    const board = new THREE.Mesh(slabGeometry, [underside, edgeGold]);
    board.castShadow = true;

    const topGeometry = new THREE.ShapeGeometry(outline, 16);
    topGeometry.rotateX(-Math.PI / 2);
    const position = topGeometry.attributes.position!;
    const uv = topGeometry.attributes.uv!;
    for (let i = 0; i < position.count; i++) {
      uv.setXY(
        i,
        (position.getX(i) - x0) / (x1 - x0),
        1 - (position.getZ(i) - z0) / (z1 - z0),
      );
    }
    const { colour, surface } = boardTextures();
    const topMaterial = new THREE.MeshStandardMaterial({
      map: colour,
      roughnessMap: surface,
      metalnessMap: surface,
      bumpMap: surface,
      bumpScale: 0.55,
      roughness: 1,
      metalness: 1,
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.receiveShadow = true;

    const group = new THREE.Group();
    group.add(board, top);

    // Brass standoffs under each hole and a steel pan-head screw on top.
    const standoffGeometry = new THREE.CylinderGeometry(
      0.34,
      0.34,
      STANDOFF,
      6,
    );
    const screwGeometry = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.36, 0],
        [0.37, 0.03],
        [0.34, 0.1],
        [0.24, 0.15],
        [0, 0.16],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      32,
    );
    const slotGeometry = new THREE.BoxGeometry(0.5, 0.06, 0.07);
    for (const [hx, hy] of HOLES) {
      const standoff = new THREE.Mesh(standoffGeometry, brass);
      standoff.position.set(wx(hx), -BOARD_T - STANDOFF / 2, wz(hy));
      standoff.castShadow = true;
      const head = new THREE.Mesh(screwGeometry, steel);
      head.position.set(wx(hx), 0.004, wz(hy));
      head.castShadow = true;
      for (const turn of [0.6, 0.6 + Math.PI / 2]) {
        const slot = new THREE.Mesh(slotGeometry, drill);
        slot.position.set(wx(hx), 0.15, wz(hy));
        slot.rotation.y = turn;
        group.add(slot);
      }
      group.add(standoff, head);
    }
    return group;
  }

  /**
   * The board's shadow on the page, in layers on the plane y = FLOOR_Y under
   * the standoffs: a rounded rectangle `spread` [x, z] units past the
   * board's outline on each side (less than none where negative), blurred
   * `blur` units, moved `shift` [x, z] toward the front, at `weight` of the
   * page's shadow opacity (PAGE_LOOK). The contact layer hugs the outline;
   * the penumbra layer is thrown forward, wide and faint, and kept in at the
   * sides.
   */
  const PAGE_SHADOW = [
    { spread: [0.08, 0.08], blur: 0.45, shift: [0, 0.1], weight: 1 },
    { spread: [-0.4, 0.2], blur: 1.2, shift: [0, 0.4], weight: 0.55 },
  ] as const;
  /** Texture pixels per unit on PAGE_SHADOW's textures. */
  const SHADOW_TEXEL = 14;
  /**
   * The corners of every PAGE_SHADOW layer where it has faded out (`blur` ×
   * 1.4 past its spread, under 1% of its opacity), which the framing keeps
   * on the canvas.
   */
  const SHADOW_POINTS: THREE.Vector3[] = [];

  /** The board's shadow on the page: a plane per PAGE_SHADOW layer, each a blurred rounded rectangle. */
  function buildPageShadow() {
    const group = new THREE.Group();
    const materials: THREE.MeshBasicMaterial[] = [];
    PAGE_SHADOW.forEach(
      ({ spread: [spreadX, spreadZ], blur, shift, weight }, index) => {
        const pw = BOARD_W + 2 * (spreadX + blur * 1.5);
        const pd = BOARD_D + 2 * (spreadZ + blur * 1.5);
        const { surface, ctx } = surface2d(
          Math.ceil(pw * SHADOW_TEXEL),
          Math.ceil(pd * SHADOW_TEXEL),
        );
        const away = surface.width * 4;
        const rectW = (BOARD_W + 2 * spreadX) * SHADOW_TEXEL;
        const rectD = (BOARD_D + 2 * spreadZ) * SHADOW_TEXEL;
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = blur * SHADOW_TEXEL;
        ctx.shadowOffsetX = away;
        ctx.fillStyle = "#fff";
        canvasRoundRect(
          ctx,
          (surface.width - rectW) / 2 - away,
          (surface.height - rectD) / 2,
          rectW,
          rectD,
          BOARD_CORNER * SHADOW_TEXEL,
        );
        ctx.fill();
        const texture = new THREE.CanvasTexture(surface);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({
          color: 0x000000,
          map: texture,
          transparent: true,
          opacity: weight,
          depthWrite: false,
          toneMapped: false,
        });
        material.userData.weight = weight;
        materials.push(material);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), material);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(shift[0], FLOOR_Y + 0.002 * (index + 1), shift[1]);
        plane.renderOrder = -1;
        plane.userData.decor = true;
        group.add(plane);
        const fadeX = BOARD_W / 2 + spreadX + blur * 1.4;
        const fadeZ = BOARD_D / 2 + spreadZ + blur * 1.4;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            SHADOW_POINTS.push(
              new THREE.Vector3(
                shift[0] + sx * fadeX,
                FLOOR_Y,
                shift[1] + sz * fadeZ,
              ),
            );
          }
        }
      },
    );
    return { group, materials };
  }

  /**
   * The LIVE status LED on the silkscreen title's line: a red 0603 lens and
   * its glow sprite, at LIVE_LED (set by paintBoard, so built after the
   * board).
   */
  function buildLiveLed() {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x3a0d0a,
      roughness: 0.15,
      clearcoat: 1,
      emissive: new THREE.Color(0xff3b30),
      emissiveIntensity: 1.5,
    });
    const led = new THREE.Mesh(
      new RoundedBoxGeometry(0.3, 0.12, 0.16, 1, 0.03),
      material,
    );
    led.position.set(wx(LIVE_LED.x), 0.06, wz(LIVE_LED.y));
    const glow = glowSprite(new THREE.Color(0xff4a3a), 1.0, 0.4);
    glow.position.copy(led.position).y += 0.1;
    const group = new THREE.Group();
    group.add(led, glow);
    return { group, material, glow };
  }

  /**
   * The page-dependent look, per <html data-theme>: the page shadow's tint
   * and opacity, the tone mapping's exposure and the room's reflection
   * strength.
   */
  const PAGE_LOOK = {
    dark: {
      shadow: 0x000000,
      shadowOpacity: 0.92,
      exposure: 1.05,
      environment: 0.9,
    },
    light: {
      shadow: 0x161b22,
      shadowOpacity: 0.5,
      exposure: 1.1,
      environment: 1.0,
    },
  };

  /* ---------- Assembly ---------- */
  const world = new THREE.Group();
  scene.add(world);

  /** A status LED's glow sprite's size at rest, in units; a lit node's swells with the pulse. */
  const LED_GLOW = 1.1;
  const ledGeometry = new RoundedBoxGeometry(0.3, 0.12, 0.16, 1, 0.03);
  /** One node in the scene: its part, plinth, status LED, light pool, markings and package finishes. */
  const sceneNodes = NODES.map((node) => {
    const group = new THREE.Group();
    group.position.set(wx(node.cx), 0, wz(node.cy));
    const lift = new THREE.Group();
    group.add(lift);
    const part = buildPart(node);
    lift.add(part.object);

    const plinthWidth = (node.plinth.right - node.plinth.left) / PX;
    const plinthDepth = (node.plinth.bottom - node.plinth.top) / PX;
    const ring = roundedRect(
      -plinthWidth / 2,
      -plinthDepth / 2,
      plinthWidth / 2,
      plinthDepth / 2,
      0.12,
    );
    ring.holes.push(
      roundedHole(
        -plinthWidth / 2 + RIM,
        -plinthDepth / 2 + RIM,
        plinthWidth / 2 - RIM,
        plinthDepth / 2 - RIM,
        0.06,
      ),
    );
    const plinthGeometry = new THREE.ExtrudeGeometry(ring, {
      depth: TRACE_H,
      bevelEnabled: false,
      curveSegments: 6,
    });
    plinthGeometry.rotateX(-Math.PI / 2);
    const plinth = new THREE.Mesh(plinthGeometry, maskCopper as THREE.Material);
    plinth.receiveShadow = true;
    group.add(plinth);

    // The status LED: a 0603 lens on the board just in front of the plinth's front right corner.
    const ledMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2a2620,
      roughness: 0.15,
      clearcoat: 1,
      emissive: new THREE.Color(0xffb54a),
      emissiveIntensity: 0,
    });
    const led = new THREE.Mesh(ledGeometry, ledMaterial);
    led.position.set(
      plinthWidth / 2 - LED_SPOT.inset,
      0.06,
      plinthDepth / 2 + LED_SPOT.out,
    );
    const ledGlow = glowSprite(GOLD, LED_GLOW);
    ledGlow.position.copy(led.position).y += 0.12;
    group.add(led, ledGlow);

    // The light pooling on the board around a lit component.
    const poolMaterial = new THREE.MeshBasicMaterial({
      map: poolMap,
      color: new THREE.Color(0xffa63a),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(plinthWidth * 1.4 + 3.2, plinthDepth * 1.4 + 3.2),
      poolMaterial,
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = TRACE_H + 0.006;
    pool.renderOrder = 1;
    group.add(pool);

    world.add(group);
    return {
      node,
      group,
      lift,
      part,
      plinth,
      ledMaterial,
      ledGlow,
      poolMaterial,
      markings: MARKINGS.filter((entry) => entry.node === node.id),
      finishes: NODE_FINISHES.get(node.id) ?? [],
      shading: shadingUniforms(SHADE.idle),
      state: "idle" as PartState,
      level: 0,
      energy: 0,
    };
  });
  const SCENE_NODE = new Map(sceneNodes.map((entry) => [entry.node.id, entry]));
  const fillParts = fills.map(({ kind, rect }) => FILL_BUILDERS[kind](rect));
  for (const fill of fillParts) fill.position.y = TRACE_H;
  if (fillParts.length) world.add(...fillParts);

  /* ---------- Traces ---------- */
  const glowVertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  /**
   * The lit trace's light: a bright core over the trace and a soft halo on
   * the board around it, at uBase between pulses; each of uHeads (a place
   * along the trace from 0 to 1, or below 0 when unused) adds a hot bead
   * with a tail behind it. uLen is the trace's length and uHalf the ribbon's
   * half width, both in units; uOn fades it all in and out; uGain scales it.
   */
  const glowFragment = /* glsl */ `
    uniform float uLen;
    uniform float uHalf;
    uniform float uOn;
    uniform float uBase;
    uniform float uGain;
    uniform vec4 uHeads;
    uniform vec3 uColor;
    uniform vec3 uHot;
    varying vec2 vUv;
    float bead(float head, float along) {
      if (head < 0.0) return 0.0;
      float x = along - head * uLen;
      return exp(-x * x * 10.0) + (x < 0.0 ? exp(x * 1.5) * 0.55 : 0.0);
    }
    void main() {
      float across = abs(vUv.y - 0.5) * 2.0 * uHalf;
      float along = vUv.x * uLen;
      float heat = min(1.6, bead(uHeads.x, along) + bead(uHeads.y, along) + bead(uHeads.z, along) + bead(uHeads.w, along));
      float core = exp(-pow(across / 0.13, 2.0));
      float halo = exp(-pow(across / 0.36, 2.0));
      float light = core * (uBase + heat * 1.9) + halo * (uBase * 0.45 + heat * 0.6);
      vec3 colour = mix(uColor, uHot, clamp(heat * core, 0.0, 1.0));
      gl_FragColor = vec4(colour * light * uOn * uGain, 1.0);
      #include <colorspace_fragment>
    }`;
  const GLOW_HALF = 0.5;

  const holes: THREE.BufferGeometry[] = [];
  const sceneTraces = TRACES.filter((trace) => trace.points.length > 1).map(
    (trace) => {
      const path = trace.points.map(
        ([x, y]) => new THREE.Vector2(wx(x), wz(y)),
      );
      const parts: THREE.BufferGeometry[] = [
        ribbonGeometry(path, TRACE_W, TRACE_H, 0),
      ];
      for (const [x, y] of trace.corners) {
        const via = new THREE.CylinderGeometry(0.19, 0.19, TRACE_H, 20);
        via.translate(wx(x), TRACE_H / 2, wz(y));
        parts.push(via);
        const hole = new THREE.CircleGeometry(0.075, 16);
        hole.rotateX(-Math.PI / 2);
        hole.translate(wx(x), TRACE_H + 0.002, wz(y));
        holes.push(hole);
      }
      for (const point of [path[0]!, path[path.length - 1]!]) {
        const pad = new THREE.CylinderGeometry(0.17, 0.17, TRACE_H, 18);
        pad.translate(point.x, TRACE_H / 2, point.y);
        parts.push(pad);
      }
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const mesh = new THREE.Mesh(merged, maskCopper as THREE.Material);
      mesh.receiveShadow = true;
      world.add(mesh);

      const sampler = pathSampler(path);
      const uniforms = {
        uLen: { value: sampler.total },
        uHalf: { value: GLOW_HALF },
        uOn: { value: 0 },
        uBase: { value: 0.55 },
        uGain: { value: 0.25 * ILLUMINATION },
        uHeads: { value: new THREE.Vector4(-1, -1, -1, -1) },
        uColor: { value: new THREE.Color(0xffa62e) },
        uHot: { value: HOT.clone() },
      };
      const glow = new THREE.Mesh(
        ribbonGeometry(path, GLOW_HALF * 2, 0, TRACE_H + 0.004),
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: glowVertex,
          fragmentShader: glowFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      glow.renderOrder = 2;
      glow.visible = false;
      world.add(glow);
      const heads = Math.min(3, 1 + Math.floor(sampler.total / 9));
      const travel = 0.55 + sampler.total / 9;
      return {
        trace,
        mesh,
        glow,
        uniforms,
        sampler,
        heads,
        travel,
        state: "idle" as PartState,
        on: 0,
        clock: 0,
        last: [] as number[],
      };
    },
  );
  if (holes.length) {
    world.add(new THREE.Mesh(mergeGeometries(holes), drill));
    for (const hole of holes) hole.dispose();
  }

  /** Bead sprites, shared by every lit trace's pulses. */
  const beads = Array.from({ length: 12 }, () => {
    const sprite = glowSprite(HOT, 0.95);
    sprite.visible = false;
    sprite.renderOrder = 3;
    world.add(sprite);
    return sprite;
  });

  /**
   * Warm lights on the lit components, assigned on each step: one over each
   * (`key`), and one low in front of it (`rim`) that lights its front faces
   * and edges in gold.
   */
  const litLights = Array.from({ length: 3 }, () => {
    const key = new THREE.PointLight(0xffb34d, 0, 14, 2);
    const rim = new THREE.PointLight(0xffc266, 0, 6.5, 2);
    world.add(key, rim);
    return { key, rim, node: null as (typeof sceneNodes)[number] | null };
  });

  const pageShadow = buildPageShadow();
  world.add(buildBoard(), pageShadow.group);
  const liveLed = buildLiveLed();
  world.add(liveLed.group);
  world.updateMatrixWorld(true);

  /* ---------- State shading ---------- */
  /**
   * The state shading, applied after lighting and before tone mapping:
   * `exposure` scales a part's colour, `desaturate` pulls it toward its
   * luminance and `rim` adds RIM_COLOUR along its silhouette, where its
   * surfaces turn away from the camera. Parts not yet reached sit back,
   * dimmer and greyer; passed parts read nearly in full; the current step's
   * parts read slightly over, outlined in gold.
   */
  function shadingUniforms({
    exposure,
    desaturate,
    rim,
  }: Shade): ShadingUniforms {
    return {
      uExposure: { value: exposure },
      uDesaturate: { value: desaturate },
      uRim: { value: rim },
      uRimColour: { value: rimColour },
    };
  }

  /**
   * Makes `material` take the state shading from `uniforms`; the rim
   * applies only to standard and physical materials, whose shaders carry
   * the surface normal. Every shaded material of one type and set of
   * features shares one program; each keeps its own uniform values.
   */
  function addShading(material: THREE.Material, uniforms: ShadingUniforms) {
    const rim = material instanceof THREE.MeshStandardMaterial;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          "uniform float uExposure;\nuniform float uDesaturate;\nuniform float uRim;\nuniform vec3 uRimColour;\nvoid main() {",
        )
        .replace(
          "#include <opaque_fragment>",
          [
            "#include <opaque_fragment>",
            "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722))), uDesaturate) * uExposure;",
            rim
              ? "gl_FragColor.rgb += uRimColour * uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.4);"
              : "",
          ].join("\n\t"),
        );
    };
    material.customProgramCacheKey = () =>
      rim ? "state-shading-rim" : "state-shading";
    material.userData.shaded = true;
    material.needsUpdate = true;
  }

  /**
   * Gives each owner in `owners` ([root, uniforms]) the state shading on
   * every mesh under its root, except the markings' ink and glow, additive
   * glows and shader materials. A material used under one root only is
   * shaded in place, so the part's update() still drives it; a material
   * shared with anything else is cloned for that root.
   */
  function shadeOwners(owners: [THREE.Object3D, ShadingUniforms][]) {
    const roots = new Set(owners.map(([owner]) => owner));
    const shared = new Set<THREE.Material>(Object.values(STATE_MATERIAL));
    const skip = new Set<THREE.Object3D>(
      MARKINGS.flatMap((entry) => [entry.mesh, entry.glow]),
    );
    const ownerOf = (object: THREE.Object3D) => {
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (roots.has(node)) return node;
      }
      return world;
    };
    const users = new Map<THREE.Material, Set<THREE.Object3D>>();
    world.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of [
        object.material as THREE.Material | THREE.Material[],
      ].flat()) {
        if (!users.has(material)) users.set(material, new Set());
        users.get(material)!.add(ownerOf(object));
      }
    });
    for (const [owner, uniforms] of owners) {
      const clones = new Map<THREE.Material, THREE.Material>();
      owner.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || skip.has(object)) return;
        const swap = (material: THREE.Material): THREE.Material => {
          if (
            material instanceof THREE.ShaderMaterial ||
            material.blending === THREE.AdditiveBlending ||
            material.userData.shaded
          ) {
            return material;
          }
          if (users.get(material)!.size === 1 && !shared.has(material)) {
            addShading(material, uniforms);
            return material;
          }
          let clone = clones.get(material);
          if (!clone) {
            clone = material.clone();
            addShading(clone, uniforms);
            clones.set(material, clone);
          }
          return clone;
        };
        const current = object.material as THREE.Material | THREE.Material[];
        object.material = Array.isArray(current)
          ? current.map(swap)
          : swap(current);
      });
    }
  }

  const fillShading = shadingUniforms(FILL_SHADE);
  shadeOwners([
    ...sceneNodes.map((entry): [THREE.Object3D, ShadingUniforms] => [
      entry.part.object,
      entry.shading,
    ]),
    ...fillParts.map((fill): [THREE.Object3D, ShadingUniforms] => [
      fill,
      fillShading,
    ]),
  ]);

  /* ---------- The page's theme ---------- */
  /** Sets the page shadow, exposure and reflections from PAGE_LOOK for <html data-theme>. */
  function applyLook() {
    const look = PAGE_LOOK[html.dataset.theme === "light" ? "light" : "dark"];
    renderer.toneMappingExposure = look.exposure;
    scene.environmentIntensity = look.environment;
    for (const material of pageShadow.materials) {
      material.color.set(look.shadow);
      material.opacity =
        look.shadowOpacity * (material.userData.weight as number);
    }
  }
  applyLook();

  /* ---------- Camera ---------- */
  /** How far a step's view leans toward its lit parts, and closes in, at most, while the whole board stays on the canvas. */
  const FOCUS_SHIFT = 0.14;
  const FOCUS_ZOOM = 0.05;
  /** How far toward the canvas's edges, in clip space, SHADOW_POINTS may reach. */
  const SHADOW_FIT = 1;

  /** The bounds of `root`'s meshes, leaving out additive glows, sprites and contact shadows (userData.decor). */
  function meshBounds(root: THREE.Object3D) {
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    root.updateWorldMatrix(true, true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData.decor) return;
      const material = child.material as THREE.Material | THREE.Material[];
      if (
        !Array.isArray(material) &&
        material.blending === THREE.AdditiveBlending
      )
        return;
      if (child instanceof THREE.InstancedMesh) {
        child.computeBoundingBox();
        part.copy(child.boundingBox!);
      } else {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        part.copy(child.geometry.boundingBox!);
      }
      box.union(part.applyMatrix4(child.matrixWorld));
    });
    return box;
  }

  /** The corners of every part's bounds, components and board-level parts alike. */
  const PART_POINTS: THREE.Vector3[] = [];
  for (const object of [
    ...sceneNodes.map((entry) => entry.part.object),
    ...fillParts,
  ]) {
    const box = meshBounds(object);
    if (box.isEmpty()) continue;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z])
          PART_POINTS.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  /** Board points the framing keeps in view: the board's corners and PART_POINTS. */
  const FRAME_POINTS = [...PART_POINTS];
  for (const x of [wx(-MARGIN), wx(STAGE_W + MARGIN)]) {
    for (const z of [wz(-MARGIN), wz(STAGE_H + MARGIN)]) {
      FRAME_POINTS.push(
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x, -BOARD_T, z),
      );
    }
  }

  /** Puts `cam` `distance` from `target`, turned `yaw` and raised `elevation`. */
  function placeCamera(
    cam: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    distance: number,
    yaw: number,
    elevation: number,
  ) {
    cam.position.set(
      target.x + distance * Math.sin(yaw) * Math.cos(elevation),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(yaw) * Math.cos(elevation),
    );
    cam.lookAt(target);
    cam.updateMatrixWorld();
  }

  /** The bounds of `points` on `cam`'s view, in clip space. */
  function screenBounds(points: THREE.Vector3[], cam: THREE.Camera) {
    const point = new THREE.Vector3();
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    };
    for (const p of points) {
      point.copy(p).project(cam);
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    }
    return bounds;
  }

  interface Resting {
    target: THREE.Vector3;
    distance: number;
  }

  /**
   * The target and distance at VIEW that fit FRAME_POINTS within FIT of
   * `cam`'s view and SHADOW_POINTS within SHADOW_FIT, centring the two.
   */
  function frameBoard(cam: THREE.PerspectiveCamera): Resting {
    const target = new THREE.Vector3(0, 0, 0.5);
    let distance = 80;
    const tan = Math.tan((cam.fov / 2) * DEG);
    const right = new THREE.Vector3(Math.cos(VIEW.yaw), 0, -Math.sin(VIEW.yaw));
    const back = new THREE.Vector3(-Math.sin(VIEW.yaw), 0, -Math.cos(VIEW.yaw));
    for (let pass = 0; pass < 48; pass++) {
      placeCamera(cam, target, distance, VIEW.yaw, VIEW.elevation);
      const board = screenBounds(FRAME_POINTS, cam);
      const shadow = screenBounds(SHADOW_POINTS, cam);
      // Each axis's extent with every point scaled by its limit, so 1 means it reaches its limit.
      const loX = Math.min(board.minX / FIT.x, shadow.minX / SHADOW_FIT);
      const hiX = Math.max(board.maxX / FIT.x, shadow.maxX / SHADOW_FIT);
      const loY = Math.min(board.minY / FIT.y, shadow.minY / SHADOW_FIT);
      const hiY = Math.max(board.maxY / FIT.y, shadow.maxY / SHADOW_FIT);
      const cx = ((loX + hiX) / 2) * FIT.x;
      const cy = ((loY + hiY) / 2) * FIT.y;
      const fill = Math.max((hiX - loX) / 2, (hiY - loY) / 2);
      distance *= 1 + (fill - 1) * 0.8;
      target.addScaledVector(right, cx * distance * tan * cam.aspect * 0.8);
      target.addScaledVector(
        back,
        (cy * distance * tan * 0.8) / Math.sin(VIEW.elevation),
      );
    }
    return { target, distance };
  }

  /**
   * Whether `cam`'s view holds every part (PART_POINTS within `margin` of
   * its edges in clip space), the whole board (FRAME_POINTS) and the page
   * shadow (SHADOW_POINTS, up to the edges).
   */
  function boardInView(cam: THREE.Camera, margin = 0.97) {
    const parts = screenBounds(PART_POINTS, cam);
    const board = screenBounds(FRAME_POINTS, cam);
    const shadow = screenBounds(SHADOW_POINTS, cam);
    const within = (bounds: ReturnType<typeof screenBounds>, limit: number) =>
      Math.max(-bounds.minX, bounds.maxX) <= limit &&
      Math.max(-bounds.minY, bounds.maxY) <= limit;
    return (
      within(parts, margin) &&
      within(board, 0.985) &&
      within(shadow, SHADOW_FIT)
    );
  }

  /**
   * Each step's resting view for `cam` around `frame`: drawn toward the
   * step's lit parts and closer, by as much of FOCUS_SHIFT and FOCUS_ZOOM as
   * keeps the board, its parts and its page shadow in view.
   */
  function restingViews(
    cam: THREE.PerspectiveCamera,
    frame: Resting,
  ): Resting[] {
    return data.steps.map((lights) => {
      const positions = lights
        .map((id) => SCENE_NODE.get(id)?.group.position)
        .filter(
          (position): position is THREE.Vector3 => position !== undefined,
        );
      if (positions.length === 0) return frame;
      const centre = positions
        .reduce((sum, p) => sum.add(p), new THREE.Vector3())
        .multiplyScalar(1 / positions.length);
      for (const share of [1, 0.66, 0.33]) {
        const target = frame.target.clone().lerp(centre, FOCUS_SHIFT * share);
        target.y = 0;
        const distance = frame.distance * (1 - FOCUS_ZOOM * share);
        placeCamera(cam, target, distance, VIEW.yaw, VIEW.elevation);
        if (boardInView(cam)) return { target, distance };
      }
      const target = frame.target.clone();
      target.y = 0;
      return { target, distance: frame.distance };
    });
  }

  paintMarkings();
  /** The camera resize() frames the board and each step's view with, at the canvas's aspect. */
  const probe = new THREE.PerspectiveCamera(
    camera.fov,
    camera.aspect,
    camera.near,
    camera.far,
  );

  let framing: Resting = { target: new THREE.Vector3(), distance: 50 };
  let views: Resting[] = [];
  /** Where the camera eases to: the current step's resting view, or the whole board's while every part is lit. */
  const focus = { target: new THREE.Vector3(), distance: 50 };
  const view = { target: new THREE.Vector3(), distance: 50, ready: false };
  function updateFocus() {
    const resting = (lightAll ? undefined : views[current]) ?? framing;
    focus.target.copy(resting.target);
    focus.distance = resting.distance;
    if (!view.ready || still) {
      view.target.copy(focus.target);
      view.distance = focus.distance;
      view.ready = true;
    }
  }

  /* ---------- Steps ---------- */
  let current = 0;
  let lightAll = false;

  /* ---------- Hover card ---------- */
  const canvas = renderer.domElement;
  const hover = matchMedia("(hover: hover)").matches;
  /** The card of the part under the mouse: its step's number, title, text and failure mode, beside the part. */
  const card = document.createElement("div");
  card.className = "board-card";
  card.setAttribute("aria-hidden", "true");
  card.hidden = true;
  if (hover) host.append(card);
  /** The part under the mouse, the step its card shows, and each part's bounds, taken at the first hover. */
  let hovered: (typeof sceneNodes)[number] | null = null;
  let cardIndex = -1;
  let partBoxes: THREE.Box3[] | null = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const boxOf = (entry: (typeof sceneNodes)[number]) => {
    if (!partBoxes) {
      scene.updateMatrixWorld(true);
      partBoxes = sceneNodes.map((each) =>
        new THREE.Box3().setFromObject(each.lift),
      );
    }
    return partBoxes[sceneNodes.indexOf(entry)]!;
  };

  /** Appends `text` to `parent`, its `**` pairs as <strong>. */
  function appendEmphasis(parent: HTMLElement, text: string) {
    text.split("**").forEach((part, index) => {
      if (index % 2 === 0) parent.append(part);
      else {
        const strong = document.createElement("strong");
        strong.textContent = part;
        parent.append(strong);
      }
    });
  }

  /** Fills the card with step `index`'s number plate, title, text and failure mode. */
  function fillCard(index: number) {
    const entry = data.cards[index]!;
    const plate = document.createElement("span");
    plate.className = "eyebrow-no";
    plate.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("b");
    title.className = "board-card-title";
    title.textContent = entry.title;
    const head = document.createElement("div");
    head.className = "board-card-head";
    head.append(plate, title);
    const text = document.createElement("p");
    text.className = "board-card-text";
    appendEmphasis(text, entry.text);
    card.replaceChildren(head, text);
    if (entry.failure) {
      const failure = document.createElement("p");
      failure.className = "board-card-failure";
      const key = document.createElement("span");
      key.textContent = data.failure;
      failure.append(key, " ");
      appendEmphasis(failure, entry.failure);
      card.append(failure);
    }
  }

  /** Places the card beside `entry`'s part as the camera sees it, or above or below it when neither side has room, inside the board. */
  function placeCard(entry: (typeof sceneNodes)[number]) {
    const box = boxOf(entry);
    const w = host.clientWidth;
    const h = host.clientHeight;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        )
        .project(camera);
      const x = ((corner.x + 1) / 2) * w;
      const y = ((1 - corner.y) / 2) * h;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 12;
    const edge = 8;
    let x: number;
    let y: number;
    if (right + gap + cw <= w - edge) {
      x = right + gap;
      y = top;
    } else if (left - gap - cw >= edge) {
      x = left - gap - cw;
      y = top;
    } else {
      x = (left + right) / 2 - cw / 2;
      y = bottom + gap + ch <= h - edge ? bottom + gap : top - gap - ch;
    }
    card.style.left = `${clamp(x, edge, Math.max(edge, w - cw - edge))}px`;
    card.style.top = `${clamp(y, edge, Math.max(edge, h - ch - edge))}px`;
  }

  /** Shows `entry`'s card with a hand pointer over its part, or hides it for null. */
  function showCard(entry: (typeof sceneNodes)[number] | null) {
    hovered = entry;
    const index = entry
      ? cardStep(data.steps, entry.node.id, current, lightAll)
      : -1;
    canvas.style.cursor = index >= 0 ? "pointer" : "";
    if (index < 0 || !data.cards?.[index]) {
      card.hidden = true;
      cardIndex = -1;
      return;
    }
    if (index !== cardIndex) fillCard(index);
    cardIndex = index;
    card.hidden = false;
    placeCard(entry!);
  }

  /** The pointer's last place on the canvas, tested for a part once per frame. */
  let aim: { x: number; y: number } | null = null;
  let aimFrame = 0;
  const hits: THREE.Intersection[] = [];
  /** The part whose surface is nearest under `aim`: its bounds pick the candidates, then its meshes decide. */
  function partUnderAim() {
    aimFrame = 0;
    if (!aim) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    ndc.set(
      ((aim.x - box.left) / box.width) * 2 - 1,
      -((aim.y - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    let nearest: (typeof sceneNodes)[number] | null = null;
    let distance = Infinity;
    for (const entry of sceneNodes) {
      if (!raycaster.ray.intersectBox(boxOf(entry), hit)) continue;
      hits.length = 0;
      raycaster.intersectObject(entry.lift, true, hits);
      const first = hits.find((each) => !(each.object instanceof THREE.Sprite));
      if (first && first.distance < distance) {
        distance = first.distance;
        nearest = entry;
      }
    }
    showCard(nearest);
  }
  /** Tests the part under the mouse at `event` on the next frame. */
  const onHover = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    aim = { x: event.clientX, y: event.clientY };
    if (!aimFrame) aimFrame = requestAnimationFrame(partUnderAim);
  };
  const onLeave = () => {
    aim = null;
    cancelAnimationFrame(aimFrame);
    aimFrame = 0;
    showCard(null);
  };
  if (hover) {
    canvas.addEventListener("pointermove", onHover);
    canvas.addEventListener("pointerleave", onLeave);
  }
  /** Whether the next frame snaps every eased value to its target. */
  let settle = true;
  /** Whether the board has framed itself and drawn, so a step change renders. */
  let booted = false;
  let shadowFrames = 2;

  /** Shows step `step` (from 0), or every part lit with `all`. */
  function setStep(step: number, all: boolean) {
    const next = clamp(
      Math.round(step) || 0,
      0,
      Math.max(0, data.steps.length - 1),
    );
    if (!settle && next === current && all === lightAll) return;
    current = next;
    lightAll = all;
    still = reduceMotion || all;
    const states = statesAt(data, current, all);
    sceneNodes.forEach((entry, index) => {
      entry.state = states.nodes[index] ?? "idle";
      entry.plinth.material = STATE_MATERIAL[entry.state];
    });
    sceneTraces.forEach((entry) => {
      const state = states.wires[entry.trace.index] ?? "idle";
      if (state === "lit" && entry.state !== "lit") {
        entry.clock = 0;
        entry.last = [];
      }
      entry.state = state;
      entry.mesh.material = STATE_MATERIAL[state];
    });
    const litNodes = all
      ? []
      : sceneNodes.filter((entry) => entry.state === "lit");
    litLights.forEach((light, index) => {
      const entry = litNodes[index];
      light.node = entry ?? null;
      if (entry) {
        light.key.position
          .copy(entry.group.position)
          .add(new THREE.Vector3(0, 4.2, 0.8));
        light.key.color.set(entry.node.kind === "beacon" ? 0xff6a3d : 0xffb34d);
        light.rim.position
          .copy(entry.group.position)
          .add(new THREE.Vector3(0, 0.9, entry.node.d / 2 + 1.3));
      }
    });
    updateFocus();
    shadowFrames = 45;
    if (hovered) showCard(hovered);
    if (!booted) return;
    if (still) {
      pause();
      renderStill();
    } else {
      start();
    }
  }

  /* ---------- Frame ---------- */
  const pointer = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    pointer.x = clamp(
      (event.clientX - (box.left + box.width / 2)) / (box.width / 2 + 200),
      -1,
      1,
    );
    pointer.y = clamp(
      (event.clientY - (box.top + box.height / 2)) / (box.height / 2 + 200),
      -1,
      1,
    );
  };
  const sway = finePointer && !reduceMotion;
  if (sway) addEventListener("pointermove", onPointer, { passive: true });
  const drift = { yaw: 0, pitch: 0 };

  /** Advances every animated value by `dt` seconds at time `t`. */
  function animate(dt: number, t: number) {
    const snap = settle || still;
    settle = false;
    const ease = 1 - Math.exp(-dt * 2.2);
    if (snap) {
      view.target.copy(focus.target);
      view.distance = focus.distance;
    } else {
      view.target.lerp(focus.target, ease);
      view.distance += (focus.distance - view.distance) * ease;
    }
    const follow = 1 - Math.exp(-dt * 3);
    const swayYaw = still
      ? 0
      : Math.sin(t * 0.13) * 0.6 * DEG + pointer.x * 0.9 * DEG;
    const swayPitch = still
      ? 0
      : Math.sin(t * 0.1 + 1) * 0.5 * DEG - pointer.y * 0.7 * DEG;
    drift.yaw += (swayYaw - drift.yaw) * (still ? 1 : follow);
    drift.pitch += (swayPitch - drift.pitch) * (still ? 1 : follow);
    placeCamera(
      camera,
      view.target,
      view.distance,
      VIEW.yaw + drift.yaw,
      VIEW.elevation + drift.pitch,
    );

    // The current step's pulse, 0 to 1 on a 2.1s cycle; held still it rests at 0.7.
    const pulse = still ? 0.7 : 0.5 + 0.5 * Math.sin(t * 3);
    goldLit.emissiveIntensity = (0.105 + 0.095 * pulse) * ILLUMINATION;
    // The LIVE LED breathes on a 2.6s cycle; held still it stays lit.
    const live = still ? 1 : 0.5 + 0.5 * Math.sin(t * 2.4);
    liveLed.material.emissiveIntensity = 1.1 + 1.6 * live;
    liveLed.glow.material.opacity = 0.18 + 0.32 * live;

    for (const entry of sceneNodes) {
      const target =
        entry.state === "lit" ? 2 : entry.state === "passed" ? 1 : 0;
      entry.level = snap
        ? target
        : entry.level + (target - entry.level) * (1 - Math.exp(-dt * 5));
      entry.energy *= Math.exp(-dt * 2.8);
      const lit = clamp(entry.level - 1, 0, 1);
      const passed = clamp(entry.level, 0, 1);
      entry.lift.position.y = smooth(lit) * 0.07;
      const upper = entry.level >= 1;
      const from = upper ? SHADE.passed : SHADE.idle;
      const to = upper ? SHADE.lit : SHADE.passed;
      const share = upper ? entry.level - 1 : entry.level;
      entry.shading.uExposure.value = mix(from.exposure, to.exposure, share);
      entry.shading.uDesaturate.value = mix(
        from.desaturate,
        to.desaturate,
        share,
      );
      entry.shading.uRim.value =
        mix(from.rim, to.rim, share) * (0.7 + 0.5 * pulse);
      entry.ledMaterial.emissive.copy(GOLD).lerp(HOT, lit);
      entry.ledMaterial.emissiveIntensity =
        (passed * 0.9 + lit * (2 + 2.6 * pulse + entry.energy * 1.5)) *
        ILLUMINATION;
      entry.ledGlow.material.opacity =
        (passed * 0.055 + lit * (0.1125 + 0.1 * pulse + entry.energy * 0.075)) *
        ILLUMINATION;
      entry.ledGlow.scale.setScalar(
        LED_GLOW * (1 + lit * (0.55 + 0.45 * pulse)),
      );
      entry.poolMaterial.opacity =
        lit * (0.1875 + 0.0625 * pulse + entry.energy * 0.075) * ILLUMINATION;
      for (const entryMarking of entry.markings)
        setInk(entryMarking, passed, lit, pulse);
      for (const finish of entry.finishes)
        setFinish(finish, passed, lit, pulse, entry.energy);
      entry.part.update(dt, t, lit, entry.energy, passed);
    }
    for (const light of litLights) {
      const entry = light.node;
      const lit = entry ? clamp(entry.level - 1, 0, 1) : 0;
      const energy = entry?.energy ?? 0;
      light.key.intensity =
        lit * (7.5 + 3 * pulse + energy * 2.5) * ILLUMINATION;
      light.rim.intensity = lit * (4 + 2 * pulse + energy * 1.5) * ILLUMINATION;
    }

    let bead = 0;
    for (const entry of sceneTraces) {
      const lit = entry.state === "lit";
      entry.on = snap
        ? lit
          ? 1
          : 0
        : clamp(entry.on + (lit ? dt * 2.5 : -dt * 2), 0, 1);
      entry.glow.visible = entry.on > 0;
      entry.uniforms.uOn.value = smooth(entry.on);
      entry.uniforms.uBase.value = still ? 0.95 : 0.5 + 0.35 * pulse;
      const heads = entry.uniforms.uHeads.value;
      heads.set(-1, -1, -1, -1);
      if (!lit || still) continue;
      entry.clock += dt;
      const period = entry.travel + 0.7;
      for (let k = 0; k < entry.heads; k++) {
        const phase = (entry.clock / period + k / entry.heads) % 1;
        const time = phase * period;
        const running = time < entry.travel;
        const along = running
          ? smooth(time / entry.travel) * 0.92 + (time / entry.travel) * 0.08
          : -1;
        heads.setComponent(k, along);
        const before = entry.last[k] ?? -1;
        if (before >= 0 && !running) {
          const target = SCENE_NODE.get(entry.trace.to);
          if (target) target.energy = 1;
        }
        entry.last[k] = along;
        if (running && bead < beads.length) {
          const sprite = beads[bead++]!;
          sprite.visible = true;
          entry.sampler.pointAt(along, TRACE_H + 0.1, sprite.position);
          sprite.material.opacity =
            Math.min(1, entry.on) * 0.225 * ILLUMINATION;
        }
      }
    }
    for (; bead < beads.length; bead++) beads[bead]!.visible = false;
  }

  function draw() {
    if (shadowFrames > 0) {
      renderer.shadowMap.needsUpdate = true;
      shadowFrames--;
    }
    renderer.render(scene, camera);
    if (hovered && !card.hidden) placeCard(hovered);
    if (host.dataset.ready === undefined) host.dataset.ready = "";
  }

  /** Renders one frame with every value at rest. */
  function renderStill() {
    animate(0.016, performance.now() / 1000);
    shadowFrames = Math.max(shadowFrames, 1);
    draw();
  }

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    probe.aspect = camera.aspect;
    probe.updateProjectionMatrix();
    framing = frameBoard(probe);
    views = restingViews(probe, framing);
    view.ready = false;
    updateFocus();
    if (booted && (still || !frame)) renderStill();
  }

  let frame = 0;
  let last = performance.now();
  let onScreen = true;
  let running = true;
  function loop(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    animate(dt, now / 1000);
    draw();
    frame = requestAnimationFrame(loop);
  }
  function start() {
    if (frame || still || !onScreen || document.hidden || !running) return;
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }
  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  const visibility = () => (document.hidden ? pause() : start());
  const watch = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    if (onScreen) start();
    else pause();
  });
  watch.observe(host);
  document.addEventListener("visibilitychange", visibility);
  const themes = new MutationObserver(() => {
    applyLook();
    if (still || !frame) renderStill();
  });
  themes.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  const sizes = new ResizeObserver(resize);
  sizes.observe(host);
  const onStep = (event: Event) => {
    const detail = (event as CustomEvent<FlowStepDetail | null>).detail;
    setStep(Number(detail?.step) || 0, detail?.all === true);
  };
  root?.addEventListener("flowstep", onStep);

  setStep(
    Number(root?.dataset.step) || 0,
    !root || root.dataset.flow === "all",
  );
  resize();
  booted = true;
  renderStill();
  start();

  return () => {
    running = false;
    pause();
    watch.disconnect();
    themes.disconnect();
    sizes.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    root?.removeEventListener("flowstep", onStep);
    if (sway) removeEventListener("pointermove", onPointer);
    canvas.removeEventListener("pointermove", onHover);
    canvas.removeEventListener("pointerleave", onLeave);
    cancelAnimationFrame(aimFrame);
    canvas.style.cursor = "";
    card.remove();
    disposeScene(
      scene,
      [
        roomEnvironment,
        glowMap,
        poolMap,
        brushTexture,
        grainTexture,
        ...SHADOWS.values(),
      ],
      Object.values(STATE_MATERIAL),
    );
    renderer.dispose();
    renderer.forceContextLoss();
    delete host.dataset.ready;
  };
}

/**
 * Disposes every geometry, material and texture under `scene`, with
 * `textures` and `materials` that may sit outside it.
 */
function disposeScene(
  scene: THREE.Scene,
  textures: THREE.Texture[],
  materials: THREE.Material[],
) {
  const allGeometries = new Set<THREE.BufferGeometry>();
  const allMaterials = new Set(materials);
  const allTextures = new Set(textures);
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      allGeometries.add(object.geometry as THREE.BufferGeometry);
      for (const material of [
        object.material as THREE.Material | THREE.Material[],
      ].flat()) {
        allMaterials.add(material);
      }
    }
  });
  for (const material of allMaterials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) allTextures.add(value);
    }
    material.dispose();
  }
  for (const geometry of allGeometries) geometry.dispose();
  for (const texture of allTextures) texture.dispose();
}
