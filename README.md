# scratch-mcp

Turn readable **scratchblocks-style text into runnable Scratch 3 `.sb3` projects** — and drive a live Scratch editor to run them. A TypeScript compiler + a self-hosted [scratch-gui](https://github.com/scratchfoundation/scratch-gui) editor bridge, built toward an MCP server that lets an AI agent author and iterate on Scratch projects in an edit→compile→run loop.

> **Status:** the compiler (full core block palette) and the live-editor bridge are built and tested. The MCP-server wrapper is the next step — see [Roadmap](#roadmap).

## What it does

You write a project as plain text — a `project.yaml` manifest plus one `*.sprite.scratch` file per sprite (scratchblocks syntax) — and the compiler produces a `.sb3` that loads and runs in Scratch:

```yaml
# project.yaml
name: Grammar
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
variables:
  global: { r: 0, b: 0, c: 0 }
```

```
# cat.sprite.scratch
when green flag clicked
set [r v] to ((3) + (4))
if <(1) > (2)> then
  change [b v] by (1)
else
  set [b v] to (9)
end
repeat until <(c) = (5)>
  change [c v] by (1)
end
```

```ts
import { compileProject } from "./src/compiler/index.js";

const { ok, sb3, diagnostics } = await compileProject("path/to/project-dir");
// ok === false + diagnostics (and no sb3) if anything is malformed — fail-loud, collect-all.
```

## Block palette

The compiler covers the **entire Scratch 3 default palette** — 135 block definitions across all 11 categories (Motion · Looks · Sound · Events · Control · Sensing · Operators · Variables · Lists · Pen · Music), plus broadcasts and the `extensions[]` (Pen/Music) machinery. Every block is verified under a **dual standard**: a runtime assertion in a headless VM where the effect is observable, or a structural assertion on the emitted `project.json` plus a load-and-run check otherwise — and a coverage test proves every block's signature round-trips to its own opcode.

Out of scope for now: custom blocks/procedures, a real asset resolver (costumes/sounds resolve to a placeholder), and on-stage monitors.

## Architecture

- **Source** — `*.sprite.scratch` (scratchblocks text) + a `project.yaml` manifest.
- **Compiler** (`src/compiler/`) — manifest parser + a hand-rolled scratchblocks parser + a per-category block dictionary (`blocks/categories/*.ts`, guarded by a signature-uniqueness check) + a hand-rolled [JSZip](https://stuk.github.io/jszip/) packager that emits Scratch-3 `.sb3`. Headless verification runs against `scratch-vm@5.0.300`.
- **Live editor bridge** (`src/editor/`) — a self-hosted scratch-gui Vite app whose live VM is driven through [Playwright](https://playwright.dev) (`ScratchEditor`: `launch / loadProject / run / stop / snapshot / readState / close`), never by faking UI drags. The editor is a separate app under `editor/` (see `src/editor/EDITOR_VERSION.md` for pinned versions).

## Develop

Requires **Node ≥ 25**. The compiler/test stack has no native build step.

```bash
npm install
npm run build      # tsc -p tsconfig.json
npm test           # vitest run  (compiler + headless-VM + editor tests)
```

The self-hosted editor (only needed for the live-editor bridge) is built separately under `editor/`.

## Roadmap

- [x] Live-editor bridge (Phase 0)
- [x] Compiler pipeline skeleton (text → `.sb3`, headless-VM proven)
- [x] Infrastructure extensions (broadcasts, lists, Pen/Music `extensions[]`)
- [x] Full core block-palette dictionary (135 blocks, dual-standard tested)
- [ ] MCP server — wrap the compiler + bridge as stdio tools (`new` / `open` / `compile` / `reload` / `run` / `stop` / `snapshot` / `read_state`)
- [ ] Custom blocks / procedures
- [ ] Asset resolver (real costumes/sounds/backdrops)

## Tech

TypeScript (strict, ESM) · Node ≥ 25 · Vitest · JSZip · js-yaml · Playwright · headless `scratch-vm@5.0.300`.

Design specs and implementation plans live under [`docs/superpowers/`](docs/superpowers/).

---

Bundles and drives the MIT/BSD-licensed Scratch runtime and editor ([scratch-vm](https://github.com/scratchfoundation/scratch-vm), [scratch-gui](https://github.com/scratchfoundation/scratch-gui)) by the Scratch Foundation. Not affiliated with or endorsed by the Scratch Foundation.
