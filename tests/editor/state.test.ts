// tests/editor/state.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";
import { compileProject } from "../../src/compiler/index.js";

let editor: ScratchEditor;

beforeAll(async () => {
  editor = await ScratchEditor.launch({ headless: true });
  // Global "score"=7 on the Stage AND a sprite-local "score"=3 on Cat (collision proof).
  const dir = await mkdtemp(join(tmpdir(), "scratch-ns-"));
  await writeFile(join(dir, "project.yaml"),
    "name: NS\n" +
    "variables:\n  global: { score: 7 }\n  Cat: { score: 3 }\n" +
    "sprites:\n  - name: Cat\n    source: cat.sprite.scratch\n");
  await writeFile(join(dir, "cat.sprite.scratch"),
    "when green flag clicked\nmove (0) steps\n");
  const res = await compileProject(dir);
  if (!res.ok || !res.sb3) throw new Error("namespacing fixture failed to compile");
  await editor.loadProject(res.sb3);
}, 120_000);
afterAll(async () => { await editor?.close(); });

test("readState namespaces globals vs sprite-locals", async () => {
  const state = await editor.readState();
  expect(state.variables["score"]).toBe(7);             // Stage/global
  const cat = state.sprites.find((s) => s.name === "Cat");
  expect(cat).toBeDefined();
  expect(cat!.variables["score"]).toBe(3);              // sprite-local, no collision
  expect(typeof cat!.x).toBe("number");
  expect(typeof cat!.direction).toBe("number");
  expect(state.lists).toBeDefined();
  expect(cat!.lists).toBeDefined();
});

test("snapshot returns a non-empty PNG buffer", async () => {
  const png = await editor.snapshot();
  expect(png.length).toBeGreaterThan(100);
  expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
});
