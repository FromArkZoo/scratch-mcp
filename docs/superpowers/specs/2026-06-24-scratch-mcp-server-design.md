# Scratch MCP — Server Design

**Date:** 2026-06-24
**Status:** Design — awaiting user review
**Project root:** `~/scratch-mcp`
**Supersedes (for the server layer only):** the MCP tool-surface sketch in `2026-06-23-scratch-mcp-design.md` §7. The umbrella vision there still holds; this spec is the concrete, build-ready design for the stdio server now that the compiler and bridge are merged.

## 1. Goal

Expose the two finished subsystems — the **compiler** (`compileProject(dir) → .sb3`) and the frozen **`ScratchEditor`** Playwright bridge — as a single **stdio MCP server**, so Claude can drive the Xcode-style edit→reload→run→snapshot loop the umbrella design describes. This is the project's namesake milestone: the `scratch-mcp` server itself.

Two interface decisions carried forward from the live-editor-bridge review (`2026-06-23-scratch-mcp-design.md` §15) are resolved here, because they are cheap now and expensive after the bridge is consumed:

- **§15(a)** `run()` is fire-and-forget → add a real run-completion ("project idle") signal.
- **§15(b)** `readState` flattens all targets' variables into one record → namespace per sprite.
- **§15(c)** keep the static server's loud 404s → already in place; this milestone must not regress it.

## 2. What already exists (do not re-derive)

**Compiler** — `src/compiler/index.ts`:
```ts
export async function compileProject(dir: string): Promise<CompileResult>;
// CompileResult = { ok: boolean; sb3?: Buffer; diagnostics: Diagnostic[] }
// Diagnostic    = { file: string; line: number; col?: number; message: string; severity: "error"|"warning" }
```
Reads `project.yaml` + `*.scratch` from `dir`; full 135-block Scratch-3 default palette; **fail-loud** (unknown block / unresolved name / missing file → `error` diagnostic, `ok:false`, no `.sb3`). Emits a deterministic **placeholder costume** per sprite, so every compiled project loads and runs in a VM. Forward-only: it never reads a `project.json`. There is **no decompiler** (`.sb3 → source`) — that was always scoped as its own later phase and is out of scope here.

**Bridge** — `src/editor/scratch-editor.ts`, class `ScratchEditor`. The `launch/loadProject/stop/snapshot/close` contract is frozen; `run`/`readState` are reshaped here under the §15 pre-authorization (see §7). Current signatures:
```ts
static launch(opts?: { headless?: boolean; port?: number }): Promise<ScratchEditor>;
loadProject(sb3: Buffer): Promise<void>;   // base64 → window.vm.loadProject
run(): Promise<void>;                       // window.vm.greenFlag()  — fire-and-forget today
stop(): Promise<void>;                       // window.vm.stopAll()
snapshot(): Promise<Buffer>;                 // stage canvas → PNG Buffer
readState(): Promise<ProjectState>;          // flattened today
close(): Promise<void>;
```
Self-hosted scratch-gui served over a local HTTP static server; headed Chromium via Playwright; `window.vm` + `window.__scratchReady` exposed. `PROJECT_RUN_STOP` is emitted by `scratch-vm@5.0.300` runtime when all threads finish (verified at `node_modules/scratch-vm/src/engine/runtime.js`).

**Not yet present:** `@modelcontextprotocol/sdk`, `zod`. No asset pipeline (manifest does not parse `costumes:`/`sounds:`; packager always emits the placeholder).

## 3. Scope

**In scope:** a stdio MCP server wrapping compiler + bridge; the §15(a)/(b) bridge extensions; fail-loud diagnostics surfaced to the calling agent; project scaffolding/open/list; load-only `import_sb3`.

**Out of scope (deferred, each its own future sub-project):** the decompiler and editable `import_sb3`; `sync_from_editor`; asset tools (`add_costume`/`add_sound`) and any real asset resolution; on-stage monitors; multiple concurrent projects/tabs; publishing to scratch.mit.edu.

## 4. Architecture

```
 Claude Code ──file edits──▶ project source (project.yaml + *.scratch)
      │                              ▲
      │ MCP stdio tool calls         │ compileProject(dir)
      ▼                              │
 ┌─────────────────────────────────────────────────────────┐
 │ MCP server  (src/mcp/, booted by src/index.ts)           │
 │  • Session: activeProjectDir + lazy singleton editor     │
 │  • 10 tools → delegate to compiler + ScratchEditor       │
 └───────────────┬───────────────────────────┬─────────────┘
                 │ compileProject (text→.sb3) │ loadProject / run / stop
                 ▼                            ▼ snapshot / readState
        ┌──────────────────┐        ┌──────────────────────────┐
        │ Compiler (frozen)│        │ ScratchEditor (extended   │
        │                  │        │ additively for §15 a/b)   │
        └──────────────────┘        └──────────────────────────┘
```

**Module layout (new code under `src/mcp/`):**

| File | Responsibility |
|---|---|
| `src/index.ts` | bin entry: construct server, connect `StdioServerTransport`, run. Replaces the current `VERSION` stub. |
| `src/mcp/server.ts` | build the `McpServer`, register all 10 tools (schemas + handlers), own graceful shutdown (close editor on exit). |
| `src/mcp/session.ts` | `Session` class: holds `activeProjectDir`, resolves a tool's target dir (arg `path` ▸ active ▸ error), lazily launches + caches the singleton `ScratchEditor`, `dispose()`. |
| `src/mcp/diagnostics.ts` | format `Diagnostic[]` → human-readable text; classify ok/error. |
| `src/mcp/scaffold.ts` | `new_project` / `list_projects` filesystem logic. |
| `src/editor/scratch-editor.ts` | **extended** (§7): real run-completion + namespaced state read. |

Each tool handler is a thin adapter: validate input (zod) → call session/compiler/bridge → map result to MCP content. No tool contains compiler or VM logic.

## 5. Session & project model

- The server is **one process per MCP session** (stdio). It holds session state in a single `Session` instance.
- **Active project:** `open_project(path)` sets `activeProjectDir` after validating `<path>/project.yaml` exists. `compile`/`reload` accept an optional `path` that overrides the active dir for that call. Resolution order: explicit `path` ▸ `activeProjectDir` ▸ `error("no active project — call open_project or pass a path")`.
- **Editor lifecycle:** a **single** `ScratchEditor`, launched **lazily** on the first `reload`/`import_sb3` and cached for the session. **Headed/visible by default** (the user watches changes land live); `SCRATCH_MCP_HEADLESS=1` forces headless (used by tests/CI). One project + one tab at a time; switching projects reuses the same tab. Closed on server shutdown via `Session.dispose()`.
- **Projects root:** defaults to `~/scratch-mcp/projects/` (created on demand), overridable via `SCRATCH_MCP_PROJECTS_DIR`. `new_project` writes there when given a bare name; tools also accept absolute paths anywhere.

## 6. Tool surface (10 tools)

All tools return MCP content blocks. Errors set `isError: true` with a human-readable message. Input schemas are zod.

| Tool | Input | Success result | Error behavior |
|---|---|---|---|
| `new_project` | `name: string`, `path?: string` | text: created path + starter files. Scaffold **must `compile` clean.** | dir already exists / unwritable → `isError`. |
| `open_project` | `path: string` | text: active project set. | missing `project.yaml` → `isError`. |
| `list_projects` | `dir?: string` | text: project names + paths under root (or `dir`). | unreadable dir → `isError`. |
| `compile` | `path?: string` | text: "compiled OK" + any warnings. **No editor launched.** | `ok:false` → `isError` + formatted diagnostics. |
| `reload` | `path?: string` | text: "loaded into editor" + warnings. Compiles, then `loadProject`. | compile `ok:false` → `isError` + diagnostics, **editor left untouched** (nothing loaded). |
| `run` | `timeoutMs?: number` (default 10000) | text: `{ idle: true }` or `{ idle: false, timedOut: true }`. | no editor yet (no prior reload/import) → `isError("reload or import a project first")`. |
| `stop` | — | text: stopped. | no editor → `isError`. |
| `snapshot` | — | **image** content (PNG, base64) + short text caption. | no editor → `isError`; blank/zero-byte capture → `isError`. |
| `read_state` | — | text: pretty JSON of the namespaced state (§8). | no editor → `isError`. |
| `import_sb3` | `file: string` | text: loaded; note it is **runnable, not editable source**. Launches editor if needed, `loadProject(bytes)`. | file missing / not a zip → `isError`. |

`run`/`stop`/`snapshot`/`read_state`/`import_sb3` require a live editor; `compile`/`new_project`/`open_project`/`list_projects` do not.

## 7. Bridge extensions (resolving §15 a/b)

§15 pre-authorized reshaping `run` and `readState` "when the tool is built." Both are **additive** changes to `ScratchEditor` — the `launch/loadProject/stop/snapshot/close` contract is untouched. The alternative (the MCP doing raw Playwright) is impossible: the `page` handle is private to the bridge.

### 7a. Run-completion signal (§15a)

`run()` gains an optional bounded wait and reports whether the project went idle:
```ts
run(opts?: { waitMs?: number }): Promise<{ idle: boolean }>;
```
Mechanism (mirrors the existing `__scratchReady` pattern):
1. In the page, install a **one-shot** `PROJECT_RUN_STOP` listener on `vm.runtime` that sets `window.__scratchRunDone = true`. Reset the flag to `false` immediately before `greenFlag()`.
2. `greenFlag()`.
3. `page.waitForFunction(() => window.__scratchRunDone === true, { timeout: waitMs })`. On timeout, **resolve** `{ idle: false }` (do not throw — a `forever` loop legitimately never idles). On fire, `{ idle: true }`.

The listener must be (re)installed per run (one-shot via `runtime.once`, or a removable handler) so repeated runs don't accumulate listeners. The MCP `run` tool's `timeoutMs` input is passed as the bridge `waitMs`; the tool maps `{idle:false}` → `{ idle: false, timedOut: true }` text. `tests/editor/run.test.ts` drops its `setTimeout(1500)` and awaits `run({ waitMs })` instead; the `angle === 360` assertion is unchanged (the 36-repeat loop terminates → idle fires).

### 7b. Namespaced state read (§15b)

`readState()` return shape changes from the flat `{ variables, sprites[] }` to:
```ts
interface ScalarMap { [name: string]: string | number | boolean }
interface ListMap   { [name: string]: (string | number | boolean)[] }
interface SpriteState {
  name: string; x: number; y: number; direction: number;
  visible: boolean; size: number; costume: number;
  variables: ScalarMap;   // this sprite's locals
  lists: ListMap;         // this sprite's local lists
}
interface ProjectState {
  variables: ScalarMap;   // Stage/global scalars
  lists: ListMap;         // Stage/global lists
  sprites: SpriteState[];
}
```
Rules: iterate `vm.runtime.targets`, skip clones (`isOriginal === false`). For the Stage target, its scalars/lists populate the top-level `variables`/`lists`. For each non-stage original, x/y/direction/visible/size/costume as today **plus** its own scalars under `sprites[].variables` and its own lists under `sprites[].lists`. Scalar = `variable.type === ""`; list = `variable.type === "list"`. This removes the global-vs-sprite-local name collision.

**Back-compat check:** existing `state.test.ts` reads `sprites[0].x`/`.direction` — still valid. `run.test.ts` reads `variables["angle"]`; `angle` is a **Stage/global** var in the spin fixture (verified) → stays at top-level `variables`. No test relocation needed beyond the §7a timeout change.

## 8. read_state output

The `read_state` tool returns the §7b `ProjectState` as pretty-printed JSON in a text block (compact, agent-readable). Example:
```json
{
  "variables": { "angle": 360 },
  "lists": {},
  "sprites": [
    { "name": "Cat", "x": 0, "y": 0, "direction": 90, "visible": true,
      "size": 100, "costume": 0, "variables": { "speed": 10 }, "lists": {} }
  ]
}
```

## 9. Diagnostics surfacing

`src/mcp/diagnostics.ts` formats each `Diagnostic` as `relpath:line[:col]: severity: message`, one per line, ordered as produced, prefixed by a one-line summary (`N error(s), M warning(s)`).
- `compile`/`reload` with `ok:false` → tool result `isError:true`, body = the formatted listing. `reload` additionally guarantees **nothing was loaded** into the editor (compile happens first; load only on `ok:true`).
- `ok:true` with warnings → success result, body = "Compiled OK" + the warnings listing.
- `ok:true` no warnings → terse success.

This keeps the compiler's fail-loud contract visible to the agent: a broken edit yields precise `file:line` errors, never a silently-broken project.

## 10. new_project scaffold

`new_project(name, path?)` creates a folder (`path` if absolute, else `<root>/<slug(name)>`) containing:
- `project.yaml` — `name`, one `Cat` sprite → `cat.sprite.scratch` (no costumes/sounds keys; placeholder costume is automatic).
- `cat.sprite.scratch` — a minimal script that compiles clean and does something visible, e.g.:
  ```
  when green flag clicked
  move (10) steps
  ```

The handler **compiles the scaffold before returning** and fails loud if it does not produce `ok:true` (guards against scaffold drift vs. the parser/manifest). Refuses to overwrite an existing non-empty dir.

## 11. Packaging & wiring

- Add deps: `@modelcontextprotocol/sdk`, `zod`. (`playwright`, `js-yaml`, `jszip` already present.)
- `src/index.ts` becomes the bin entry (shebang, `#!/usr/bin/env node`); `package.json` gains `"bin": { "scratch-mcp": "dist/src/index.js" }` and (optionally) a `start` script.
- Server identity: name `scratch-mcp`, version from `package.json`.
- High-level SDK: `McpServer` + `server.registerTool(name, { description, inputSchema }, handler)`; `StdioServerTransport`; handlers return `{ content: [...], isError? }`. Image results use `{ type: "image", data: <base64>, mimeType: "image/png" }`.
- Graceful shutdown: on transport close / `SIGINT` / `SIGTERM`, call `Session.dispose()` (closes the editor browser + static server) before exit.

## 12. Testing strategy

- **Scaffold unit** (`tests/mcp/scaffold.test.ts`): `new_project` writes the expected files **and** `compileProject` on the result returns `ok:true`; refuses non-empty dir.
- **Diagnostics unit** (`tests/mcp/diagnostics.test.ts`): formatting of error/warning/mixed diagnostic arrays; summary line; ordering.
- **Session unit** (`tests/mcp/session.test.ts`): path resolution order (explicit ▸ active ▸ error); editor launched at most once and reused.
- **Bridge regression** (existing, headless): `state.test.ts` updated to the namespaced shape (assert a sprite local under `sprites[].variables` distinct from a same-named global); `run.test.ts` uses `run({ waitMs })` and the real idle signal (no `setTimeout`).
- **End-to-end integration** (`tests/mcp/e2e.test.ts`, headless editor via `SCRATCH_MCP_HEADLESS=1`): drive the real tool handlers in-process on a temp project — `new_project` → `compile` → `reload` → `run(await idle)` → `read_state` (assert global≠local namespacing) → `snapshot` (PNG magic, non-trivial size) → `import_sb3` of `spin.sb3` (load-only, then `run`/`read_state` work). One handler also exercises a deliberate compile error → `isError` + a `file:line` diagnostic (fail-loud proven, not tautological).
- Gate policy follows the ledger: run the full suite, re-run any Playwright/editor flake in isolation rather than treating a parallel-load flake as failure.

## 13. Error handling summary

- **No active project / no editor:** precise, actionable `isError` text (which tool to call first).
- **Compile errors:** `isError` + formatted `file:line` diagnostics; `reload` loads nothing.
- **Run timeout:** **not** an error — `{ idle:false, timedOut:true }` (forever loops are valid).
- **Bridge/Playwright failures** (launch, load, snapshot): surface the underlying message as `isError`; never swallow.
- **Loud 404s (§15c):** unchanged; the static server keeps returning real 404s for missing runtime assets (no SPA mask). This milestone adds no static-server changes.

## 14. Carry-forward minors (from prior reviews, fold in opportunistically)

- Editor-suite Playwright tests flake under full-suite parallel load but pass in isolation (known-environmental) — keep the isolation re-run gate.
- `loadProject` base64-over-IPC note (large `.sb3`) is acceptable at this scope; no change.
- No `vm.dispose()` between loads — acceptable; `Session` holds one long-lived editor.

## 15. Non-goals (explicit)

Decompiler / editable `import_sb3`; `sync_from_editor`; asset registration + real costumes/sounds; on-stage variable monitors; multi-project/multi-tab; account upload/publish; drag-and-drop UI automation. All remain additive future sub-projects; none change the contracts frozen here.

## 16. Open questions

None blocking. Resolved defaults (user-approved): load-only `import_sb3`; headed-by-default editor + `~/scratch-mcp/projects/` root; fail-loud `reload`. The umbrella design's §14 "project location" question is settled by §5 (configurable root + absolute paths).
