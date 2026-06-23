# Live Editor Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a self-hosted Scratch (TurboWarp) editor that the MCP can drive through the `vm` API via Playwright — load a `.sb3`, run it, stop it, screenshot the stage, and read runtime state — proving the highest-risk piece of the Scratch MCP before any other subsystem is built.

**Architecture:** A pinned, self-hosted TurboWarp/scratch-gui build is served from a local static HTTP server. The MCP launches a headed Chromium via Playwright pointed at that server, where `window.vm` is exposed. A `ScratchEditor` class wraps the page and exposes a small, stable async interface (`launch/loadProject/run/stop/snapshot/readState/close`). All control flows through `vm.*` calls inside `page.evaluate` — never UI drag-and-drop.

**Tech Stack:** TypeScript (strict), Node 25, Playwright (Chromium, headed), Vitest, self-hosted `scratch-gui`/`scratch-vm`, a tiny static file server.

## Global Constraints

- Node ≥ 25; TypeScript `strict: true`; ESM modules (`"type": "module"`).
- Playwright browser is **Chromium, headed** (`headless: false`) by default so the user watches; tests may pass `{ headless: true }`.
- The editor build is **version-pinned** — record the exact `scratch-gui`/`scratch-vm` (or TurboWarp tag) version in `src/editor/EDITOR_VERSION.md`; never float it.
- The editor must expose the live VM as `window.vm`. This is the load-bearing integration contract for every later task and plan.
- `ScratchEditor` is the public bridge interface consumed by the future MCP-server plan — its method names and types are frozen by this plan (see Task 3 Interfaces).
- All control of the running project goes through `vm.*` (`loadProject`, `greenFlag`, `stopAll`, `runtime`, `renderer`). No Blockly/DOM drag interactions.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder export)
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable/testable TS+Vitest project. Exports `export const VERSION = "0.0.0"` from `src/index.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/scaffold.test.ts
import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";

test("package exposes a version", () => {
  expect(VERSION).toBe("0.0.0");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scaffold.test.ts`
Expected: FAIL — cannot resolve `../src/index.js` (module not found).

- [ ] **Step 3: Create the project files**

```jsonc
// package.json
{
  "name": "scratch-mcp",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  },
  "dependencies": {
    "playwright": "^1.48.0"
  }
}
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 120_000, // editor launch/build steps are slow
    hookTimeout: 120_000,
  },
});
```

```ts
// src/index.ts
export const VERSION = "0.0.0";
```

- [ ] **Step 4: Install deps and run the test**

Run: `npm install && npx vitest run tests/scaffold.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Install the Playwright Chromium browser**

Run: `npx playwright install chromium`
Expected: Chromium downloaded successfully (no error). This is required before any bridge task.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/index.ts tests/scaffold.test.ts package-lock.json
git commit -m "chore: scaffold TS + Vitest + Playwright project"
```

---

### Task 2: Self-host the editor with `window.vm` exposed (de-risk spike)

> **Nature of this task:** This is the project's de-risk gate. It is investigative — its deliverable is *a served editor page where `window.vm` is a working VM* — so it is structured as concrete actions with a hard verification gate rather than red-green TDD. Do not proceed to Task 3 until the Step "verification gate" passes.

**Files:**
- Create: `editor/` (the self-hosted editor app — package, entry, build config)
- Create: `src/editor/EDITOR_VERSION.md` (records the pinned versions + which strategy succeeded)
- Create: `editor/dist/` (built static output — git-ignored; commit a note, not the bundle)
- Modify: `.gitignore` (add `editor/dist/`, `editor/node_modules/`)

**Interfaces:**
- Consumes: nothing from prior tasks (independent setup).
- Produces: a directory of static files at `editor/dist/` that, when served over HTTP and opened in Chromium, mounts a Scratch editor and sets `window.vm` to a live `scratch-vm` instance. Records the chosen approach + exact versions in `src/editor/EDITOR_VERSION.md`.

- [ ] **Step 1: Build the editor app — Strategy A (preferred): own entry embedding `scratch-gui`**

Create an editor app that we fully control, so `window.vm` ownership is guaranteed (we create the VM ourselves):

```bash
mkdir -p editor && cd editor
npm init -y
npm i scratch-gui scratch-vm react react-dom
npm i -D vite @vitejs/plugin-react
```

```html
<!-- editor/index.html -->
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Scratch MCP Editor</title></head>
  <body>
    <div id="root" style="width:100vw;height:100vh"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

```jsx
// editor/src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import GUI from "scratch-gui";
import VM from "scratch-vm";

const vm = new VM();
// LOAD-BEARING: expose the VM so Playwright can drive it.
window.vm = vm;

const App = GUI.default ?? GUI;
createRoot(document.getElementById("root")).render(
  React.createElement(App, { vm, basePath: "/" })
);

// Signal readiness once the runtime is alive.
const ready = () => { window.__scratchReady = true; };
if (vm.runtime) ready(); else vm.on("workspaceUpdate", ready);
```

```js
// editor/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
```

- [ ] **Step 2: Build and serve Strategy A**

Run:
```bash
cd editor && npx vite build && npx vite preview --port 5174
```
Open `http://localhost:5174/` in Chrome. In DevTools console run:
```js
window.vm && window.vm.constructor && window.__scratchReady
```
Expected: `true` (a VM exists and the editor mounted). If the build fails on worker/asset bundling (a known `scratch-gui` packaging hazard), capture the exact error and proceed to Step 3 (Strategy B).

- [ ] **Step 3: Fallback — Strategy B: pinned TurboWarp build + expose patch**

Only if Strategy A cannot be made to bundle. Clone TurboWarp's GUI at a pinned tag and expose the VM in its playground entry:

```bash
cd editor && rm -rf scratch-gui
git clone --depth 1 --branch <PINNED_TAG> https://github.com/TurboWarp/scratch-gui
cd scratch-gui && npm ci
```
In the playground entry (`src/playground/render-gui.jsx` — locate where the `VM`/store is constructed), add immediately after the VM instance is created:
```js
window.vm = vm; // LOAD-BEARING bridge handle
```
Then build:
```bash
NODE_OPTIONS=--openssl-legacy-provider npm run build   # build to scratch-gui/build/
```
Copy the result to `editor/dist/`. Verify the same console check from Step 2 against `http://localhost:<port>/`.

- [ ] **Step 4: Record the outcome (verification gate)**

Create `src/editor/EDITOR_VERSION.md` documenting: which strategy succeeded (A or B), the exact pinned versions (`scratch-gui`, `scratch-vm`, or TurboWarp tag + commit), the served path layout, and the exact console-check command that returned `true`.

**HARD GATE:** Do not start Task 3 unless the console check (`window.vm` is a live VM after the page loads) passes and is recorded here. If neither strategy works, STOP and report — the architecture needs revisiting before any further work.

- [ ] **Step 5: Commit**

```bash
git add editor/index.html editor/src editor/vite.config.js editor/package.json editor/package-lock.json src/editor/EDITOR_VERSION.md .gitignore
git commit -m "feat(editor): self-host Scratch editor exposing window.vm"
```

---

### Task 3: `ScratchEditor.launch()` — serve build + attach Playwright, wait for ready

**Files:**
- Create: `src/editor/static-server.ts` (serve `editor/dist` on an ephemeral port)
- Create: `src/editor/scratch-editor.ts` (the bridge class)
- Test: `tests/editor/launch.test.ts`

**Interfaces:**
- Consumes: the served editor from Task 2 (`editor/dist`, `window.vm`, `window.__scratchReady`).
- Produces — the **frozen public bridge interface** (consumed by the future MCP-server plan):

```ts
// src/editor/scratch-editor.ts
export interface SpriteState {
  name: string;
  x: number;
  y: number;
  direction: number;
  visible: boolean;
  size: number;
  costume: number; // current costume index
}
export interface ProjectState {
  variables: Record<string, string | number | boolean>;
  sprites: SpriteState[];
}
export interface LaunchOptions {
  headless?: boolean; // default false (visible)
  port?: number;      // default: ephemeral
}
export class ScratchEditor {
  static async launch(opts?: LaunchOptions): Promise<ScratchEditor>;
  loadProject(sb3: Buffer): Promise<void>;
  run(): Promise<void>;
  stop(): Promise<void>;
  snapshot(): Promise<Buffer>;
  readState(): Promise<ProjectState>;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/editor/launch.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor/launch.test.ts`
Expected: FAIL — `ScratchEditor` has no export / `launch` undefined.

- [ ] **Step 3: Implement the static server**

```ts
// src/editor/static-server.ts
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".wav": "audio/wav", ".map": "application/json",
};

export interface StaticServer {
  url: string;
  close: () => Promise<void>;
}

export async function serveDir(root: string): Promise<StaticServer> {
  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let filePath = normalize(join(root, rawPath));
      if (!filePath.startsWith(normalize(root))) { res.statusCode = 403; return res.end(); }
      try {
        if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
      } catch {
        filePath = join(root, "index.html"); // SPA fallback
      }
      const body = await readFile(filePath);
      res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404; res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
```

- [ ] **Step 4: Implement `launch()` + `close()` + the test-only `hasLiveVm()` probe**

```ts
// src/editor/scratch-editor.ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveDir, type StaticServer } from "./static-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIST = resolve(here, "../../editor/dist");

export interface SpriteState {
  name: string; x: number; y: number; direction: number;
  visible: boolean; size: number; costume: number;
}
export interface ProjectState {
  variables: Record<string, string | number | boolean>;
  sprites: SpriteState[];
}
export interface LaunchOptions { headless?: boolean; port?: number; }

export class ScratchEditor {
  private constructor(
    private readonly server: StaticServer,
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async launch(opts: LaunchOptions = {}): Promise<ScratchEditor> {
    const server = await serveDir(EDITOR_DIST);
    const browser = await chromium.launch({ headless: opts.headless ?? false });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(server.url, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).vm) && (window as any).__scratchReady === true,
      { timeout: 60_000 },
    );
    return new ScratchEditor(server, browser, page);
  }

  /** Test-only probe. */
  async hasLiveVm(): Promise<boolean> {
    return this.page.evaluate(() => Boolean((window as any).vm?.runtime));
  }

  async close(): Promise<void> {
    await this.browser.close().catch(() => {});
    await this.server.close().catch(() => {});
  }

  // loadProject/run/stop/snapshot/readState implemented in Tasks 4–5.
  async loadProject(_sb3: Buffer): Promise<void> { throw new Error("not implemented"); }
  async run(): Promise<void> { throw new Error("not implemented"); }
  async stop(): Promise<void> { throw new Error("not implemented"); }
  async snapshot(): Promise<Buffer> { throw new Error("not implemented"); }
  async readState(): Promise<ProjectState> { throw new Error("not implemented"); }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/editor/launch.test.ts`
Expected: PASS — the editor boots headless and `hasLiveVm()` is `true`.

- [ ] **Step 6: Commit**

```bash
git add src/editor/static-server.ts src/editor/scratch-editor.ts tests/editor/launch.test.ts
git commit -m "feat(editor): ScratchEditor.launch attaches Playwright to served editor"
```

---

### Task 4: `loadProject` + `run` + `stop`

**Files:**
- Modify: `src/editor/scratch-editor.ts` (implement three methods)
- Create: `tests/fixtures/spin.sb3` (a known project: on green flag, set a variable and turn the sprite)
- Create: `tests/fixtures/README.md` (how the fixture was made — reproducibility)
- Test: `tests/editor/run.test.ts`

**Interfaces:**
- Consumes: `ScratchEditor.launch()` from Task 3; `window.vm.loadProject`, `vm.greenFlag`, `vm.stopAll`.
- Produces: working `loadProject(sb3: Buffer)`, `run()`, `stop()`.

- [ ] **Step 1: Create the test fixture `spin.sb3`**

Using the editor served in Task 2 (open it in a browser), build this exact project, then **File → Save to your computer**, and place the file at `tests/fixtures/spin.sb3`:

```
when green flag clicked
set [angle v] to (0)
repeat (36)
  turn cw (10) degrees
  change [angle v] by (10)
end
```

Document the steps in `tests/fixtures/README.md` so the fixture can be rebuilt. (This is the only manual artifact; later, the compiler plan can regenerate equivalents.)

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/editor/run.test.ts`
Expected: FAIL — `loadProject` throws `not implemented`.

- [ ] **Step 4: Implement `loadProject`, `run`, `stop`**

Replace the three stub methods in `src/editor/scratch-editor.ts`:

```ts
  async loadProject(sb3: Buffer): Promise<void> {
    const b64 = sb3.toString("base64");
    await this.page.evaluate(async (data: string) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await (window as any).vm.loadProject(bytes.buffer);
    }, b64);
  }

  async run(): Promise<void> {
    await this.page.evaluate(() => (window as any).vm.greenFlag());
  }

  async stop(): Promise<void> {
    await this.page.evaluate(() => (window as any).vm.stopAll());
  }
```

(`readState` is still stubbed; Task 5 implements it. To unblock this test, implement a minimal `readState` here that reads stage variables only, then expand it in Task 5 — OR sequence Task 5 before running this test. Recommended: implement Task 5's `readState` first, then this test passes end-to-end.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/editor/run.test.ts`
Expected: PASS — after running, `angle == 360`.

- [ ] **Step 6: Commit**

```bash
git add src/editor/scratch-editor.ts tests/fixtures/spin.sb3 tests/fixtures/README.md tests/editor/run.test.ts
git commit -m "feat(editor): loadProject/run/stop driving the VM"
```

---

### Task 5: `readState` + `snapshot`

**Files:**
- Modify: `src/editor/scratch-editor.ts` (implement `readState`, `snapshot`)
- Test: `tests/editor/state.test.ts`

**Interfaces:**
- Consumes: `vm.runtime.targets` (stage + sprites), `vm.renderer.canvas`.
- Produces: `readState(): Promise<ProjectState>` and `snapshot(): Promise<Buffer>` (PNG of the stage).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor/state.test.ts`
Expected: FAIL — `readState`/`snapshot` throw `not implemented`.

- [ ] **Step 3: Implement `readState` and `snapshot`**

Replace the two stub methods in `src/editor/scratch-editor.ts`:

```ts
  async readState(): Promise<ProjectState> {
    return this.page.evaluate(() => {
      const vm = (window as any).vm;
      const targets = vm.runtime.targets as any[];
      const variables: Record<string, string | number | boolean> = {};
      const sprites: any[] = [];
      for (const t of targets) {
        if (!t || t.isOriginal === false) continue; // skip clones
        for (const id of Object.keys(t.variables ?? {})) {
          const v = t.variables[id];
          if (v && v.type === "" /* scalar */) variables[v.name] = v.value;
        }
        if (!t.isStage) {
          sprites.push({
            name: t.sprite?.name ?? t.getName?.() ?? "",
            x: t.x, y: t.y, direction: t.direction,
            visible: t.visible, size: t.size,
            costume: t.currentCostume,
          });
        }
      }
      return { variables, sprites };
    });
  }

  async snapshot(): Promise<Buffer> {
    const dataUrl: string = await this.page.evaluate(() => {
      const vm = (window as any).vm;
      const canvas = vm.renderer?.canvas as HTMLCanvasElement;
      // force a render so the snapshot reflects current state
      vm.renderer?.draw?.();
      return canvas.toDataURL("image/png");
    });
    return Buffer.from(dataUrl.split(",")[1], "base64");
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor/state.test.ts`
Expected: PASS — sprite state is numeric; snapshot has a PNG header.

- [ ] **Step 5: Run the whole suite (regression)**

Run: `npm test`
Expected: all tests pass (scaffold, launch, run, state).

- [ ] **Step 6: Commit**

```bash
git add src/editor/scratch-editor.ts tests/editor/state.test.ts
git commit -m "feat(editor): readState + stage snapshot"
```

---

## What this plan delivers

A proven `ScratchEditor` bridge: launch a self-hosted Scratch editor, load any `.sb3`, run/stop it, read runtime state, and screenshot the stage — the Phase-0 de-risk gate from the spec. The frozen `ScratchEditor` interface (Task 3) is what the MCP-server plan will wrap.

## Follow-on plans (not in this document)

- **Compiler plan** — `*.sprite.scratch` + `project.yaml` → `.sb3` via the curated block dictionary + `sb-edit`, validated with headless `scratch-vm`. Independent of this plan (uses no editor).
- **MCP-server plan** — stdio server wrapping `ScratchEditor` + the compiler into tools (`new/open/list`, `compile`, `reload`, `run`, `stop`, `snapshot`, `read_state`, `import_sb3`).
- **Breadth & polish** — fill out the core palette, costumes/sounds/lists, asset tools, `sync_from_editor`.

## Self-Review

- **Spec coverage (Phase 0):** self-hosted TurboWarp editor ✓ (Task 2), `window.vm` exposed ✓ (Task 2), Playwright-driven `loadProject`/`greenFlag`/screenshot ✓ (Tasks 3–5), read runtime state ✓ (Task 5). Phases 1–3 are explicitly deferred to follow-on plans (noted above).
- **Placeholder scan:** Task 2 is intentionally a spike with concrete commands + a hard gate; `<PINNED_TAG>`/`<port>` are values resolved at execution and recorded in `EDITOR_VERSION.md`, not hidden TODOs. No "add error handling"-style placeholders.
- **Type consistency:** `ScratchEditor`, `ProjectState`, `SpriteState`, `LaunchOptions` are defined once in Task 3 and used unchanged in Tasks 4–5; method names (`launch/loadProject/run/stop/snapshot/readState/close`) match the Global Constraints contract.
- **Cross-task dependency note:** the Task 4 test calls `readState` (defined in Task 5). Resolved inline in Task 4 Step 4 — implement Task 5's `readState` first (or a minimal stage-only version) so Task 4's test is runnable.
