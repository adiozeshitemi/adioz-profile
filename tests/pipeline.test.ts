// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import Pipeline3D from "../src/components/Hero/Pipeline3D.astro";
import { pipeline } from "../src/data/index";
import {
  BLOCK_AT,
  BLOCK_EVERY,
  isBlocked,
  startPipeline,
} from "../src/scripts/pipeline3d";
import { render, text } from "./render";

const names = Object.keys(pipeline.parts);
const parts = Object.values(pipeline.parts);

describe("Pipeline3D markup", () => {
  it("names the figure for assistive technology and hides its drawing", async () => {
    const doc = await render(Pipeline3D);
    const figure = doc.querySelector("figure.pipeline");
    expect(figure?.getAttribute("aria-label")).toBe(pipeline.label);
    for (const selector of [".flat", "canvas", ".labels3d"]) {
      expect(figure?.querySelector(selector)?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
  });

  it("draws every part as a panel in the flat diagram, the guardrail in gold", async () => {
    const doc = await render(Pipeline3D);
    const nodes = [...doc.querySelectorAll(".flat .panel.node")];
    expect(
      nodes.map((node) => [
        text(node.querySelector("b")),
        text(node.querySelector("small")),
      ]),
    ).toEqual(parts.map((part) => [part.title, part.detail]));
    expect(
      nodes
        .filter((node) => node.classList.contains("gold"))
        .map((n) => text(n.querySelector("b"))),
    ).toEqual([pipeline.parts.guard.title]);
    expect(doc.querySelectorAll(".flat svg path")).toHaveLength(7);
  });

  it("renders a 3D label for every part, keyed by its name", async () => {
    const doc = await render(Pipeline3D);
    const labels = [...doc.querySelectorAll(".labels3d .label3d")];
    expect(labels.map((label) => label.getAttribute("data-part"))).toEqual(
      names,
    );
    expect(labels.map((label) => text(label.querySelector("b")))).toEqual(
      parts.map((part) => part.title),
    );
  });
});

describe("pipeline runs", () => {
  it(`blocks run ${BLOCK_AT} of every ${BLOCK_EVERY} at the guardrail`, () => {
    const blocked = Array.from({ length: 8 }, (_, index) => isBlocked(index));
    expect(blocked).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
    ]);
  });
});

describe("startPipeline", () => {
  it("returns null and leaves the flat diagram when WebGL is unavailable", () => {
    document.body.innerHTML = `<div class="stage"><canvas></canvas></div>`;
    const stage = document.querySelector<HTMLElement>(".stage")!;
    expect(startPipeline(stage, true)).toBeNull();
    expect(stage.hasAttribute("data-ready")).toBe(false);
  });
});
