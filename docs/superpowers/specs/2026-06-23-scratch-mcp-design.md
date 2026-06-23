# Scratch MCP — Design

**Date:** 2026-06-23
**Status:** Design — awaiting user review
**Project root:** `~/scratch-mcp`

## 1. Goal

An MCP server that lets Claude **build and iterate on Scratch projects together with the user**, using the same rhythm as editing an Xcode project:

1. The user describes what they want.
2. Claude edits the project's **source** (human-readable files on disk).
3. The user (or Claude, to self-verify) **re-runs** — and a real, live Scratch editor now reflects Claude's changes, running them on the stage.

The project is a **persistent artifact** the user and Claude refine over many turns, not a one-shot generation.

## 2. The core loop

```
user: "make the cat bounce off the walls"
  → Claude edits  cat.sprite.scratch   (ordinary file edit)
  → reload         (MCP: compile source → load into live editor)
  → run            (MCP: green flag)
  → snapshot       (MCP: screenshot the stage)
  → Claude/user see the cat bouncing; iterate
```

The **source text is the single source of truth**, exactly like Swift files are canonical and the compiled app is derived. The user does not hand-edit the compiled `.sb3`. (An optional `sync_from_editor` tool can pull editor-side changes back into source — see §11.)

## 3. Architecture

Three subsystems, one coherent system:

```
            ┌─────────────────────────────────────────────────────────┐
            │  Claude Code  (edits source files with built-in Edit/Write)│
            └───────────────┬───────────────────────────┬──────────────┘
                            │ file edits                 │ MCP tool calls (stdio)
                            ▼                             ▼
   ┌─────────────────────────────────┐      ┌────────────────────────────────────┐
   │  (1) Project source on disk     │      │  (3) MCP server (Node/TS, stdio)    │
   │  *.sprite.scratch / project.yaml│◀────▶│   - compile / reload / run / stop   │
   │  assets/                        │      │   - snapshot / read_state           │
   └─────────────────────────────────┘      │   - new/open/list, import_sb3       │
                            ▲                └───────┬───────────────────┬─────────┘
                            │ compile (text → .sb3)  │ loadProject, vm.* │ screenshot
                            ▼                        ▼                   ▼
   ┌─────────────────────────────────┐      ┌────────────────────────────────────┐
   │  (2) Compiler                   │      │  Live editor (self-hosted TurboWarp)│
   │  scratchblocks text → project.json     │  Chromium tab via Playwright,        │
   │  via a curated block dictionary │      │  window.vm exposed, headed/visible   │
   │  + sb-edit for .sb3 packaging   │      └────────────────────────────────────┘
   └─────────────────────────────────┘
```

**Note on Playwright:** it is used only to *launch and render* the editor and to call the `vm` API + take screenshots — never to drag blocks around the UI. That keeps it robust (the fragile drag-and-drop path was explicitly rejected).

## 4. Component 1 — Project source format

A project is a **folder** (like an Xcode project):

```
my-project/
  project.yaml          # manifest: stage, sprites, variables, asset refs, positions
  stage.scratch         # optional scripts on the Stage
  cat.sprite.scratch    # one file per sprite — scripts in scratchblocks text
  ball.sprite.scratch
  assets/
    cat-a.svg
    meow.wav
  build/                # generated .sb3 / project.json (git-ignored)
```

**`*.sprite.scratch`** — scripts in **scratchblocks text**, the readable syntax Scratchers already share:

```
when green flag clicked
go to x: (0) y: (0)
point in direction (90)
forever
  move (10) steps
  if on edge, bounce
end
```

**`project.yaml`** — the manifest:

```yaml
name: Bouncing Cat
stage:
  costumes: [backdrop1.svg]
  source: stage.scratch          # optional
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
    costumes: [cat-a.svg, cat-b.svg]
    sounds: [meow.wav]
variables:
  global:
    score: 0
  Cat:
    speed: 10
lists:                            # optional, v1 basic
  global:
    high-scores: []
```

The compiler resolves names (variables, costumes, sounds, sprites) → Scratch ids. scratchblocks text refers to everything **by name**, never by id, so the files stay human-readable and diffable.

## 5. Component 2 — Compiler (the hard part)

Turns the source folder into a real Scratch `project.json` / `.sb3`.

**Strategy — own the parser, lean on a library for packaging:**

- A **table-driven parser + block dictionary** that we own. The dictionary maps each supported block's scratchblocks text signature → `{opcode, inputs, fields}` shape. The parser is small (recursive-descent over the scoped grammar: hat blocks, stacks, C-blocks like `if/forever/repeat`, reporters `( )`, booleans `< >`). We own this because the block dictionary *is* the heart of the compiler and must be precise and per-block testable.
- **`sb-edit`** (TS library for reading/writing Scratch projects) for the in-memory project model and **`.sb3` serialization** (zip + `project.json` + asset md5 hashing). This de-risks the packaging half so we only own the text→block-tree mapping. (Spike confirms its API fits; thin fallback serializer if not.)

**v1 supported block scope — the core palette:**
Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables (+ basic Lists). This covers the vast majority of real Scratch projects.

**Explicitly out of v1 scope (YAGNI):** custom blocks ("My Blocks"), most extensions (pen, music, video sensing), cloud variables, advanced list ops. Each can be added block-by-block later because the dictionary is additive.

**Fail loud:** any unsupported block, unresolved name, or malformed script raises a precise compile error (`file:line: unsupported block "pen down"`) rather than silently producing a broken project. Compile is a real build step with diagnostics.

**Decompile (reverse direction):** `project.json` → scratchblocks text, used by `import_sb3` (open an existing `.sb3` as an editable project) and by the optional editor sync-back. Round-trip is **not required to be byte-identical** (Swift→binary isn't either) — only semantically faithful.

## 6. Component 3 — Live editor bridge

**Self-hosted TurboWarp build** (chosen for robustness + offline + a guaranteed `vm` handle):

- Vendor a **pinned TurboWarp `scratch-gui` release** (git submodule or pinned dep), apply a **one-line patch** exposing the VM: `window.vm = vm` (+ a `window.__scratchReady` flag once the GUI mounts). Build to static files, cache the build.
- The MCP process serves those static files over a **local HTTP server** and launches a **headed Chromium via Playwright** pointed at `http://localhost:<port>/`. The tab stays open and persistent for the whole session, so the user watches changes land live.
- All control goes through `page.evaluate` against `window.vm`:
  - `reload`  → `vm.loadProject(<project.json/sb3 bytes>)` so freshly-edited blocks appear assembled
  - `run`     → `vm.greenFlag()`
  - `stop`    → `vm.stopAll()`
  - `read_state` → read variables / sprite x,y,direction, etc. from `vm.runtime`
  - `snapshot` → `page.screenshot()` of the stage region → returned as an MCP image

**Biggest setup cost / Phase-0 spike:** getting the self-hosted editor build to serve and reliably expose `window.vm` + load a project. This is the first thing we prove before building anything else (§13).

## 7. MCP server & tool surface

The MCP is **thin** — Claude edits the source text with its own `Edit`/`Write`, so the MCP does **not** need granular block tools. Its job is build + live-editor + inspection:

| Tool | Purpose |
|------|---------|
| `new_project(name, path?)` | Scaffold a project folder with a starter sprite |
| `open_project(path)` | Set the active project for subsequent tools |
| `list_projects(dir?)` | List known projects |
| `compile(path?)` | Build source → `.sb3`; return errors/warnings (no editor needed) |
| `reload(path?)` | Compile + load into the live editor |
| `run()` / `stop()` | Green flag / stop all |
| `snapshot()` | Screenshot the stage → image result |
| `read_state()` | Variable values, sprite positions/state |
| `import_sb3(file, path)` | Decompile an existing `.sb3` into editable source |
| `add_costume(sprite, image)` / `add_sound(sprite, file)` | Register an asset into the manifest |

Transport: **stdio** (works in Claude Code and Claude Desktop). The editor browser + HTTP server are launched lazily on first `reload`/editor use and kept alive for the session.

## 8. Data flow — one edit/run cycle

```
1. user: "make the cat bounce off the walls"
2. Claude: Edit cat.sprite.scratch  (add forever / move / if-on-edge-bounce)
3. Claude: reload()        → compile() → cat.sprite.scratch parsed via block dict
                                        → sb-edit builds Project → project.json/.sb3
                                        → page.evaluate(vm.loadProject(...))
4. Claude: run()           → vm.greenFlag()
5. Claude: snapshot()      → stage PNG → Claude "sees" the cat mid-bounce
6. Claude reports back / iterates; user watches the live tab the whole time
```

## 9. Tech stack

- **Language:** TypeScript on Node 25 (one language end-to-end; scratch-vm/gui & sb-edit are JS/TS).
- **MCP:** `@modelcontextprotocol/sdk` (TS), stdio transport.
- **Editor automation:** Playwright (Chromium), headed.
- **Project model / serialization:** `sb-edit`.
- **Editor:** pinned TurboWarp `scratch-gui`, self-hosted, `window.vm` exposed.
- **Tests:** vitest + **headless `scratch-vm`** for semantic validation.

## 10. v1 scope & non-goals

**In v1:** create/open projects; edit scratchblocks-text source; compile (core palette) with loud diagnostics; self-hosted live editor; reload/run/stop/snapshot/read_state; import existing `.sb3`; basic costumes/sounds/variables/lists.

**Out of v1 (later, additive):** custom blocks, pen/music/other extensions, cloud variables, scratch.mit.edu account upload/publishing, drag-and-drop UI automation, editor→source auto-sync as default (available as an explicit tool only — §11).

## 11. Source-of-truth & editor sync

Source text is canonical. If the user drags blocks in the live editor, that diverges from the files. v1 stance: the editor is a *viewer/runner* of the compiled source. An **explicit** `sync_from_editor` tool may read the live `vm` project.json, decompile it, and overwrite the source files — opt-in, never automatic, so we never silently clobber hand-written source.

## 12. Testing strategy

- **Compiler unit tests (per block):** scratchblocks snippet → expected `{opcode, inputs, fields}`. One test per supported block; this is how we grow the dictionary safely (TDD).
- **Semantic tests (headless scratch-vm):** load a generated `.sb3` in a headless VM, `greenFlag`, step N frames, assert runtime effects (e.g. sprite x changed, variable == expected). Validates behavior, not just structure.
- **Round-trip tests:** source → `.sb3` → decompile → source is semantically equivalent.
- **Bridge integration test:** launch editor, load a known project, run, screenshot is non-blank, `read_state` returns expected variable.

## 13. Build phases (order)

- **Phase 0 — Editor spike (de-risk first):** self-hosted TurboWarp build serving locally with `window.vm` reachable; prove `loadProject` + `greenFlag` + screenshot from Playwright on a hand-made `.sb3`. *Gate: nothing else starts until this works.*
- **Phase 1 — Compiler core:** source format + parser + block dictionary for events/control/motion first, validated with headless-vm semantic tests; `compile` + `import_sb3` (decompile).
- **Phase 2 — MCP wiring:** stdio server, `new/open/list`, `reload/run/stop/snapshot/read_state`; connect compiler + bridge.
- **Phase 3 — Breadth & polish:** fill out the rest of the core palette, costumes/sounds/lists, asset tools, diagnostics polish, `sync_from_editor`.

## 14. Open questions / risks

1. **`sb-edit` programmatic construction & `.sb3` write** fit our needs — confirm in Phase 0/1, else thin serializer.
2. **TurboWarp build weight / version pinning** — biggest setup cost; mitigate by pinning a release and caching the build.
3. **`window.vm` exposure** in the chosen build — proven in Phase 0.
4. **Project location default** — currently `~/scratch-mcp` for the tool itself; user projects default to a `projects/` dir or a user-given path. (Note: an empty `~/SOFTWAREMCP` exists — confirm whether the project should live there instead.)

## 15. Carry-forward decisions from the Phase-0 (live editor bridge) review

The live-editor-bridge branch is merge-ready, but the whole-branch review surfaced three interface-design decisions to settle when writing the MCP-server / compiler plans — cheap now, expensive after the `ScratchEditor` interface is consumed:

1. **Run-completion signal.** `run()` is fire-and-forget; the bridge tests currently settle via a fixed `setTimeout(1500)`. The MCP `run` tool needs a real "project idle" signal — scratch-vm emits `PROJECT_RUN_STOP` when all threads finish. Add `runUntilIdle()` (or have `run()` optionally await that event) in the MCP-server plan and drop the sleep. Decide before the interface is wrapped.
2. **Per-sprite variable namespacing in `readState`.** `readState` flattens all targets' scalar variables into one name-keyed record, so a global and a same-named sprite-local collide. The MCP `read_state` tool should namespace sprite-locals (e.g. `sprites[].variables` alongside a global `variables`). Shape this when the tool is built.
3. **Keep loud 404s.** The static server now returns real 404s for missing extension-ed assets (SPA fallback only for navigations); `copy-runtime-assets` still hardcodes its dir list, so a future scratch-gui runtime-asset addition will surface as a real failure rather than a silent `index.html` mask — preserve that 404 behavior.

These are notes for the next plan, not blockers for Phase 0.
