/*
 * The workflows: every JSON file in src/data/workflows/ (the owner's) and
 * src/data/workflows/peers/ (other engineers', each with an `author`), loaded
 * at build time and checked against the rules a WorkflowContent type cannot
 * express. A file that breaks a rule throws an Error naming it, e.g.
 * "workflows/mlops-loop.json: edge 3 leaves unknown node \"cach\"", which
 * fails the build. Each list is sorted by slug.
 */
import type {
  Workflow,
  WorkflowContent,
  WorkflowNode,
  WorkflowPartKind,
} from "../data/types";

/** The diagram's grid has at most this many columns. */
export const MAX_COLUMNS = 4;

/** Every WorkflowPartKind, the components the 3D board can build. */
export const PART_KINDS: readonly WorkflowPartKind[] = [
  "qfp",
  "bga",
  "socket",
  "memory",
  "gpu",
  "trimmer",
  "die",
  "rj45",
  "radio",
  "secure",
  "toggle",
  "cpu",
  "gauge",
  "beacon",
];

const ownFiles = import.meta.glob<WorkflowContent>("../data/workflows/*.json", {
  eager: true,
  import: "default",
});
const peerFiles = import.meta.glob<WorkflowContent>(
  "../data/workflows/peers/*.json",
  { eager: true, import: "default" },
);

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";
const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText);
const isCell = (value: unknown, max = Infinity): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < max;

/**
 * `content` as a Workflow named `file` (its path under src/data/workflows/,
 * e.g. "peers/ruchitasingla-mlops-loop.json"). Throws unless:
 * - `title`, `summary` and `problem` are non-empty text, and `tradeoffs` and
 *   `stack` lists of it;
 * - every node has a unique id, a label, a detail, its own grid cell (in a
 *   grid of at most MAX_COLUMNS columns with no empty row or column) and, if
 *   given, a kind from PART_KINDS;
 * - every edge joins two different known nodes, at most once each way;
 * - every step has a title and text and lights known nodes, and every node
 *   is lit by a step;
 * - each compensation, when given, names a weakness and a compensation;
 * - a file in peers/ has an `author` with a name and at least one link, each
 *   with a title, an icon and an https: URL, and no other file has one.
 */
export function toWorkflow(file: string, content: WorkflowContent): Workflow {
  const fail = (rule: string): never => {
    throw new Error(`workflows/${file}: ${rule}`);
  };
  const peer = file.startsWith("peers/");
  const slug = file.replace(/^peers\//, "").replace(/\.json$/, "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    fail(`file name "${slug}" is not lowercase words joined by hyphens`);
  }

  for (const key of ["title", "summary", "problem"] as const) {
    if (!isText(content[key])) fail(`${key} is missing`);
  }
  for (const key of ["tradeoffs", "stack"] as const) {
    if (!isTextList(content[key])) fail(`${key} is not a list of text`);
  }

  if (!Array.isArray(content.nodes) || content.nodes.length === 0) {
    fail("nodes is empty");
  }
  const nodes = new Map<string, WorkflowNode>();
  const cells = new Set<string>();
  content.nodes.forEach((node, index) => {
    if (!isText(node.id)) fail(`node ${index} has no id`);
    if (nodes.has(node.id)) fail(`node id "${node.id}" is used twice`);
    if (!isText(node.label) || !isText(node.detail)) {
      fail(`node "${node.id}" needs a label and a detail`);
    }
    if (!isCell(node.col, MAX_COLUMNS) || !isCell(node.row)) {
      fail(
        `node "${node.id}" needs a col from 0 to ${MAX_COLUMNS - 1} and a row from 0`,
      );
    }
    if (node.kind !== undefined && !PART_KINDS.includes(node.kind)) {
      fail(`node "${node.id}" has unknown kind "${node.kind}"`);
    }
    const cell = `${node.col},${node.row}`;
    if (cells.has(cell)) fail(`node "${node.id}" shares cell ${cell}`);
    nodes.set(node.id, node);
    cells.add(cell);
  });
  const all = [...nodes.values()];
  for (const axis of ["col", "row"] as const) {
    const last = Math.max(...all.map((node) => node[axis]));
    for (let at = 0; at <= last; at++) {
      if (!all.some((node) => node[axis] === at))
        fail(`${axis} ${at} is empty`);
    }
  }

  if (!Array.isArray(content.edges)) fail("edges is not a list");
  const hops = new Set<string>();
  content.edges.forEach((edge, index) => {
    if (!nodes.has(edge.from)) {
      fail(`edge ${index} leaves unknown node "${edge.from}"`);
    }
    if (!nodes.has(edge.to)) {
      fail(`edge ${index} reaches unknown node "${edge.to}"`);
    }
    if (edge.from === edge.to)
      fail(`edge ${index} joins "${edge.to}" to itself`);
    if (!isText(edge.label)) fail(`edge ${index} has no label`);
    const hop = `${edge.from}>${edge.to}`;
    if (hops.has(hop)) fail(`edge ${index} repeats ${edge.from} to ${edge.to}`);
    hops.add(hop);
  });

  if (!Array.isArray(content.steps) || content.steps.length === 0) {
    fail("steps is empty");
  }
  const lit = new Set<string>();
  content.steps.forEach((step, index) => {
    if (!isText(step.title) || !isText(step.text)) {
      fail(`step ${index} needs a title and text`);
    }
    if (!isTextList(step.lights) || step.lights.length === 0) {
      fail(`step ${index} lights no node`);
    }
    for (const id of step.lights) {
      if (!nodes.has(id)) fail(`step ${index} lights unknown node "${id}"`);
      lit.add(id);
    }
    if (step.failure !== undefined && !isText(step.failure)) {
      fail(`step ${index} has an empty failure`);
    }
  });
  for (const id of nodes.keys()) {
    if (!lit.has(id)) fail(`no step lights node "${id}"`);
  }

  if (content.compensations !== undefined) {
    if (!Array.isArray(content.compensations)) {
      fail("compensations is not a list");
    }
    content.compensations.forEach((item, index) => {
      if (!isText(item.weakness) || !isText(item.compensation)) {
        fail(`compensation ${index} needs a weakness and a compensation`);
      }
    });
  }

  if (peer) {
    if (!isText(content.author?.name)) fail("author needs a name");
    const links = content.author?.links;
    if (!Array.isArray(links) || links.length === 0)
      fail("author needs a link");
    for (const link of links ?? []) {
      if (!isText(link.title) || !isText(link.icon)) {
        fail("each author link needs a title and an icon");
      }
      if (!link.url?.startsWith("https:")) {
        fail(`author link "${link.title}" is not an https: url`);
      }
    }
  } else if (content.author) {
    fail("author is set outside peers/");
  }

  const path = `/workflows/${peer ? "peers/" : ""}${slug}/`;
  return { ...content, slug, path };
}

/** The files of a glob as workflows, sorted by slug; `base` is the glob's directory. */
function load(files: Record<string, WorkflowContent>, base: string) {
  return Object.entries(files)
    .map(([key, content]) => toWorkflow(key.slice(base.length), content))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The owner's workflows, from src/data/workflows/*.json. */
export const ownWorkflows: Workflow[] = load(ownFiles, "../data/workflows/");
/** Other engineers' workflows, from src/data/workflows/peers/*.json. */
export const peerWorkflows: Workflow[] = load(peerFiles, "../data/workflows/");
/** Every workflow: the owner's, then the peers'. */
export const allWorkflows: Workflow[] = [...ownWorkflows, ...peerWorkflows];
