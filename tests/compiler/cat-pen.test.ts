import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

async function projectDir(scratch: string, yamlExtra = ""): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cat-"));
  const yaml = [
    "name: C", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
    "variables:", "  global: { v: 0, n: 0, s: 0 }",
    ...(yamlExtra ? [yamlExtra] : []),
  ].join("\n");
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const script = (...lines: string[]) => ["when green flag clicked", ...lines].join("\n");

// Pen writes its state into the renderer/penState (color HSV, transparency, pen-down
// flag, size diameter, stamp/clear to the pen layer). None of that is exposed on the
// headless target via the vm-harness API (no renderer host in headless mode), so there
// is no deterministic observable to runtime-assert. Every Pen block is therefore tested
// Tier-2 (structural shape + loads-and-runs), plus the mandatory floor test. See notes.

// ── Tier-2 (structural + loads-and-runs) ─────────────────────────────────────

// pen_clear: "erase all" — plain stack block, no menu/dropdown, loads.
test("pen_clear: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("erase all")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_clear")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_stamp: plain stack block, no menu/dropdown, loads.
test("pen_stamp: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("stamp")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_stamp")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_penDown: "pen down" — plain stack block, no menu/dropdown, loads.
test("pen_penDown: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("pen down")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_penDown")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_penUp: "pen up" — plain stack block, no menu/dropdown, loads.
test("pen_penUp: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("pen up")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_penUp")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_setPenColorToColor: COLOR is a color text/literal hole (shadowType 9), no menu, loads.
test("pen_setPenColorToColor: emits the block with a color input and loads", async () => {
  const res = await compileProject(await projectDir(script("set pen color to [#ff00ff]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  const blk = blocks.find((b) => b.opcode === "pen_setPenColorToColor");
  expect(blk).toBeDefined();
  // COLOR is a colour shadow (type 9) carrying the authored literal, NOT a menu shadow.
  expect(blk.inputs.COLOR[0]).toBe(1);
  expect(blk.inputs.COLOR[1][0]).toBe(9);
  expect(blk.inputs.COLOR[1][1]).toBe("#ff00ff");
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_changePenColorParamBy: COLOR_PARAM → pen_menu_colorParam shadow, value round-trips, loads.
test("pen_changePenColorParamBy: emits the colorParam menu shadow and loads", async () => {
  const res = await compileProject(await projectDir(script("change pen [saturation v] by (10)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_changePenColorParamBy")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "pen_menu_colorParam" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.colorParam[0]).toBe("saturation"); // authored value round-trips
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_setPenColorParamTo: COLOR_PARAM → pen_menu_colorParam shadow, value round-trips, loads.
test("pen_setPenColorParamTo: emits the colorParam menu shadow and loads", async () => {
  const res = await compileProject(await projectDir(script("set pen [brightness v] to (60)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_setPenColorParamTo")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "pen_menu_colorParam" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.colorParam[0]).toBe("brightness"); // authored value round-trips
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_changePenSizeBy: SIZE is a number hole, no menu/dropdown, loads.
test("pen_changePenSizeBy: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("change pen size by (5)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_changePenSizeBy")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// pen_setPenSizeTo: SIZE is a number hole, no menu/dropdown, loads.
test("pen_setPenSizeTo: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set pen size to (12)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "pen_setPenSizeTo")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// ── Floor: every entry compiles + loads + steps in a real VM ─────────────────
test("pen floor: every entry compiles, loads, and steps", async () => {
  const res = await compileProject(await projectDir(script(
    "erase all",
    "pen down",
    "set pen color to [#00ccff]",
    "change pen [color v] by (10)",
    "set pen [transparency v] to (25)",
    "change pen size by (5)",
    "set pen size to (12)",
    "stamp",
    "pen up",
  )));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});
