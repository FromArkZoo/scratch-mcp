// tests/compiler/lists.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

async function projectDir(yaml: string, scratch: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lists-"));
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const YAML = [
  "name: L", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
  "variables:", "  global: { n: 0, s: 0 }",
  "lists:", "  global: { inventory: [] }",
].join("\n");

test("list ops round-trip in the VM: item 2 of inventory is 'b'", async () => {
  const src = [
    "when green flag clicked",
    "add [a] to [inventory v]",
    "add [b] to [inventory v]",
    "set [n v] to (item (2) of [inventory v])",
  ].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const state = await runHeadless(res.sb3!);
  expect(String(state.variable("n"))).toBe("b");
});

test("a list registers on its target and the LIST field encodes [name, id]", async () => {
  const src = ["when green flag clicked", "add [a] to [inventory v]"].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const stage = pj.targets.find((t: any) => t.isStage);
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const ids = Object.entries(stage.lists as Record<string, [string, unknown[]]>);
  expect(ids.some(([, pair]) => pair[0] === "inventory")).toBe(true);
  const listId = ids.find(([, pair]) => pair[0] === "inventory")![0];
  expect(stage.lists[listId]).toEqual(["inventory", []]);
  const add = Object.values(cat.blocks).find((b: any) => b.opcode === "data_addtolist") as any;
  expect(add.fields.LIST).toEqual(["inventory", listId]);
});

test("a list used as a reporter input encodes the [13, name, id] primitive", async () => {
  const src = ["when green flag clicked", "set [s v] to (inventory)"].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const set = Object.values(cat.blocks).find((b: any) => b.opcode === "data_setvariableto") as any;
  // VALUE = [3, [13, "inventory", <id>], [10, ""]]
  expect(set.inputs.VALUE[0]).toBe(3);
  expect(set.inputs.VALUE[1][0]).toBe(13);
  expect(set.inputs.VALUE[1][1]).toBe("inventory");
});

test("an unresolved list reference is a fail-loud error", async () => {
  const src = ["when green flag clicked", "add [a] to [ghost v]"].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.ok).toBe(false);
  expect(res.diagnostics.some((d) => d.severity === "error" && /ghost/.test(d.message))).toBe(true);
});
