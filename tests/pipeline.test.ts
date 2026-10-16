// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  BLOCK_AT,
  BLOCK_EVERY,
  isBlocked,
  startPipeline,
} from "../src/scripts/pipeline3d";

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
