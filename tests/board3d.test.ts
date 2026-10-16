import { describe, expect, it, vi } from "vitest";
import Board3D from "../src/components/Workflow/Board3D.astro";
import mlops from "../src/data/workflows/mlops-loop.json";
import peer from "../src/data/workflows/peers/ruchitasingla-mlops-loop.json";
import type { WorkflowPartKind } from "../src/data/types";
import { ownWorkflows } from "../src/lib/workflows";
import {
  attachEnd,
  boardAspect,
  boardFills,
  boardRoutes,
  CELL_W,
  clearOf,
  KIND_DEPTH,
  kindOf,
  layoutBoard,
  meterCaptions,
  nameSplits,
  nodeAreas,
  partNumber,
  REF_PREFIX,
  roundedPolyline,
  silkscreen,
  startBoard,
  statesAt,
  type BoardData,
  type BoardNode,
} from "../src/scripts/board3d";
import type { Point } from "../src/scripts/flow";
import { render } from "./render";

const nodesOf = (workflow: { nodes: unknown[] }) =>
  workflow.nodes as BoardNode[];

/** A workflow's layout, wires, part areas and board-level parts. */
function board(nodes: BoardNode[], edges: { from: string; to: string }[]) {
  const layout = layoutBoard(nodes);
  const routes = boardRoutes(layout, nodes, edges);
  const areas = nodeAreas(layout, nodes, routes);
  const fills = boardFills(layout, nodes, areas, routes);
  return { layout, routes, areas, fills };
}

/** A node at `col`, `row` with `kind`, its id and label from its cell. */
const at = (col: number, row: number, kind?: WorkflowPartKind): BoardNode => ({
  id: `n${col}${row}`,
  label: `Part ${col} ${row}`,
  col,
  row,
  kind,
});

describe("kindOf", () => {
  it("takes a node's kind, and qfp when it has none or one the board does not know", () => {
    expect(kindOf({ kind: "gpu" })).toBe("gpu");
    expect(kindOf({})).toBe("qfp");
    expect(kindOf({ kind: "warp-drive" })).toBe("qfp");
    expect(kindOf({ kind: "toString" })).toBe("qfp");
  });

  it("knows a depth and a reference designator for every kind", () => {
    expect(Object.keys(REF_PREFIX).sort()).toEqual(
      Object.keys(KIND_DEPTH).sort(),
    );
  });
});

describe("layoutBoard", () => {
  it("lays the grid out on CELL_W columns, each row as tall as its tallest kind", () => {
    const layout = layoutBoard(nodesOf(mlops));
    expect(layout.colLeft).toEqual([20, 215, 410]);
    expect(layout.rowHeight).toEqual([51, 51, 67, 51, 67, 51]);
    expect(layout.rowTop).toEqual([20, 93, 166, 255, 328, 417]);
    expect([layout.width, layout.height]).toEqual([599, 488]);
  });

  it("gives each node its whole cell", () => {
    const nodes = nodesOf(mlops);
    const layout = layoutBoard(nodes);
    const evaluate = nodes.findIndex((node) => node.id === "evaluate");
    expect(layout.boxes[evaluate]).toEqual({
      left: 410,
      top: 166,
      right: 410 + CELL_W,
      bottom: 233,
    });
  });

  it("frames a three-column, six-row board at about 640 by 420", () => {
    expect(boardAspect(layoutBoard(nodesOf(mlops)))).toBeCloseTo(640 / 420, 2);
    expect(boardAspect(layoutBoard(nodesOf(peer)))).toBeGreaterThan(
      boardAspect(layoutBoard(nodesOf(mlops))),
    );
  });
});

describe("nodeAreas", () => {
  it("grows a trimmer bank into the top half of the empty cell under it", () => {
    const nodes = nodesOf(mlops);
    const { layout, areas } = board(nodes, mlops.edges);
    nodes.forEach((node, index) => {
      if (node.id === "tune") {
        expect(areas[index]).toEqual({ ...layout.boxes[index], bottom: 196 });
      } else {
        expect(areas[index]).toEqual(layout.boxes[index]);
      }
    });
  });

  it("grows up into the empty cell above when the cell below is taken, by at most the gutter and half that cell", () => {
    const nodes = [at(1, 0), at(0, 1, "trimmer"), at(1, 1), at(0, 2)];
    const { layout, areas } = board(nodes, []);
    expect(areas[1]).toEqual({ ...layout.boxes[1], top: 93 - (22 + 51 / 2) });
  });

  it("keeps a trimmer bank in its cell without an empty neighbour", () => {
    const nodes = nodesOf(peer);
    const { layout, areas } = board(nodes, peer.edges);
    const tune = nodes.findIndex((node) => node.id === "tune");
    expect(areas[tune]).toEqual(layout.boxes[tune]);
  });

  it("keeps a trimmer bank in its cell when a wire runs where it would grow", () => {
    const nodes = [at(0, 0, "trimmer"), at(1, 0), at(0, 2), at(1, 1)];
    const layout = layoutBoard(nodes);
    const under: Point[][] = [
      [
        [0, 82],
        [300, 82],
      ],
    ];
    expect(nodeAreas(layout, nodes, [])[0]).toEqual({
      ...layout.boxes[0],
      bottom: 71 + 22 + 51 / 2,
    });
    expect(nodeAreas(layout, nodes, under)[0]).toEqual(layout.boxes[0]);
  });
});

describe("boardFills", () => {
  it("fills the mlops loop's empty cells with the regulator, the clock and the bulk capacitors", () => {
    const { fills } = board(nodesOf(mlops), mlops.edges);
    expect(fills).toEqual([
      {
        kind: "vrm",
        ref: "VR1",
        rect: { left: 418, right: 571, top: 84, bottom: 153 },
      },
      {
        kind: "rtc",
        ref: "BT1",
        rect: { left: 28, right: 181, top: 207, bottom: 242 },
      },
      {
        kind: "bulk",
        ref: "C40",
        rect: { left: 223, right: 571, top: 414, bottom: 477 },
      },
    ]);
  });

  it("keeps every board-level part clear of every wire", () => {
    for (const workflow of [mlops, peer]) {
      const { fills, routes } = board(nodesOf(workflow), workflow.edges);
      for (const { rect } of fills) {
        for (const points of routes) {
          points.slice(1).forEach((point, i) => {
            const from = points[i]!;
            const apart =
              Math.max(from[0], point[0]) <= rect.left - 8 ||
              Math.min(from[0], point[0]) >= rect.right + 8 ||
              Math.max(from[1], point[1]) <= rect.top - 8 ||
              Math.min(from[1], point[1]) >= rect.bottom + 8;
            expect(apart).toBe(true);
          });
        }
      }
    }
  });

  it("gives single cells the regulator and the clock in turn, apart where they meet", () => {
    const { fills } = board(nodesOf(peer), peer.edges);
    expect(fills.map((fill) => fill.ref)).toEqual(["VR1", "BT1", "VR2"]);
    expect(fills[1]!.rect.top - fills[0]!.rect.bottom).toBe(22);
    expect(fills[2]!.rect.top - fills[1]!.rect.bottom).toBe(22);
  });

  it("runs the bulk capacitors across neighbouring empty cells, but not across a gutter a wire runs down", () => {
    const nodes = [at(0, 0), at(1, 0), at(2, 0), at(0, 1), at(1, 2)];
    const layout = layoutBoard(nodes);
    const areas = nodeAreas(layout, nodes, []);
    expect(
      boardFills(layout, nodes, areas, []).map((fill) => fill.kind),
    ).toEqual(["bulk", "vrm", "rtc"]);
    const down: Point[][] = [
      [
        [397.5, 0],
        [397.5, 300],
      ],
    ];
    expect(
      boardFills(layout, nodes, areas, down).map((fill) => fill.kind),
    ).toEqual(["vrm", "rtc", "vrm", "rtc"]);
  });
});

describe("clearOf", () => {
  it("moves the side that keeps the most room past a wire", () => {
    const rect = { left: 0, right: 200, top: 0, bottom: 60 };
    const wire: [Point, Point] = [
      [150, -20],
      [150, -3],
    ];
    expect(clearOf(rect, [wire], 8)).toEqual({ ...rect, top: 5 });
  });

  it("drops a part left too small", () => {
    const rect = { left: 0, right: 200, top: 0, bottom: 40 };
    const wire: [Point, Point] = [
      [-10, 20],
      [210, 20],
    ];
    expect(clearOf(rect, [wire], 8)).toBeNull();
  });
});

describe("partNumber", () => {
  it("derives a part number from the node's id and label alone", () => {
    const node = { id: "features", label: "Feature engineering" };
    expect(partNumber(node)).toBe(partNumber({ ...node }));
    expect(partNumber(node)).toMatch(/^AZ-FE\d{2} · \d{4}$/);
    expect(partNumber({ ...node, id: "other" })).not.toBe(partNumber(node));
  });

  it("takes the initials of the first two words, leaving out joining words", () => {
    expect(partNumber({ id: "a", label: "A/B test" })).toMatch(/^AZ-AB/);
    expect(
      partNumber({ id: "m", label: "Drift and latency monitoring" }),
    ).toMatch(/^AZ-DL/);
    expect(partNumber({ id: "e", label: "Evaluation" })).toMatch(/^AZ-EV/);
  });

  it("marks a secure element with its own maker prefix", () => {
    expect(
      partNumber({ id: "sign", label: "Signed bundle", kind: "secure" }),
    ).toMatch(/^SE-SB\d{2} · \d{4}$/);
  });

  it("names no country", () => {
    for (const node of [...nodesOf(mlops), ...nodesOf(peer)]) {
      expect(partNumber(node)).not.toMatch(/[A-Z]{3}$/);
    }
  });
});

describe("markings", () => {
  it("breaks a name after a space or a hyphen", () => {
    expect(nameSplits("MULTI-TEACHER DISTILLATION")).toEqual([
      ["MULTI-TEACHER DISTILLATION"],
      ["MULTI-", "TEACHER DISTILLATION"],
      ["MULTI-TEACHER", "DISTILLATION"],
    ]);
  });

  it("captions a gauge's meters with the first word of its label and the latency scale", () => {
    expect(meterCaptions("Drift and latency monitoring")).toEqual([
      "DRIFT",
      "P99 MS",
    ]);
  });

  it("prints the board's name, revision and counts on the silkscreen", () => {
    const text = silkscreen({
      name: "adioz  mlops-loop.flow",
      nodes: nodesOf(mlops),
      edges: mlops.edges,
    });
    expect(text.title).toBe("ADIOZ  MLOPS-LOOP.FLOW");
    expect(text.meta).toMatch(/^REV \d{2} · 14 PARTS · 15 HOPS · ENIG · 6L$/);
  });
});

describe("statesAt", () => {
  const data: Pick<BoardData, "nodes" | "edges" | "steps"> = {
    nodes: ["a", "b", "c"].map((id, col) => ({ id, label: id, col, row: 0 })),
    edges: [
      { from: "a", to: "b", label: "ab" },
      { from: "b", to: "c", label: "bc" },
    ],
    steps: [["a"], ["b"], ["c"]],
  };

  it("lights the step's parts and hops and passes the earlier steps'", () => {
    expect(statesAt(data, 0)).toEqual({
      nodes: ["lit", "idle", "idle"],
      wires: ["idle", "idle"],
    });
    expect(statesAt(data, 2)).toEqual({
      nodes: ["passed", "passed", "lit"],
      wires: ["passed", "lit"],
    });
  });

  it("lights every part and hop with all", () => {
    expect(statesAt(data, -1, true)).toEqual({
      nodes: ["lit", "lit", "lit"],
      wires: ["lit", "lit"],
    });
  });

  it("holds a step out of range to the first or last", () => {
    expect(statesAt(data, -3)).toEqual(statesAt(data, 0));
    expect(statesAt(data, 9)).toEqual(statesAt(data, 2));
  });
});

describe("trace geometry", () => {
  it("rounds each corner and marks its midpoint", () => {
    const { points, corners } = roundedPolyline([
      [0, 0],
      [40, 0],
      [40, 40],
    ]);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([40, 40]);
    expect(points).toContainEqual([32, 0]);
    expect(points).toContainEqual([40, 8]);
    expect(corners).toEqual([[38, 2]]);
  });

  it("keeps a straight wire's two ends", () => {
    expect(
      roundedPolyline([
        [0, 5],
        [26, 5],
      ]),
    ).toEqual({
      points: [
        [0, 5],
        [26, 5],
      ],
      corners: [],
    });
  });

  it("moves a trace's end along its run onto the near side of a plinth", () => {
    const rect = { left: 10, right: 90, top: 20, bottom: 60 };
    const points: Point[] = [
      [100, 40],
      [140, 40],
    ];
    attachEnd(points, true, rect);
    expect(points[0]).toEqual([90, 40]);
    const down: Point[] = [
      [50, 0],
      [50, 18],
    ];
    attachEnd(down, false, rect);
    expect(down[1]).toEqual([50, 20]);
  });
});

describe("Board3D markup", () => {
  const [workflow] = ownWorkflows;

  it("renders the board's host with a hidden canvas and its data", async () => {
    const doc = await render(Board3D, { props: { workflow } });
    const host = doc.querySelector<HTMLElement>("div.board3d[data-board3d]");
    expect(host).not.toBeNull();
    expect(host!.querySelector("canvas")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(host!.hasAttribute("data-ready")).toBe(false);
    const data = JSON.parse(
      host!.querySelector('script[type="application/json"]')!.textContent!,
    ) as BoardData;
    expect(data.name).toBe(`adioz  ${workflow!.slug}.flow`);
    expect(data.nodes.map((node) => [node.id, node.kind])).toEqual(
      workflow!.nodes.map((node) => [node.id, node.kind ?? "qfp"]),
    );
    expect(data.edges).toEqual(
      workflow!.edges.map(({ from, to, label }) => ({ from, to, label })),
    );
    expect(data.steps).toEqual(workflow!.steps.map((step) => step.lights));
  });

  it("sizes the host to the board's aspect ratio", async () => {
    const doc = await render(Board3D, { props: { workflow } });
    const style = doc.querySelector(".board3d")?.getAttribute("style") ?? "";
    const aspect = boardAspect(layoutBoard(nodesOf(workflow!)));
    expect(style).toBe(`--board-aspect: ${aspect.toFixed(4)}`);
  });
});

describe("startBoard", () => {
  /** A stand-in for a .board3d holding `canvas` and the JSON `text`. */
  const host = (canvas: object | null, text: string | null) =>
    ({
      querySelector: (selector: string) =>
        selector === "canvas"
          ? canvas
          : text === null
            ? null
            : { textContent: text },
    }) as unknown as HTMLElement;
  const data: BoardData = {
    name: "adioz  test.flow",
    nodes: [at(0, 0)],
    edges: [],
    steps: [["n00"]],
  };

  it("returns null without a canvas or data", () => {
    expect(startBoard(host(null, JSON.stringify(data)), true)).toBeNull();
    expect(startBoard(host({}, null), true)).toBeNull();
    expect(startBoard(host({}, "{"), true)).toBeNull();
    expect(
      startBoard(host({}, JSON.stringify({ ...data, nodes: [] })), true),
    ).toBeNull();
  });

  it("returns null when a WebGL context cannot be created", () => {
    const canvas = {
      getContext: () => null,
      addEventListener() {},
      removeEventListener() {},
      style: {},
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(startBoard(host(canvas, JSON.stringify(data)), true)).toBeNull();
    } finally {
      error.mockRestore();
    }
  });
});
