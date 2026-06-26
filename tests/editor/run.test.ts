// tests/editor/run.test.ts
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";
import { compileProject } from "../../src/compiler/index.js";

const fixture = fileURLToPath(new URL("../fixtures/spin.sb3", import.meta.url));
let editor: ScratchEditor;
let foreverSb3: Buffer;

beforeAll(async () => {
  editor = await ScratchEditor.launch({ headless: true });
  // A forever loop never emits PROJECT_RUN_STOP → deterministic timeout path.
  const dir = await mkdtemp(join(tmpdir(), "scratch-forever-"));
  await writeFile(join(dir, "project.yaml"),
    "name: Forever\nsprites:\n  - name: Cat\n    source: cat.sprite.scratch\n");
  await writeFile(join(dir, "cat.sprite.scratch"),
    "when green flag clicked\nforever\nmove (10) steps\nend\n");
  const res = await compileProject(dir);
  if (!res.ok || !res.sb3) throw new Error("forever fixture failed to compile");
  foreverSb3 = res.sb3;
}, 120_000);
afterAll(async () => { await editor?.close(); });

test("run resolves idle:true when the project finishes", async () => {
  await editor.loadProject(await readFile(fixture));
  const before = await editor.readState();
  expect(before.variables["angle"]).toBe(0);
  const result = await editor.run({ waitMs: 10_000 });
  expect(result.idle).toBe(true);
  const after = await editor.readState();
  expect(Number(after.variables["angle"])).toBe(360);
  await editor.stop();
});

test("run resolves idle:false when a forever loop never settles", async () => {
  await editor.loadProject(foreverSb3);
  const start = Date.now();
  const result = await editor.run({ waitMs: 800 });
  const elapsed = Date.now() - start;
  expect(result.idle).toBe(false);
  expect(elapsed).toBeLessThan(5000); // honors waitMs:800 — NOT Playwright's 30s default
  await editor.stop();
});

test("run() with no args settles fast on a forever loop and reports live threads (not a 10s block)", async () => {
  await editor.loadProject(foreverSb3);
  const start = Date.now();
  const result = await editor.run(); // DEFAULT — must NOT inherit the old 10s wait
  const elapsed = Date.now() - start;
  expect(result.idle).toBe(false);
  expect(result.running).toBe(true);
  expect(result.threads).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(4000); // default settle ~2s, not 10s
  await editor.stop();
});
