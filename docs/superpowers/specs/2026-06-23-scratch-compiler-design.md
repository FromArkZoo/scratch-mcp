# Scratch Compiler — Design

**Date:** 2026-06-23
**Status:** Design — awaiting user review
**Project root:** `~/scratch-mcp` (sub-project of [Scratch MCP](2026-06-23-scratch-mcp-design.md); pairs with the completed live-editor bridge)

## 1. Goal

A **headless library** that turns the editable project source folder into a runnable Scratch `.sb3`:

```ts
compileProject(dir: string, opts?: CompileOptions): Promise<CompileResult>
```

"Headless" = no browser. Correctness is proven by loading the output in a headless `scratch-vm`. The future MCP server's `compile` / `reload` tools call this; `reload` then hands the `.sb3` to the already-built `ScratchEditor` bridge.

## 2. Pipeline

```
project.yaml + *.sprite.scratch + assets/
  → manifest parser     (yaml → typed Project model: stage, sprites, vars, lists, asset refs)
  → script parser       (scratchblocks text → block trees per target; two-pass for custom blocks)
  → block dictionary    (each block signature → {opcode, inputs, fields, mutation})
  → asset resolver      (costume/sound name → real library asset via CDN+cache, or generated placeholder)
  → packager            (assemble project.json + zip assets + md5 hashing → .sb3 Buffer)
  → [test] headless scratch-vm loads it, greenFlag, assert runtime effects
```

Each arrow is an isolated, independently testable module.

## 3. Components

### 3.1 Manifest parser (`src/compiler/manifest.ts`)
Parses `project.yaml` (via `js-yaml`) into a typed `Project` model. Schema:
```yaml
name: My Game
stage:
  source: stage.scratch          # optional script file
  backdrops: [Blue Sky, Stage1]  # library names (resolved by asset resolver)
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
    size: 100
    direction: 90
    visible: true
    costumes: [cat-a, cat-b]      # library names or files in assets/
    sounds: [Meow]
variables:
  global: { score: 0 }
  Cat:    { speed: 10 }
lists:
  global: { "high scores": [] }
```
Validates references (every sprite `source` exists; names are unique) and emits diagnostics for problems.

### 3.2 Source format + script parser (`src/compiler/parser/`)
`*.sprite.scratch` / `stage.scratch` hold scratchblocks text — the readable Scratch syntax:
```
when green flag clicked
set [score v] to (0)
forever
  if <touching (edge v) ?> then
    change [score v] by (1)
  end
end

define jump (height) times
repeat (height)
  change y by (10)
end
```
A **table-driven recursive-descent parser** over the scratchblocks grammar:
- **shapes:** hat, stack, cap, C-block (`if/else`, `forever`, `repeat`, `repeat until`), reporter `( )`, boolean `< >`.
- **inputs:** number `(10)`, text `[hello]`, boolean `<…>`, dropdown/menu `[edge v]`, nested reporters/booleans, C-block substacks.
- **custom blocks (two-pass per target):** pass 1 collects every `define …` prototype (label + typed args `(num/str)` and `<bool>`); pass 2 parses all scripts so custom-block **calls** match a known prototype. Argument reporters inside a definition (`(height)`) resolve to `argument_reporter_string_number` / `…_boolean`.
- We own this (not the `scratchblocks` npm lib, which is render-oriented and doesn't map cleanly to opcodes).

### 3.3 Block dictionary (`src/compiler/blocks/`) — the heart, and the ultracode fan-out unit
One entry per block maps its scratchblocks signature to Scratch 3 block JSON:
```ts
interface BlockDef {
  signature: string;        // "move (STEPS) steps", "set [VAR] to (VALUE)"
  opcode: string;           // "motion_movesteps"
  shape: "hat" | "stack" | "cap" | "c" | "reporter" | "boolean";
  inputs?: Record<string, InputSpec>;   // STEPS → number shadow, CONDITION → boolean, SUBSTACK → substack, …
  fields?: Record<string, FieldSpec>;   // VARIABLE → variable field, KEY_OPTION → dropdown
}
```
Entries are authored from the canonical Scratch block set (`scratch-vm` opcodes + the scratchblocks language reference). Organized by category file (`motion.ts`, `looks.ts`, … plus `pen.ts`, `music.ts`) so build-out parallelizes cleanly — **one ultracode agent per category**, each adding entries + the semantic tests that prove them.

**Procedures** (custom blocks) need their own machinery: `procedures_definition` + `procedures_prototype` (with mutation: `proccode`, `argumentids`, `argumentnames`, `argumentdefaults`, `warp`), `procedures_call` (matching mutation), and the two `argument_reporter_*` opcodes. This is the fiddliest family and gets a dedicated phase.

### 3.4 Asset resolver (`src/compiler/assets.ts`)
Resolves costume/sound **names** to real assets:
1. Build a **library index** from scratch-gui's bundled `libraries/*.json` (costumes, backdrops, sprites, sounds) → name → `{ md5ext, dataFormat, rotationCenter… }`.
2. Fetch the asset bytes from Scratch's asset CDN (`https://assets.scratch.mit.edu/internalapi/asset/<md5ext>/get/`) on first use, **cache** under `~/.cache/scratch-mcp/assets/<md5ext>` (shared across projects; offline thereafter).
3. A name also matching a file in the project's `assets/` uses that file (user-supplied art wins).
4. **Fallback:** a name not in the library and not a local file → generate a labeled-shape placeholder SVG (deterministic color from the name) so the project always compiles.

Network is needed only the first time a given library asset is used; the editor itself stays offline. Diagnostics warn when a fetch fails and a placeholder is substituted.

### 3.5 Packager (`src/compiler/packager.ts`)
Assembles `project.json` directly from the parsed targets + resolved assets and zips it (`jszip`) into a `.sb3` Buffer. Responsibilities: stable block-ID generation, top-level hat `x/y` layout, variable/list/broadcast ID assignment, costume/sound entries, asset md5ext naming (Node `crypto` md5 of bytes), the `meta` envelope, and **populating `project.json`'s `extensions` array** when Pen/Music blocks are used (e.g. `["pen"]`, `["music"]`). Hand-rolled (not `sb-edit`) so we fully control procedure mutations and custom block JSON. (This revises the parent spec's tentative `sb-edit` choice.)

### 3.6 Decompiler (`src/compiler/decompile.ts`) — later phase
`.sb3` → editable source folder (manifest + `*.sprite.scratch`), powering the MCP `import_sb3` tool. Round-trip need only be **semantically** faithful, not byte-identical. Deferred to its own phase/plan.

## 4. Public interface

```ts
interface Diagnostic { file: string; line: number; col?: number; message: string; severity: "error" | "warning"; }
interface CompileResult { ok: boolean; sb3?: Buffer; diagnostics: Diagnostic[]; }
interface CompileOptions { assetCacheDir?: string; allowNetwork?: boolean; }

async function compileProject(dir: string, opts?: CompileOptions): Promise<CompileResult>;
async function decompileSb3(sb3: Buffer, outDir: string): Promise<Diagnostic[]>; // later phase
```

## 5. Scope

**In v1:** Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, Lists, **custom blocks** (procedures with string/number/boolean args, argument reporters, call mutations, `warp`/"run without screen refresh"), **and the Pen and Music extensions** (pen down/up/stamp/clear + color/size; play note/drum, set instrument/tempo, rest) — near-core to a whole class of creative and musical ideas, and mechanically just two more dictionary categories. Costumes/sounds via CDN library + generated fallback. Manifest with variables, lists, per-sprite state.

**Out of v1 (additive later):** the remaining extensions (video sensing, text-to-speech, translate), cloud variables, `import_sb3` decompile (own phase). Each is additive — the dictionary and packager don't change shape to add them.

## 6. Error handling

**Fail loud, collect all.** The compiler accumulates every `Diagnostic` (with `file:line`) rather than stopping at the first — `cat.sprite.scratch:12: unknown block "pen down"`, `unresolved variable "scor" (did you mean "score"?)`, `custom block call "jmp (3)" has no matching define`. `compileProject` returns `{ ok: false, diagnostics }` and **no** `.sb3` if any `error`-severity diagnostic fires; warnings (e.g. asset fetch failed → placeholder) don't block. Never emits a silently-broken project.

## 7. Testing

- **Per-block semantic tests** — the core discipline. Compile a minimal snippet using the block, load the `.sb3` in **headless `scratch-vm`**, `greenFlag`, step N frames, assert the runtime effect (variable value, sprite x/direction/costume, list contents). Proves behavior, not just JSON shape. One test per dictionary entry.
- **Parser unit tests** — text → block-tree structure, incl. nesting, custom-block two-pass, error cases.
- **Whole-project fixtures** — a few complete projects (a game, an animation, a procedure-heavy program) compile + run.
- **Round-trip** (when decompile lands) — source → `.sb3` → source is semantically equivalent.

## 8. Tech stack & dependencies

TypeScript (strict), Node ≥25, ESM. New deps: `js-yaml` (manifest), `jszip` (sb3 zip). Dev/test: `scratch-vm` (headless validation — already a transitive dep via the editor, pin a matching version). Node `crypto` for md5, `fetch` for CDN.

## 9. Build phasing (and where ultracode lands)

1. **Pipeline skeleton** — manifest parser + parser core (grammar, no custom blocks yet) + packager + a ~6-block vertical slice (whenflagclicked, set var, change var, repeat, move, if) proving `source → .sb3 → headless-vm runs it`. *Gate: a tiny project compiles and runs headlessly.*
2. **Asset resolver** — library index + CDN fetch/cache + placeholder fallback + bundling. (Needed for runnable, good-looking projects.)
3. **Block-dictionary build-out** — the full core palette, by category. ← **ULTRACODE fan-out**: one agent per category adds entries + per-block semantic tests; a completeness critic checks coverage vs the canonical opcode list; a comprehensive review pass.
4. **Custom blocks** (procedures) — definitions, prototypes, calls, argument reporters, mutations, `warp`.
5. *(later / own plan)* `import_sb3` decompile.

## 10. Open questions / risks

1. **scratch-vm version alignment** — the headless `scratch-vm` used in tests should match the editor's bundled `scratch-vm@5.0.300` so a `.sb3` that passes tests also loads in the editor. Pin both.
2. **scratchblocks grammar edge cases** — operator reporters with embedded symbols (`( ) + ( )`, `< > and < >`), menu vs text disambiguation (`[edge v]` dropdown vs `[hello]` text), and reporter-vs-literal in inputs. The parser needs a clear, tested disambiguation rule (dropdowns end with ` v]`).
3. **CDN dependency** — first use of a library asset needs network; document it and degrade to a placeholder with a warning when offline + uncached.
4. **Variable/broadcast declaration** — variables/lists come from the manifest; broadcasts are implied by `broadcast […]` / `when I receive […]` blocks. The parser must collect broadcast names and the packager assign IDs.
5. **This compiler feeds the MCP server**, which still owes the parent-spec §15 decisions (run-completion signal, per-sprite variable namespacing). The compiler's `Project` model should keep variable scope (global vs per-sprite) explicit so the later `read_state` namespacing is natural.

## 11. Deferred capabilities (from the idea-barrier review)

Reviewed 2026-06-23 for "what would block realizing a Scratch idea." **Pen + Music folded into v1** (§5). These are recorded as deliberate deferrals — the architecture absorbs each additively when wanted:

- **Claude-authored SVG costumes/backdrops** — let Claude write vector art directly into `assets/` as a first-class costume source (beyond library + placeholder), so custom visuals aren't limited to the library. Until then, costumes are CDN-library art or a generated labeled-shape placeholder.
- **On-stage variable/list monitors** — generating `monitors[]` entries so `show variable [x]` visibly displays a value/slider on the stage. Until then the `show/hide variable` blocks compile but nothing renders on the stage. (Small packager addition.)
- **Raw-block escape hatch** — a `raw:` directive (opcode + inputs) in source so a block missing from the dictionary never hard-blocks a whole project, decoupling realizability from dictionary completeness. (The fail-loud model otherwise turns any one unsupported block into a wall.)
- **Multi-frame / timed verification** — belongs to the bridge/MCP plan, not the compiler: `snapshot` is a single frame, so Claude can't *see* motion. Add a short multi-frame capture or timed `read_state` sampling so animation/game behavior can be verified, not just static layout.
- **Remix / `import_sb3`** — pull the decompile phase earlier than "someday": importing an existing `.sb3` as editable source is a strong *ideation entry point* ("start from this and extend it"), not just a convenience.
- **Clone-aware `read_state`** — authoring clones works (Control blocks), but the bridge's `read_state` skips clones, limiting debugging of clone-heavy games. A bridge/MCP-plan refinement.

Still comfortably out: cloud variables, video-sensing/TTS/translate extensions, audio recording, true bitmap costume editing.
