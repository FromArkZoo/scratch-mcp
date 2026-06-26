// tests/editor/editor-dist.test.ts
// Regression guard for the deployed-path bug: the compiled module lives one level
// deeper (dist/src/editor) than the source (src/editor), so a path resolved relative
// to the module dir must still land on the single real bundle at <repo>/editor/dist.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { resolveEditorDist, ScratchEditor } from "../../src/editor/scratch-editor.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

test("resolveEditorDist finds the real bundle from BOTH the src and the compiled dist module dirs", () => {
  const expected = join(repoRoot, "editor", "dist");
  expect(resolveEditorDist(join(repoRoot, "src", "editor"))).toBe(expected);
  // The bug: tsc nests the module at dist/src/editor, one level deeper than src/editor.
  expect(resolveEditorDist(join(repoRoot, "dist", "src", "editor"))).toBe(expected);
  expect(existsSync(join(expected, "index.html"))).toBe(true);
});

test("launch fails loud and fast when the editor bundle is missing (no 60s hang)", async () => {
  const start = Date.now();
  await expect(
    ScratchEditor.launch({ headless: true, editorDist: join(repoRoot, "no", "such", "dist") }),
  ).rejects.toThrow(/editor bundle|index\.html/i);
  expect(Date.now() - start).toBeLessThan(15_000);
});
