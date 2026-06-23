import { afterAll, expect, test } from "vitest";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";

let editor: ScratchEditor;

test("launch() boots the editor with a live VM", async () => {
  editor = await ScratchEditor.launch({ headless: true });
  const hasVm = await editor.hasLiveVm(); // test-only probe
  expect(hasVm).toBe(true);
});

afterAll(async () => {
  await editor?.close();
});
