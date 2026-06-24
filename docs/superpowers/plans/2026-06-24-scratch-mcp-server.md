# Scratch MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the finished compiler (`compileProject`) and live-editor bridge (`ScratchEditor`) as a stdio MCP server with 10 tools, resolving the two §15 carry-forwards (real run-completion signal + per-sprite namespaced state).

**Architecture:** A thin stdio MCP server under `src/mcp/`. A `Session` holds the active project dir + a lazily-launched singleton editor. Tool handlers are pure adapter functions (`session × args → ToolResult`) split into a no-editor "build" layer and an editor layer; `server.ts` registers them with the SDK + zod; `src/index.ts` is the bin. The frozen `ScratchEditor` is extended additively (§15-pre-authorized) for `run`/`readState`.

**Tech Stack:** TypeScript (ESM, strict), `@modelcontextprotocol/sdk` + `zod` (new deps), Playwright (existing), `scratch-vm@5.0.300` (headless in tests), vitest.

**Spec:** `docs/superpowers/specs/2026-06-24-scratch-mcp-server-design.md`
**Branch:** `mcp-server` off `main` (create via superpowers:using-git-worktrees at execution time).

## Global Constraints

- **Do NOT modify `src/compiler/**`** — the compiler is frozen. Signature: `compileProject(dir: string): Promise<{ ok: boolean; sb3?: Buffer; diagnostics: Diagnostic[] }>`. `Diagnostic = { file: string; line: number; col?: number; message: string; severity: "error" | "warning" }`. `d.file` is already a project-relative path.
- **Bridge contract:** `launch / loadProject / stop / snapshot / close` are frozen; only `run` and `readState` are reshaped here (§15 pre-authorization).
- **ESM:** `"type": "module"`; all relative imports use `.js` specifiers. tsc: target ES2022, module ESNext, moduleResolution Bundler, `strict`, outDir `dist`, rootDir `.`, include `["src","tests"]` → builds to `dist/src/...`.
- **Build:** `npm run build`. **Typecheck:** `npx tsc --noEmit`. **Test:** `npx vitest run <path>` (config: testTimeout/hookTimeout 120000; `tests/setup.ts` swallows only the benign "No Audio Context" rejection).
- **scratch-vm:** `vm.runtime` is an EventEmitter and emits `PROJECT_RUN_STOP` when all threads finish; use `vm.runtime.once("PROJECT_RUN_STOP", …)`.
- **Editor:** headed by default; `SCRATCH_MCP_HEADLESS=1` forces headless. Tests MUST set it.
- **Projects root:** default `~/scratch-mcp/projects/`; override `SCRATCH_MCP_PROJECTS_DIR`.
- **Manifest schema (for fixtures):** `name:`; `sprites: - { name, source, x?, y?, size?, direction?, visible? }`; `variables: { global: {n: v}, <SpriteName>: {n: v} }`; `lists: { global: {n: []}, <SpriteName>: {n: []} }`; `stage: { source }`. A `.scratch` file starts at its first block (no `#` lines).
- **Fail-loud:** compile errors → `isError` + formatted diagnostics; `reload` loads nothing on a compile error; a `run` timeout is **not** an error.
- **Page globals** use the existing `(window as any)` pattern.
- **Commits:** repo-local `user.email` is already the FromArkZoo noreply; every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Gate policy:** an editor/Playwright test that flakes under full-suite parallel load but passes in isolation is NOT a failure — re-run it alone (`npx vitest run <file>`).

**Parallelization:** Tasks 1→2 are sequential (both edit `scratch-editor.ts`). Tasks 3, 4, 5 are mutually independent and independent of 1/2 (distinct new files) → may run in parallel. Task 6 needs 3,4,5. Task 7 needs 1,2,5,6. Task 8 needs 6,7. Task 9 is finalization.

---

### Task 1: Bridge — real run-completion signal (§15a)

**Files:**
- Modify: `src/editor/scratch-editor.ts` (the `run` method)
- Test: `tests/editor/run.test.ts` (replace the `setTimeout` with the real idle signal + add a timeout case)

**Interfaces:**
- Consumes: existing `ScratchEditor.launch/loadProject/readState/stop`; `compileProject` (compiler) to build a forever-loop fixture in the test.
- Produces: `run(opts?: { waitMs?: number }): Promise<{ idle: boolean }>` (default `waitMs` = 10000).

- [ ] **Step 1: Rewrite `tests/editor/run.test.ts` (failing test)**

```ts
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
  const result = await editor.run({ waitMs: 800 });
  expect(result.idle).toBe(false);
  await editor.stop();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/editor/run.test.ts`
Expected: FAIL — current `run()` returns `Promise<void>`, so `result.idle` is `undefined` (`expect(undefined).toBe(true)`).

- [ ] **Step 3: Implement the run change**

Replace the existing `run()` method in `src/editor/scratch-editor.ts` (lines ~91-93) with:

```ts
  async run(opts: { waitMs?: number } = {}): Promise<{ idle: boolean }> {
    const waitMs = opts.waitMs ?? 10_000;
    // Arm a one-shot PROJECT_RUN_STOP listener, reset the flag, then green-flag.
    await this.page.evaluate(() => {
      const vm = (window as any).vm;
      (window as any).__scratchRunDone = false;
      vm.runtime.once("PROJECT_RUN_STOP", () => { (window as any).__scratchRunDone = true; });
      vm.greenFlag();
    });
    try {
      await this.page.waitForFunction(
        () => (window as any).__scratchRunDone === true,
        { timeout: waitMs },
      );
      return { idle: true };
    } catch {
      return { idle: false }; // timed out — e.g. a forever loop never goes idle
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/editor/run.test.ts`
Expected: PASS (2/2). If it flakes under load, re-run in isolation (same command).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/editor/scratch-editor.ts tests/editor/run.test.ts
git commit -m "feat(bridge): run() awaits PROJECT_RUN_STOP with a timeout

Resolves §15a — run() returns { idle } instead of fire-and-forget; forever
loops report idle:false at timeout. Drops the setTimeout(1500) in run.test.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Bridge — namespaced read_state (§15b)

**Files:**
- Modify: `src/editor/scratch-editor.ts` (the `ProjectState`/`SpriteState` interfaces + `readState`)
- Test: `tests/editor/state.test.ts` (assert global-vs-local namespacing)

**Interfaces:**
- Consumes: existing `launch/loadProject`; `compileProject` to build a same-named global+local fixture.
- Produces: reshaped `readState(): Promise<ProjectState>` where
  `ProjectState = { variables: ScalarMap; lists: ListMap; sprites: SpriteState[] }`,
  `SpriteState = { name; x; y; direction; visible; size; costume; variables: ScalarMap; lists: ListMap }`,
  `ScalarMap = Record<string, string|number|boolean>`, `ListMap = Record<string, (string|number|boolean)[]>`.

- [ ] **Step 1: Rewrite `tests/editor/state.test.ts` (failing test)**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/editor/state.test.ts`
Expected: FAIL — current `readState` flattens all targets into `state.variables`, so `cat.variables` is `undefined` (no per-sprite map) and `state.variables["score"]` collides (last-write-wins).

- [ ] **Step 3: Implement the namespaced read**

In `src/editor/scratch-editor.ts`, replace the `SpriteState`/`ProjectState` interfaces (lines ~9-16) with:

```ts
export type ScalarMap = Record<string, string | number | boolean>;
export type ListMap = Record<string, (string | number | boolean)[]>;
export interface SpriteState {
  name: string; x: number; y: number; direction: number;
  visible: boolean; size: number; costume: number;
  variables: ScalarMap;   // this sprite's locals
  lists: ListMap;         // this sprite's local lists
}
export interface ProjectState {
  variables: ScalarMap;   // Stage/global scalars
  lists: ListMap;         // Stage/global lists
  sprites: SpriteState[];
}
```

Replace the `readState()` method (lines ~53-76) with:

```ts
  async readState(): Promise<ProjectState> {
    return this.page.evaluate(() => {
      const vm = (window as any).vm;
      const targets = vm.runtime.targets as any[];
      const scalarsOf = (t: any) => {
        const out: Record<string, any> = {};
        for (const id of Object.keys(t.variables ?? {})) {
          const v = t.variables[id];
          if (v && v.type === "") out[v.name] = v.value;        // scalar
        }
        return out;
      };
      const listsOf = (t: any) => {
        const out: Record<string, any> = {};
        for (const id of Object.keys(t.variables ?? {})) {
          const v = t.variables[id];
          if (v && v.type === "list") out[v.name] = v.value;    // list
        }
        return out;
      };
      let variables: Record<string, any> = {};
      let lists: Record<string, any> = {};
      const sprites: any[] = [];
      for (const t of targets) {
        if (!t || t.isOriginal === false) continue;             // skip clones
        if (t.isStage) {
          variables = scalarsOf(t);
          lists = listsOf(t);
        } else {
          sprites.push({
            name: t.sprite?.name ?? t.getName?.() ?? "",
            x: t.x, y: t.y, direction: t.direction,
            visible: t.visible, size: t.size, costume: t.currentCostume,
            variables: scalarsOf(t),
            lists: listsOf(t),
          });
        }
      }
      return { variables, lists, sprites };
    });
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/editor/state.test.ts`
Expected: PASS (2/2). Re-run in isolation if it flakes under load.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/editor/scratch-editor.ts tests/editor/state.test.ts
git commit -m "feat(bridge): namespace read_state per sprite (§15b)

ProjectState gains lists + sprites[].variables/lists; Stage scalars/lists go
to the top level. Kills the global-vs-sprite-local name collision.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Diagnostics formatter

**Files:**
- Create: `src/mcp/diagnostics.ts`
- Test: `tests/mcp/diagnostics.test.ts`

**Interfaces:**
- Consumes: `Diagnostic` from `../compiler/types.js`.
- Produces: `formatDiagnostics(diags: Diagnostic[]): { text: string; hasError: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/mcp/diagnostics.test.ts
import { expect, test } from "vitest";
import { formatDiagnostics } from "../../src/mcp/diagnostics.js";

test("formats errors and warnings with file:line and a summary", () => {
  const { text, hasError } = formatDiagnostics([
    { file: "cat.sprite.scratch", line: 3, message: 'unknown block "fly"', severity: "error" },
    { file: "project.yaml", line: 0, message: "deprecated key", severity: "warning" },
  ]);
  expect(hasError).toBe(true);
  expect(text).toContain("1 error(s), 1 warning(s)");
  expect(text).toContain('cat.sprite.scratch:3: error: unknown block "fly"');
  expect(text).toContain("project.yaml:0: warning: deprecated key");
});

test("includes column when present", () => {
  const { text } = formatDiagnostics([
    { file: "a.scratch", line: 2, col: 5, message: "boom", severity: "error" },
  ]);
  expect(text).toContain("a.scratch:2:5: error: boom");
});

test("empty diagnostics → empty text, no error", () => {
  const { text, hasError } = formatDiagnostics([]);
  expect(text).toBe("");
  expect(hasError).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/mcp/diagnostics.test.ts`
Expected: FAIL — `Cannot find module '../../src/mcp/diagnostics.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/mcp/diagnostics.ts
import type { Diagnostic } from "../compiler/types.js";

export function formatDiagnostics(diags: Diagnostic[]): { text: string; hasError: boolean } {
  const errors = diags.filter((d) => d.severity === "error").length;
  const warnings = diags.filter((d) => d.severity === "warning").length;
  const lines = diags.map((d) => {
    const loc = d.col != null ? `${d.line}:${d.col}` : `${d.line}`;
    return `${d.file}:${loc}: ${d.severity}: ${d.message}`;
  });
  const summary = `${errors} error(s), ${warnings} warning(s)`;
  return { text: diags.length ? `${summary}\n${lines.join("\n")}` : "", hasError: errors > 0 };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/mcp/diagnostics.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/mcp/diagnostics.ts tests/mcp/diagnostics.test.ts
git commit -m "feat(mcp): diagnostics formatter (file:line: severity: message)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Project scaffold + list

**Files:**
- Create: `src/mcp/scaffold.ts`
- Test: `tests/mcp/scaffold.test.ts` (note: the obsolete `tests/scaffold.test.ts` is deleted in Task 8)

**Interfaces:**
- Consumes: `compileProject` (test only), `js-yaml` (dep), node fs.
- Produces: `projectsRoot(): string`; `scaffoldProject(name: string, path?: string): Promise<{ dir: string }>`; `listProjects(dir?: string): Promise<Array<{ name: string; path: string }>>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/mcp/scaffold.test.ts
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { scaffoldProject, listProjects } from "../../src/mcp/scaffold.js";
import { compileProject } from "../../src/compiler/index.js";

test("scaffolds a project that compiles clean", async () => {
  const base = await mkdtemp(join(tmpdir(), "scaffold-"));
  const { dir } = await scaffoldProject("My Game", join(base, "game"));
  const files = (await readdir(dir)).sort();
  expect(files).toEqual(["cat.sprite.scratch", "project.yaml"]);
  const res = await compileProject(dir);
  expect(res.ok).toBe(true);
  expect(res.sb3).toBeInstanceOf(Buffer);
}, 120_000);

test("refuses to scaffold into a non-empty dir", async () => {
  const base = await mkdtemp(join(tmpdir(), "scaffold-ne-"));
  await scaffoldProject("A", join(base, "p"));
  await expect(scaffoldProject("A", join(base, "p"))).rejects.toThrow(/non-empty/);
});

test("listProjects finds scaffolded projects by name", async () => {
  const root = await mkdtemp(join(tmpdir(), "scaffold-root-"));
  await scaffoldProject("Alpha", join(root, "alpha"));
  await scaffoldProject("Beta", join(root, "beta"));
  const names = (await listProjects(root)).map((p) => p.name).sort();
  expect(names).toEqual(["Alpha", "Beta"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/mcp/scaffold.test.ts`
Expected: FAIL — `Cannot find module '../../src/mcp/scaffold.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/mcp/scaffold.ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import yaml from "js-yaml";

const STARTER_YAML = (name: string) =>
  `name: ${name}\nsprites:\n  - name: Cat\n    source: cat.sprite.scratch\n`;
const STARTER_SCRATCH = "when green flag clicked\nmove (10) steps\n";

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

export function projectsRoot(): string {
  return process.env.SCRATCH_MCP_PROJECTS_DIR
    ? resolve(process.env.SCRATCH_MCP_PROJECTS_DIR)
    : join(process.env.HOME ?? ".", "scratch-mcp", "projects");
}

export async function scaffoldProject(name: string, path?: string): Promise<{ dir: string }> {
  const dir = path ? resolve(path) : join(projectsRoot(), slug(name));
  let existing: string[] = [];
  try { existing = await readdir(dir); }
  catch (e: any) { if (e.code !== "ENOENT") throw e; }       // ENOENT = doesn't exist → fine
  if (existing.length > 0) throw new Error(`refusing to scaffold into non-empty dir: ${dir}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "project.yaml"), STARTER_YAML(name));
  await writeFile(join(dir, "cat.sprite.scratch"), STARTER_SCRATCH);
  return { dir };
}

export async function listProjects(dir?: string): Promise<Array<{ name: string; path: string }>> {
  const root = dir ? resolve(dir) : projectsRoot();
  let entries: string[];
  try { entries = await readdir(root); }
  catch (e: any) { if (e.code === "ENOENT") return []; throw e; }
  const out: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    const projectDir = join(root, entry);
    try {
      const doc = yaml.load(await readFile(join(projectDir, "project.yaml"), "utf8")) as any;
      out.push({ name: (doc && doc.name) || entry, path: projectDir });
    } catch { /* not a project dir — skip */ }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/mcp/scaffold.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/mcp/scaffold.ts tests/mcp/scaffold.test.ts
git commit -m "feat(mcp): project scaffold + list (compiling starter)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Session (active project + lazy editor singleton)

**Files:**
- Create: `src/mcp/session.ts`
- Test: `tests/mcp/session.test.ts`

**Interfaces:**
- Consumes: `ScratchEditor` from `../editor/scratch-editor.js`.
- Produces: class `Session` with `openProject(path): Promise<string>`, `resolveProjectDir(path?): string`, `getEditor(): Promise<ScratchEditor>`, `hasEditor(): boolean`, `dispose(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/mcp/session.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { Session } from "../../src/mcp/session.js";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";

test("resolveProjectDir prefers explicit path, then active, else throws", async () => {
  const s = new Session();
  expect(() => s.resolveProjectDir()).toThrow(/no active project/);
  expect(s.resolveProjectDir("/tmp/x")).toBe(resolve("/tmp/x"));
  const dir = await mkdtemp(join(tmpdir(), "sess-"));
  await writeFile(join(dir, "project.yaml"), "name: X\n");
  await s.openProject(dir);
  expect(s.resolveProjectDir()).toBe(resolve(dir));
  expect(s.resolveProjectDir("/tmp/y")).toBe(resolve("/tmp/y"));   // explicit overrides active
});

test("openProject rejects a dir without project.yaml", async () => {
  const s = new Session();
  const dir = await mkdtemp(join(tmpdir(), "sess-empty-"));
  await expect(s.openProject(dir)).rejects.toThrow(/project\.yaml/);
});

test("getEditor launches once and is reused; dispose closes it", async () => {
  const fake = { close: vi.fn().mockResolvedValue(undefined) } as unknown as ScratchEditor;
  const spy = vi.spyOn(ScratchEditor, "launch").mockResolvedValue(fake);
  const s = new Session();
  expect(s.hasEditor()).toBe(false);
  const e1 = await s.getEditor();
  const e2 = await s.getEditor();
  expect(e1).toBe(e2);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(s.hasEditor()).toBe(true);
  await s.dispose();
  expect(fake.close).toHaveBeenCalled();
  expect(s.hasEditor()).toBe(false);
  spy.mockRestore();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/mcp/session.test.ts`
Expected: FAIL — `Cannot find module '../../src/mcp/session.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/mcp/session.ts
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ScratchEditor } from "../editor/scratch-editor.js";

export class Session {
  private activeProjectDir: string | null = null;
  private editor: ScratchEditor | null = null;

  async openProject(path: string): Promise<string> {
    const dir = resolve(path);
    try { await access(join(dir, "project.yaml")); }
    catch { throw new Error(`no project.yaml in ${dir}`); }
    this.activeProjectDir = dir;
    return dir;
  }

  resolveProjectDir(path?: string): string {
    if (path) return resolve(path);
    if (this.activeProjectDir) return this.activeProjectDir;
    throw new Error("no active project — call open_project or pass a path");
  }

  async getEditor(): Promise<ScratchEditor> {
    if (!this.editor) {
      const headless = process.env.SCRATCH_MCP_HEADLESS === "1";
      this.editor = await ScratchEditor.launch({ headless });
    }
    return this.editor;
  }

  hasEditor(): boolean { return this.editor !== null; }

  async dispose(): Promise<void> {
    if (this.editor) { await this.editor.close().catch(() => {}); this.editor = null; }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/mcp/session.test.ts`
Expected: PASS (3/3). No browser launches (the launch is spied).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/mcp/session.ts tests/mcp/session.test.ts
git commit -m "feat(mcp): Session — active project + lazy editor singleton

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Build-tool handlers (no editor) + shared result/compile helpers

**Files:**
- Create: `src/mcp/result.ts`, `src/mcp/compile.ts`, `src/mcp/tools-build.ts`
- Test: `tests/mcp/tools-build.test.ts`

**Interfaces:**
- Consumes: `Session` (Task 5), `formatDiagnostics` (Task 3), `scaffoldProject`/`listProjects` (Task 4), `compileProject` (compiler).
- Produces:
  - `result.ts`: `ToolResult` (`{ content: Array<{type:"text";text:string}|{type:"image";data:string;mimeType:string}>; isError?: boolean }`); `textResult(text)`, `errorResult(message)`, `imageResult(png: Buffer, caption: string)`.
  - `compile.ts`: `runCompile(dir: string): Promise<{ ok: boolean; sb3?: Buffer; text: string }>`.
  - `tools-build.ts`: `handleNewProject(session, { name, path? })`, `handleOpenProject(session, { path })`, `handleListProjects(session, { dir? })`, `handleCompile(session, { path? })` — all `: Promise<ToolResult>`.

- [ ] **Step 1: Write `src/mcp/result.ts` and `src/mcp/compile.ts` (support modules, no test of their own — exercised by Step 2's handler tests)**

```ts
// src/mcp/result.ts
export interface ToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
}
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
export function imageResult(png: Buffer, caption: string): ToolResult {
  return {
    content: [
      { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      { type: "text", text: caption },
    ],
  };
}
```

```ts
// src/mcp/compile.ts
import { compileProject } from "../compiler/index.js";
import { formatDiagnostics } from "./diagnostics.js";

export async function runCompile(dir: string): Promise<{ ok: boolean; sb3?: Buffer; text: string }> {
  const res = await compileProject(dir);
  const { text } = formatDiagnostics(res.diagnostics);
  if (!res.ok || !res.sb3) return { ok: false, text: text || "compile failed" };
  return { ok: true, sb3: res.sb3, text };
}
```

- [ ] **Step 2: Write the failing handler test**

```ts
// tests/mcp/tools-build.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Session } from "../../src/mcp/session.js";
import {
  handleNewProject, handleOpenProject, handleListProjects, handleCompile,
} from "../../src/mcp/tools-build.js";

const txt = (r: any) => r.content[0].text as string;

test("new_project creates a compiling project", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-new-"));
  const r = await handleNewProject(new Session(), { name: "Demo", path: join(base, "demo") });
  expect(r.isError).toBeFalsy();
  expect(txt(r)).toMatch(/Created project/);
}, 120_000);

test("compile without an active project errors", async () => {
  const r = await handleCompile(new Session(), {});
  expect(r.isError).toBe(true);
  expect(txt(r)).toMatch(/no active project/);
});

test("compile surfaces fail-loud diagnostics as isError", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-bad-"));
  const dir = join(base, "bad");
  const s = new Session();
  await handleNewProject(s, { name: "Bad", path: dir });
  await writeFile(join(dir, "cat.sprite.scratch"), "when green flag clicked\nfly (3) times\n");
  await handleOpenProject(s, { path: dir });
  const r = await handleCompile(s, {});
  expect(r.isError).toBe(true);
  expect(txt(r)).toMatch(/fly/);
}, 120_000);

test("open + compile a good project succeeds", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-ok-"));
  const dir = join(base, "ok");
  const s = new Session();
  await handleNewProject(s, { name: "Ok", path: dir });
  await handleOpenProject(s, { path: dir });
  const r = await handleCompile(s, {});
  expect(r.isError).toBeFalsy();
  expect(txt(r)).toMatch(/Compiled OK/);
}, 120_000);

test("list_projects reports created projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tb-list-"));
  const s = new Session();
  await handleNewProject(s, { name: "One", path: join(root, "one") });
  const r = await handleListProjects(s, { dir: root });
  expect(txt(r)).toMatch(/One/);
}, 120_000);
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/mcp/tools-build.test.ts`
Expected: FAIL — `Cannot find module '../../src/mcp/tools-build.js'`.

- [ ] **Step 4: Write the implementation**

```ts
// src/mcp/tools-build.ts
import { Session } from "./session.js";
import { runCompile } from "./compile.js";
import { scaffoldProject, listProjects } from "./scaffold.js";
import { textResult, errorResult, type ToolResult } from "./result.js";

export async function handleNewProject(
  _session: Session, args: { name: string; path?: string },
): Promise<ToolResult> {
  try {
    const { dir } = await scaffoldProject(args.name, args.path);
    const compiled = await runCompile(dir);
    if (!compiled.ok) return errorResult(`scaffold did not compile:\n${compiled.text}`);
    return textResult(`Created project at ${dir}\n  project.yaml\n  cat.sprite.scratch`);
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleOpenProject(
  session: Session, args: { path: string },
): Promise<ToolResult> {
  try {
    const dir = await session.openProject(args.path);
    return textResult(`Active project set to ${dir}`);
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleListProjects(
  _session: Session, args: { dir?: string },
): Promise<ToolResult> {
  try {
    const list = await listProjects(args.dir);
    if (!list.length) return textResult("No projects found.");
    return textResult(list.map((p) => `${p.name}  —  ${p.path}`).join("\n"));
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleCompile(
  session: Session, args: { path?: string },
): Promise<ToolResult> {
  try {
    const dir = session.resolveProjectDir(args.path);
    const compiled = await runCompile(dir);
    if (!compiled.ok) return errorResult(compiled.text);
    return textResult(compiled.text ? `Compiled OK.\n${compiled.text}` : "Compiled OK.");
  } catch (e) { return errorResult((e as Error).message); }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/mcp/tools-build.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/mcp/result.ts src/mcp/compile.ts src/mcp/tools-build.ts tests/mcp/tools-build.test.ts
git commit -m "feat(mcp): build-tool handlers (new/open/list/compile) + result helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Editor-tool handlers + end-to-end editor flow

**Files:**
- Create: `src/mcp/tools-editor.ts`
- Test: `tests/mcp/tools-editor.test.ts` (headless editor — the §12 e2e)

**Interfaces:**
- Consumes: `Session` (`getEditor`/`hasEditor`/`resolveProjectDir`), `runCompile` (Task 6), `result` helpers (Task 6), the extended bridge `run`/`readState`/`loadProject`/`stop`/`snapshot` (Tasks 1-2).
- Produces: `handleReload(session, { path? })`, `handleRun(session, { timeoutMs? })`, `handleStop(session)`, `handleSnapshot(session)`, `handleReadState(session)`, `handleImportSb3(session, { file })` — all `: Promise<ToolResult>`.

- [ ] **Step 1: Write the failing e2e test**

```ts
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

test("read_state on a fresh session errors before any load", async () => {
  const r = await handleReadState(new Session());
  expect(r.isError).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `SCRATCH_MCP_HEADLESS=1 npx vitest run tests/mcp/tools-editor.test.ts`
Expected: FAIL — `Cannot find module '../../src/mcp/tools-editor.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/mcp/tools-editor.ts
import { readFile } from "node:fs/promises";
import { Session } from "./session.js";
import { runCompile } from "./compile.js";
import { textResult, errorResult, imageResult, type ToolResult } from "./result.js";

export async function handleReload(session: Session, args: { path?: string }): Promise<ToolResult> {
  try {
    const dir = session.resolveProjectDir(args.path);
    const compiled = await runCompile(dir);
    if (!compiled.ok || !compiled.sb3) return errorResult(compiled.text); // fail-loud: load nothing
    await (await session.getEditor()).loadProject(compiled.sb3);
    return textResult(compiled.text ? `Loaded into editor.\n${compiled.text}` : "Loaded into editor.");
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleRun(session: Session, args: { timeoutMs?: number }): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded — call reload or import_sb3 first");
    const { idle } = await (await session.getEditor()).run({ waitMs: args.timeoutMs ?? 10_000 });
    return textResult(idle
      ? "Ran to completion (idle)."
      : "Still running after timeout (e.g. a forever loop).");
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleStop(session: Session): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded");
    await (await session.getEditor()).stop();
    return textResult("Stopped.");
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleSnapshot(session: Session): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded — call reload or import_sb3 first");
    const png = await (await session.getEditor()).snapshot();
    if (png.length < 100) return errorResult("snapshot produced an empty image");
    return imageResult(png, `Stage snapshot (${png.length} bytes)`);
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleReadState(session: Session): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded — call reload or import_sb3 first");
    const state = await (await session.getEditor()).readState();
    return textResult(JSON.stringify(state, null, 2));
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleImportSb3(session: Session, args: { file: string }): Promise<ToolResult> {
  try {
    const bytes = await readFile(args.file);
    if (bytes.subarray(0, 2).toString("ascii") !== "PK") return errorResult(`not a .sb3 (zip) file: ${args.file}`);
    await (await session.getEditor()).loadProject(bytes);
    return textResult(`Imported ${args.file} into the editor (runnable, not editable source).`);
  } catch (e) { return errorResult((e as Error).message); }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `SCRATCH_MCP_HEADLESS=1 npx vitest run tests/mcp/tools-editor.test.ts`
Expected: PASS (6/6). If it flakes under load, re-run in isolation (same command).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/mcp/tools-editor.ts tests/mcp/tools-editor.test.ts
git commit -m "feat(mcp): editor-tool handlers + e2e (reload/run/stop/snapshot/read_state/import)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: MCP server registration, bin, and dependencies

**Files:**
- Modify: `package.json` (add deps + `bin` + `start` script)
- Create: `src/mcp/server.ts`
- Modify: `src/index.ts` (replace the `VERSION` stub with the stdio bin)
- Delete: `tests/scaffold.test.ts` (obsolete `VERSION` smoke test — replaced by the server test)
- Test: `tests/mcp/server.test.ts` (in-memory MCP client round-trip; no browser)

**Interfaces:**
- Consumes: all Task-6/7 handlers; `Session`.
- Produces: `createServer(): { server: McpServer; session: Session }` (`src/mcp/server.ts`); `src/index.ts` boots stdio.

- [ ] **Step 1: Install dependencies**

Run: `npm install @modelcontextprotocol/sdk zod`
Expected: both added to `dependencies` in `package.json`; `package-lock.json` updated.

- [ ] **Step 2: Write the failing server test**

```ts
// tests/mcp/server.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";

async function connect() {
  const { server } = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

test("server exposes all 10 tools", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual([
    "compile", "import_sb3", "list_projects", "new_project", "open_project",
    "read_state", "reload", "run", "snapshot", "stop",
  ]);
});

test("new_project round-trips through the SDK", async () => {
  const root = await mkdtemp(join(tmpdir(), "srv-"));
  process.env.SCRATCH_MCP_PROJECTS_DIR = root;
  const client = await connect();
  const res: any = await client.callTool({ name: "new_project", arguments: { name: "Via SDK" } });
  expect(res.isError).toBeFalsy();
  expect(res.content[0].text).toMatch(/Created project/);
}, 120_000);

test("compile with no active project reports isError through the SDK", async () => {
  const client = await connect();
  const res: any = await client.callTool({ name: "compile", arguments: {} });
  expect(res.isError).toBe(true);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/mcp/server.test.ts`
Expected: FAIL — `Cannot find module '../../src/mcp/server.js'`.

- [ ] **Step 4: Write `src/mcp/server.ts`**

```ts
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Session } from "./session.js";
import {
  handleNewProject, handleOpenProject, handleListProjects, handleCompile,
} from "./tools-build.js";
import {
  handleReload, handleRun, handleStop, handleSnapshot, handleReadState, handleImportSb3,
} from "./tools-editor.js";
import type { ToolResult } from "./result.js";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
);

export function createServer(): { server: McpServer; session: Session } {
  const session = new Session();
  const server = new McpServer({ name: "scratch-mcp", version: pkg.version });

  const reg = (
    name: string, description: string, shape: ZodRawShape,
    run: (a: any) => Promise<ToolResult>,
  ) => server.registerTool(name, { description, inputSchema: shape }, ((a: any) => run(a)) as any);

  reg("new_project", "Scaffold a new Scratch project folder that compiles clean.",
    { name: z.string(), path: z.string().optional() }, (a) => handleNewProject(session, a));
  reg("open_project", "Set the active project (validates project.yaml).",
    { path: z.string() }, (a) => handleOpenProject(session, a));
  reg("list_projects", "List projects under the projects root or a given dir.",
    { dir: z.string().optional() }, (a) => handleListProjects(session, a));
  reg("compile", "Compile project source to a .sb3 (no editor); returns diagnostics.",
    { path: z.string().optional() }, (a) => handleCompile(session, a));
  reg("reload", "Compile then load the project into the live editor (fail-loud).",
    { path: z.string().optional() }, (a) => handleReload(session, a));
  reg("run", "Green-flag the loaded project; await idle up to timeoutMs (default 10000).",
    { timeoutMs: z.number().optional() }, (a) => handleRun(session, a));
  reg("stop", "Stop all running scripts.", {}, () => handleStop(session));
  reg("snapshot", "Screenshot the stage as a PNG image.", {}, () => handleSnapshot(session));
  reg("read_state", "Read namespaced variables/lists/sprite state from the live editor.",
    {}, () => handleReadState(session));
  reg("import_sb3", "Load an existing .sb3 into the editor (runnable, not editable source).",
    { file: z.string() }, (a) => handleImportSb3(session, a));

  return { server, session };
}
```

> Note: `server.registerTool(name, { description, inputSchema }, cb)` is the current SDK API; if the installed SDK predates it, the equivalent is `server.tool(name, description, shape, cb)`. The handler return (`ToolResult`) is structurally a `CallToolResult`; the `as any` cast at the `reg` boundary avoids nominal-type friction.

- [ ] **Step 5: Replace `src/index.ts` with the stdio bin**

```ts
#!/usr/bin/env node
// src/index.ts — scratch-mcp stdio entry point
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const { server, session } = createServer();
  const shutdown = async () => { await session.dispose().catch(() => {}); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Delete the obsolete smoke test:
```bash
git rm tests/scaffold.test.ts
```

- [ ] **Step 6: Add `bin` + `start` to `package.json`**

In `package.json`, add a top-level `"bin"` and a `start` script (keep existing scripts/deps):

```json
  "bin": { "scratch-mcp": "dist/src/index.js" },
```
and inside `"scripts"`:
```json
    "start": "node dist/src/index.js",
```

- [ ] **Step 7: Run the server test + build to verify it passes**

Run: `npx vitest run tests/mcp/server.test.ts`
Expected: PASS (3/3).

Run: `npm run build && node -e "import('./dist/src/mcp/server.js').then(m => { const { server } = m.createServer(); console.log('built OK'); })"`
Expected: prints `built OK` (the bin module builds and `createServer` is callable). Note: do NOT run `node dist/src/index.js` directly — it blocks on stdio waiting for an MCP client.

- [ ] **Step 8: Typecheck + commit**

```bash
npx tsc --noEmit
git add package.json package-lock.json src/mcp/server.ts src/index.ts
git commit -m "feat(mcp): stdio server registration + bin (10 tools, SDK + zod)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Finalize — full suite, ledger, whole-branch review, merge

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append the MCP-server ledger block)

- [ ] **Step 1: Full suite green**

Run: `npm run build && npx vitest run && npx tsc --noEmit`
Expected: all suites pass. Per gate policy, re-run any editor/Playwright file that flakes under parallel load in isolation (`npx vitest run tests/editor/run.test.ts`, `tests/editor/state.test.ts`, `tests/mcp/tools-editor.test.ts`) and treat an isolation pass as green.

- [ ] **Step 2: Append the progress-ledger block**

Add to the bottom of `.superpowers/sdd/progress.md`:

```markdown
# MCP Server — Progress Ledger
Spec: docs/superpowers/specs/2026-06-24-scratch-mcp-server-design.md
Plan: docs/superpowers/plans/2026-06-24-scratch-mcp-server.md
Branch: mcp-server (off main)

- [x] Task 1: run() awaits PROJECT_RUN_STOP w/ timeout (§15a)
- [x] Task 2: namespaced read_state (§15b)
- [x] Task 3: diagnostics formatter
- [x] Task 4: scaffold + list
- [x] Task 5: Session (active project + lazy editor singleton)
- [x] Task 6: build-tool handlers + result/compile helpers
- [x] Task 7: editor-tool handlers + e2e
- [x] Task 8: server registration + bin + deps (SDK + zod)

DESIGN (do not re-derive): 10 stdio tools; import_sb3 = LOAD-ONLY (decompiler
deferred); headed editor default (SCRATCH_MCP_HEADLESS=1 for tests); projects
root ~/scratch-mcp/projects (SCRATCH_MCP_PROJECTS_DIR override); fail-loud
reload loads nothing on compile error; run timeout is NOT an error.
```

- [ ] **Step 3: Commit the ledger**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(mcp): progress ledger for the MCP-server build

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Whole-branch review + merge**

Invoke superpowers:requesting-code-review for a whole-branch review (opus). Address any Critical/Important findings. Then invoke superpowers:finishing-a-development-branch to merge `mcp-server` → `main` via `--no-ff`, re-verifying the full suite on the merged result. Pushing to `origin` (the now-public GitHub repo) is a separate, owner-gated step — do NOT push without asking.

---

## Self-Review

**Spec coverage (spec §→task):**
- §1/§3 scope, 10 tools → Tasks 6, 7, 8 (surface) ✓
- §5 session model (active project, lazy headed singleton, projects root) → Task 5 ✓
- §6 tool table (all 10) → Task 6 (new/open/list/compile), Task 7 (reload/run/stop/snapshot/read_state/import_sb3), Task 8 (registration) ✓
- §7a run-completion → Task 1 ✓
- §7b namespaced read_state → Task 2 ✓
- §7c loud 404s preserved → no static-server change anywhere (constraint honored; nothing touches `static-server.ts`) ✓
- §9 diagnostics surfacing → Task 3 + used in Tasks 6/7 ✓
- §10 scaffold compiles clean → Task 4 (+ asserted) ✓
- §11 deps/bin/shutdown → Task 8 ✓
- §12 testing (scaffold/diagnostics/session unit, bridge regression, e2e, deliberate compile error) → Tasks 1-8 tests; deliberate error in Task 6 + Task 7 ✓
- §13 error handling (no-active/no-editor, compile error, run-timeout-not-error, loud bridge errors) → Tasks 5/6/7 ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**Type consistency:** `ToolResult` (Task 6) consumed unchanged in Tasks 7/8; `runCompile` return `{ok,sb3?,text}` consumed identically in Tasks 6/7; `Session` method names (`openProject/resolveProjectDir/getEditor/hasEditor/dispose`) consistent across Tasks 5/6/7/8; bridge `run({waitMs})→{idle}` (Task 1) consumed in Task 7; `readState()` shape (Task 2) consumed by `read_state` JSON in Task 7; `formatDiagnostics(diags)→{text,hasError}` (Task 3) consumed in Task 6's `compile.ts`. ✓
