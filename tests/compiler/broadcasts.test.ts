// tests/compiler/broadcasts.test.ts
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

async function projectDir(yaml: string, scratch: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bcast-"));
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const YAML = ["name: B", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
  "variables:", "  global: { x: 0 }"].join("\n");

test("broadcast round-trips in the VM: a received message sets x to 1", async () => {
  const src = [
    "when green flag clicked",
    "broadcast [go v]",
    "when I receive [go v]",
    "set [x v] to (1)",
  ].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("x"))).toBe(1);
});

test("broadcasts are registered on the Stage and the hat + menu share the message id", async () => {
  const src = [
    "when green flag clicked", "broadcast [go v]",
    "when I receive [go v]", "set [x v] to (1)",
  ].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const stage = pj.targets.find((t: any) => t.isStage);
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  // Stage broadcasts map contains "go"
  const ids = Object.entries(stage.broadcasts as Record<string, string>);
  expect(ids.some(([, name]) => name === "go")).toBe(true);
  const goId = ids.find(([, name]) => name === "go")![0];
  // the when-I-receive hat field references [name, id]
  const hat = Object.values(cat.blocks).find((b: any) => b.opcode === "event_whenbroadcastreceived") as any;
  expect(hat.fields.BROADCAST_OPTION).toEqual(["go", goId]);
  // the broadcast menu shadow references the same id
  const menu = Object.values(cat.blocks).find((b: any) => b.opcode === "event_broadcast_menu") as any;
  expect(menu.fields.BROADCAST_OPTION).toEqual(["go", goId]);
  expect(menu.shadow).toBe(true);
});
