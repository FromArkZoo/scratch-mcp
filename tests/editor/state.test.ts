// tests/editor/state.test.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";

const fixture = fileURLToPath(new URL("../fixtures/spin.sb3", import.meta.url));
let editor: ScratchEditor;

beforeAll(async () => {
  editor = await ScratchEditor.launch({ headless: true });
  await editor.loadProject(await readFile(fixture));
});
afterAll(async () => { await editor?.close(); });

test("readState lists sprites with numeric position + direction", async () => {
  const state = await editor.readState();
  expect(Array.isArray(state.sprites)).toBe(true);
  expect(state.sprites.length).toBeGreaterThanOrEqual(1);
  const s = state.sprites[0];
  expect(typeof s.x).toBe("number");
  expect(typeof s.direction).toBe("number");
});

test("snapshot returns a non-empty PNG buffer", async () => {
  const png = await editor.snapshot();
  expect(png.length).toBeGreaterThan(100);
  // PNG magic number
  expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
});
