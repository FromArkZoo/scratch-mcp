// tests/compiler/run-ir.test.ts
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript } from "../../src/compiler/types.js";
import { runHeadless } from "./vm-harness.js";

const project: Project = {
  name: "Spin", targets: [
    { name: "Stage", isStage: true, variables: [{ name: "angle", value: 0 }] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};
const spin: ParsedScript = { blocks: [
  { opcode: "event_whenflagclicked", inputs: {}, fields: {}, substacks: {} },
  { opcode: "data_setvariableto", inputs: { VALUE: { kind: "literal", value: "0" } }, fields: { VARIABLE: "angle" }, substacks: {} },
  { opcode: "control_repeat", inputs: { TIMES: { kind: "literal", value: "36" } }, fields: {}, substacks: {
    SUBSTACK: [
      { opcode: "motion_turnright", inputs: { DEGREES: { kind: "literal", value: "10" } }, fields: {}, substacks: {} },
      { opcode: "data_changevariableby", inputs: { VALUE: { kind: "literal", value: "10" } }, fields: { VARIABLE: "angle" }, substacks: {} },
    ],
  } },
] };

test("a hand-built IR compiles to an .sb3 that runs: angle reaches 360", async () => {
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", [spin]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const state = await runHeadless(sb3);
  expect(Number(state.variable("angle"))).toBe(360);
});
