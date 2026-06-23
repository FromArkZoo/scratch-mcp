// tests/compiler/packager.test.ts
import JSZip from "jszip";
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript } from "../../src/compiler/types.js";

const project: Project = {
  name: "T",
  targets: [
    { name: "Stage", isStage: true, variables: [{ name: "angle", value: 0 }] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};
const spin: ParsedScript = {
  blocks: [
    { opcode: "event_whenflagclicked", inputs: {}, fields: {}, substacks: {} },
    { opcode: "data_setvariableto", inputs: { VALUE: { kind: "literal", value: "0" } }, fields: { VARIABLE: "angle" }, substacks: {} },
    { opcode: "control_repeat", inputs: { TIMES: { kind: "literal", value: "36" } }, fields: {}, substacks: {
      SUBSTACK: [
        { opcode: "motion_turnright", inputs: { DEGREES: { kind: "literal", value: "10" } }, fields: {}, substacks: {} },
        { opcode: "data_changevariableby", inputs: { VALUE: { kind: "literal", value: "10" } }, fields: { VARIABLE: "angle" }, substacks: {} },
      ],
    } },
  ],
};

test("packages a project.json with the right structure and bundles the costume asset", async () => {
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", [spin]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  expect(pj.meta.semver).toBe("3.0.0");
  expect(pj.targets[0].isStage).toBe(true);
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  // hat is top-level, links into the body
  const hat = Object.values(cat.blocks).find((b: any) => b.opcode === "event_whenflagclicked") as any;
  expect(hat.topLevel).toBe(true);
  expect(hat.next).not.toBeNull();
  // the global variable lives on the stage and is referenced by id in the field
  const stageVarId = Object.keys(pj.targets[0].variables)[0];
  const setBlock = Object.values(cat.blocks).find((b: any) => b.opcode === "data_setvariableto") as any;
  expect(setBlock.fields.VARIABLE[1]).toBe(stageVarId);
  // the placeholder costume asset is in the zip
  expect(cat.costumes[0].md5ext).toMatch(/\.svg$/);
  expect(zip.file(cat.costumes[0].md5ext)).not.toBeNull();
});

test("an unresolved variable is a fail-loud error", async () => {
  const bad: ParsedScript = { blocks: [
    { opcode: "event_whenflagclicked", inputs: {}, fields: {}, substacks: {} },
    { opcode: "data_changevariableby", inputs: { VALUE: { kind: "literal", value: "1" } }, fields: { VARIABLE: "ghost" }, substacks: {} },
  ] };
  const { diagnostics } = await packageProject(project, new Map([["Cat", [bad]]]));
  expect(diagnostics.some((d) => d.severity === "error" && /ghost/.test(d.message))).toBe(true);
});
