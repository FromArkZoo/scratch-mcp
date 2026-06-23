// tests/editor/run.test.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";

const fixture = fileURLToPath(new URL("../fixtures/spin.sb3", import.meta.url));
let editor: ScratchEditor;

beforeAll(async () => { editor = await ScratchEditor.launch({ headless: true }); });
afterAll(async () => { await editor?.close(); });

test("loadProject + run mutates the variable defined by the project", async () => {
  await editor.loadProject(await readFile(fixture));
  const before = await editor.readState();        // implemented in Task 5
  expect(before.variables["angle"]).toBe(0);
  await editor.run();
  await new Promise((r) => setTimeout(r, 1500));   // let the 36-repeat finish
  const after = await editor.readState();
  expect(Number(after.variables["angle"])).toBe(360);
  await editor.stop();
});
