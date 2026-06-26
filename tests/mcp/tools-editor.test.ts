// tests/mcp/tools-editor.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Session } from "../../src/mcp/session.js";
import { handleNewProject, handleOpenProject } from "../../src/mcp/tools-build.js";
import {
  handleReload, handleRun, handleStop, handleSnapshot, handleReadState, handleImportSb3,
} from "../../src/mcp/tools-editor.js";

const spin = fileURLToPath(new URL("../fixtures/spin.sb3", import.meta.url));
const txt = (r: any) => r.content[0].text as string;
let session: Session;
let projectDir: string;

beforeAll(async () => {
  process.env.SCRATCH_MCP_HEADLESS = "1";
  session = new Session();
  const base = await mkdtemp(join(tmpdir(), "te-"));
  projectDir = join(base, "proj");
  await handleNewProject(session, { name: "E2E", path: projectDir });
  // a finite spinner on a global var so run() goes idle and angle → 360
  await writeFile(join(projectDir, "project.yaml"),
    "name: E2E\nvariables:\n  global: { angle: 0 }\nsprites:\n  - name: Cat\n    source: cat.sprite.scratch\n");
  await writeFile(join(projectDir, "cat.sprite.scratch"),
    "when green flag clicked\nset [angle] to (0)\nrepeat (36)\nturn right (10) degrees\nchange [angle] by (10)\nend\n");
  await handleOpenProject(session, { path: projectDir });
}, 120_000);
afterAll(async () => { await session?.dispose(); });

test("reload compiles and loads into the editor", async () => {
  const r = await handleReload(session, {});
  expect(r.isError).toBeFalsy();
  expect(txt(r)).toMatch(/Loaded into editor/);
});

test("run awaits idle, then read_state reflects the finished run", async () => {
  const run = await handleRun(session, { timeoutMs: 10_000 });
  expect(txt(run)).toMatch(/idle/i);
  const state = JSON.parse(txt(await handleReadState(session)));
  expect(state.variables.angle).toBe(360);
  await handleStop(session);
});

test("snapshot returns a PNG image block", async () => {
  const r = await handleSnapshot(session);
  expect(r.isError).toBeFalsy();
  expect(r.content[0].type).toBe("image");
  expect((r.content[0] as any).mimeType).toBe("image/png");
});

test("reload fails loud on a compile error and loads nothing", async () => {
  await writeFile(join(projectDir, "cat.sprite.scratch"), "when green flag clicked\nfly (3) times\n");
  const r = await handleReload(session, {});
  expect(r.isError).toBe(true);
  expect(txt(r)).toMatch(/fly/);
});

test("import_sb3 loads an existing .sb3 (load-only) and runs", async () => {
  const r = await handleImportSb3(session, { file: spin });
  expect(r.isError).toBeFalsy();
  const run = await handleRun(session, { timeoutMs: 10_000 });
  expect(txt(run)).toMatch(/idle/i);
});

test("run defaults to a fast settle and reports a running game (not a 10s block)", async () => {
  await writeFile(join(projectDir, "cat.sprite.scratch"),
    "when green flag clicked\nforever\nturn right (10) degrees\nend\n");
  const reload = await handleReload(session, {});
  expect(reload.isError).toBeFalsy();
  const start = Date.now();
  const run = await handleRun(session, {}); // no timeoutMs, no waitForCompletion
  expect(Date.now() - start).toBeLessThan(4000);
  expect(txt(run)).toMatch(/running/i);
  await handleStop(session);
});

test("run reports when the green flag triggered no scripts (e.g. a missing 'when green flag clicked' hat)", async () => {
  await writeFile(join(projectDir, "cat.sprite.scratch"),
    "when this sprite clicked\nmove (10) steps\n");
  const reload = await handleReload(session, {});
  expect(reload.isError).toBeFalsy();
  const run = await handleRun(session, {});
  expect(txt(run)).toMatch(/no scripts kept running|green flag clicked/i);
  await handleStop(session);
});

test("read_state on a fresh session errors before any load", async () => {
  const r = await handleReadState(new Session());
  expect(r.isError).toBe(true);
});
