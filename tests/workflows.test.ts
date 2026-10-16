import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WorkflowContent } from "../src/data/types";
import {
  allWorkflows,
  ownWorkflows,
  peerWorkflows,
  toWorkflow,
} from "../src/lib/workflows";

/** A two-node workflow that breaks no rule. */
const valid = (): WorkflowContent => ({
  title: "Echo",
  summary: "A request and its reply.",
  problem: "Requests go unanswered.",
  nodes: [
    { id: "client", label: "Client", detail: "Sends", col: 0, row: 0 },
    { id: "server", label: "Server", detail: "Replies", col: 1, row: 0 },
  ],
  edges: [{ from: "client", to: "server", label: "request" }],
  steps: [
    { title: "Send", text: "The client sends.", lights: ["client"] },
    { title: "Reply", text: "The server replies.", lights: ["server"] },
  ],
  tradeoffs: ["Simple, but synchronous."],
  stack: ["HTTP"],
});

const author = {
  name: "Octo Cat",
  links: [
    { title: "Portfolio", url: "https://octo.example.com", icon: "globe" },
  ],
};

describe("toWorkflow", () => {
  it("names the workflow by its file and gives it a page path", () => {
    expect(toWorkflow("echo.json", valid())).toMatchObject({
      slug: "echo",
      path: "/workflows/echo/",
    });
    expect(
      toWorkflow("peers/octo-echo.json", { ...valid(), author }),
    ).toMatchObject({
      slug: "octo-echo",
      path: "/workflows/peers/octo-echo/",
    });
  });

  const broken: [string, (w: WorkflowContent) => WorkflowContent, string][] = [
    [
      "a file name that is not kebab-case",
      (w) => w,
      'file name "Echo_1" is not lowercase words joined by hyphens',
    ],
    ["a missing title", (w) => ({ ...w, title: " " }), "title is missing"],
    [
      "a stack that is not text",
      (w) => ({ ...w, stack: [1 as unknown as string] }),
      "stack is not a list of text",
    ],
    [
      "a repeated node id",
      (w) => ({ ...w, nodes: [w.nodes[0]!, { ...w.nodes[0]!, col: 1 }] }),
      'node id "client" is used twice',
    ],
    [
      "a column past the last",
      (w) => ({ ...w, nodes: [w.nodes[0]!, { ...w.nodes[1]!, col: 4 }] }),
      'node "server" needs a col from 0 to 3 and a row from 0',
    ],
    [
      "a node of an unknown kind",
      (w) => ({
        ...w,
        nodes: [
          w.nodes[0]!,
          { ...w.nodes[1]!, kind: "lamp" as unknown as "qfp" },
        ],
      }),
      'node "server" has unknown kind "lamp"',
    ],
    [
      "two nodes in one cell",
      (w) => ({ ...w, nodes: [w.nodes[0]!, { ...w.nodes[1]!, col: 0 }] }),
      'node "server" shares cell 0,0',
    ],
    [
      "an empty column",
      (w) => ({ ...w, nodes: [w.nodes[0]!, { ...w.nodes[1]!, col: 2 }] }),
      "col 1 is empty",
    ],
    [
      "an edge from an unknown node",
      (w) => ({ ...w, edges: [{ from: "cliant", to: "server", label: "x" }] }),
      'edge 0 leaves unknown node "cliant"',
    ],
    [
      "an edge to an unknown node",
      (w) => ({ ...w, edges: [{ from: "client", to: "db", label: "x" }] }),
      'edge 0 reaches unknown node "db"',
    ],
    [
      "an edge to its own node",
      (w) => ({
        ...w,
        edges: [{ from: "client", to: "client", label: "x" }],
      }),
      'edge 0 joins "client" to itself',
    ],
    [
      "a repeated edge",
      (w) => ({ ...w, edges: [w.edges[0]!, w.edges[0]!] }),
      "edge 1 repeats client to server",
    ],
    [
      "a step lighting an unknown node",
      (w) => ({
        ...w,
        steps: [...w.steps, { title: "X", text: "Y", lights: ["db"] }],
      }),
      'step 2 lights unknown node "db"',
    ],
    [
      "a node no step lights",
      (w) => ({ ...w, steps: [w.steps[0]!] }),
      'no step lights node "server"',
    ],
    [
      "a compensation without its weakness",
      (w) => ({
        ...w,
        compensations: [{ weakness: "", compensation: "Retry." }],
      }),
      "compensation 0 needs a weakness and a compensation",
    ],
    [
      "an author outside peers/",
      (w) => ({ ...w, author }),
      "author is set outside peers/",
    ],
  ];

  it.each(broken)("rejects %s", (_, change, message) => {
    const file = message.startsWith("file name") ? "Echo_1.json" : "echo.json";
    expect(() => toWorkflow(file, change(valid()))).toThrow(
      `workflows/${file}: ${message}`,
    );
  });

  it("requires a peer's author with a name and https: links", () => {
    expect(() => toWorkflow("peers/octo.json", valid())).toThrow(
      "workflows/peers/octo.json: author needs a name",
    );
    expect(() =>
      toWorkflow("peers/octo.json", {
        ...valid(),
        author: { ...author, links: [] },
      }),
    ).toThrow("workflows/peers/octo.json: author needs a link");
    expect(() =>
      toWorkflow("peers/octo.json", {
        ...valid(),
        author: {
          ...author,
          links: [{ ...author.links[0]!, url: "http://octo.example.com" }],
        },
      }),
    ).toThrow(
      'workflows/peers/octo.json: author link "Portfolio" is not an https: url',
    );
  });
});

describe("the loaded workflows", () => {
  it("lists the owner's workflows, then the peers', each sorted by slug", () => {
    expect(ownWorkflows.map((w) => w.slug)).toContain("mlops-loop");
    expect(peerWorkflows.map((w) => w.slug)).toContain(
      "ruchitasingla-mlops-loop",
    );
    expect(allWorkflows).toEqual([...ownWorkflows, ...peerWorkflows]);
    for (const list of [ownWorkflows, peerWorkflows]) {
      const slugs = list.map((w) => w.slug);
      expect(slugs).toEqual([...slugs].sort());
    }
  });

  it("credits each peer's workflow, and only those", () => {
    expect(ownWorkflows.every((w) => !w.author)).toBe(true);
    expect(peerWorkflows.every((w) => w.author?.links.length)).toBe(true);
  });
});

/** Every string value in `value`, searched through arrays and objects. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

/** Every workflow file under src/data/workflows/, peers included, as its path there. */
function workflowFiles(): string[] {
  return readdirSync(new URL("../src/data/workflows", import.meta.url), {
    recursive: true,
  })
    .map(String)
    .filter((path) => path.endsWith(".json"))
    .sort();
}

describe("the workflow files", () => {
  it("loads every workflow file, each under its own slug", () => {
    const loaded = allWorkflows.map((workflow) =>
      workflow.author ? `peers/${workflow.slug}.json` : `${workflow.slug}.json`,
    );
    expect(loaded.sort()).toEqual(workflowFiles());
    expect(new Set(allWorkflows.map((w) => w.slug)).size).toBe(
      allWorkflows.length,
    );
  });

  it("has an SVG in src/icons/ for every peer author link's icon", () => {
    for (const link of allWorkflows.flatMap((w) => w.author?.links ?? [])) {
      const file = new URL(`../src/icons/${link.icon}.svg`, import.meta.url);
      expect(existsSync(file), link.icon).toBe(true);
    }
  });

  it("pairs every ** emphasis marker in the workflows", () => {
    for (const workflow of allWorkflows) {
      for (const value of strings(workflow)) {
        expect(value.split("**").length % 2, value).toBe(1);
      }
    }
  });
});
