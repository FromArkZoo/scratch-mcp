// tests/compiler/packager-extensions.test.ts
import JSZip from "jszip";
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript, ParsedBlock } from "../../src/compiler/types.js";
import { runHeadless } from "./vm-harness.js";

const B = (opcode: string, inputs: any = {}, fields: any = {}, substacks: any = {}): ParsedBlock =>
  ({ opcode, inputs, fields, substacks });
const project: Project = {
  name: "E",
  targets: [
    { name: "Stage", isStage: true, variables: [] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};
async function extensionsOf(scripts: ParsedScript[]): Promise<string[]> {
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", scripts]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  return pj.extensions;
}

test("a pen opcode populates extensions:['pen'] and the sb3 runs", async () => {
  const s: ParsedScript = { blocks: [B("event_whenflagclicked"), B("pen_clear")] };
  expect(await extensionsOf([s])).toEqual(["pen"]);
  const { sb3 } = await packageProject(project, new Map([["Cat", [s]]]));
  await runHeadless(sb3); // loads + runs without throwing
});

test("pen + music opcodes populate ['pen','music'] deduped and ordered", async () => {
  const s: ParsedScript = { blocks: [
    B("event_whenflagclicked"),
    B("pen_clear"),
    B("music_restForBeats", { BEATS: { kind: "literal", value: "1" } }),
    B("pen_clear"),
  ] };
  expect(await extensionsOf([s])).toEqual(["pen", "music"]);
});

test("no pen/music opcodes leaves extensions empty", async () => {
  const s: ParsedScript = { blocks: [B("event_whenflagclicked"), B("motion_movesteps", { STEPS: { kind: "literal", value: "10" } })] };
  expect(await extensionsOf([s])).toEqual([]);
});
