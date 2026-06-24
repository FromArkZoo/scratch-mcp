# Infrastructure Extensions (broadcasts · lists · extensions[]) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared compiler machinery the full core palette needs — `project.json` `extensions[]` (Pen/Music), broadcasts, and lists — proven on a tiny proving slice through a headless `scratch-vm`, then re-freeze the extended contract for the per-category fan-out (Sub-project B).

**Architecture:** Additive growth of the foundation. Extend `ShadowType`/`FieldSpec`/`InputSpec`/`InputValue` and the manifest model, then implement each mechanism (extensions scan → broadcast registry → list registry) with a per-mechanism headless-VM gate, mirroring how the foundation de-risked its encoding before the fan-out. Each category in Sub-project B then adds `BlockDef` entries + tests only, never touching parser/packager/manifest/schema.

**Tech Stack:** TypeScript (strict, ESM), Node ≥25, Vitest, `jszip`, headless `scratch-vm@5.0.300`, `js-yaml`. No new dependencies.

## Global Constraints

- Node ≥ 25; TypeScript `strict: true`; ESM; relative imports use `.js` extensions; no `any` outside the justified `scratch-vm`/JSON boundaries.
- **Fail loud, collect all:** every malformed construct is a `Diagnostic { file, line, message, severity }`; `compileProject` returns `{ ok:false, diagnostics }` and **no `.sb3`** if any `error`-severity diagnostic fires. Never throw; never emit a silently-broken project. An unresolved list reference is an `error` (mirroring unresolved-variable).
- **Frozen, do not change:** `compileProject(dir): Promise<CompileResult>`; the outer shape of `ParsedBlock { opcode; inputs; fields; substacks }` and `ParsedScript { blocks }`; `Diagnostic`; the existing input-encoding paths (literal / variable-primitive / nested-reporter / boolean / menu / two-substacks); the recursive-descent parser core (extended additively only).
- **Additive growth only:** `ShadowType` gains `7`; `FieldSpec` gains `{kind:"broadcast"}` and `{kind:"list"}`; the `menu` `InputSpec` gains an optional `broadcast?: boolean`; `InputValue` gains `{kind:"list";name}`; `TargetDecl` gains `lists?: ListDecl[]`; `parseScripts` gains an optional 4th param `knownLists`.
- **Scratch-3 encoding forms (exact):**
  - broadcast field (hat `BROADCAST_OPTION`, and the broadcast-menu shadow's field): `[name, id]`.
  - broadcast input (`event_broadcast`/`event_broadcastandwait` `BROADCAST_INPUT`): `[1, menuId]` + a shadow block `{ opcode:"event_broadcast_menu", fields:{ BROADCAST_OPTION:[name,id] }, shadow:true, topLevel:false, parent, next:null, inputs:{} }`.
  - broadcasts live ONLY on the Stage target: `broadcasts: { "<id>": "<name>" }`. Global across the project.
  - list field (`LIST`): `[name, id]`. list registry per target: `lists: { "<id>": ["<name>", [ …contents… ]] }` (a `[name, contents[]]` pair — note: NOT `[name, value]` like variables).
  - list as a reporter input: the `[13, name, id]` primitive, wrapped `[3, [13,name,id], [shadowType, ""]]` when obscuring a shadow.
  - list-index inputs use shadow type `7` (math_integer): `[1, [7, "1"]]`.
  - `extensions`: scan every emitted block opcode; a `pen_*` opcode adds `"pen"`, a `music_*` opcode adds `"music"`; deduped, `"pen"` before `"music"`.
- Variable/list id resolution: own ∪ global-Stage (lists mirror the variable resolver). Global lists attach to the Stage; sprite-local lists to the sprite.
- `project.json` envelope/meta unchanged: `meta = { semver:"3.0.0", vm:"0.2.0", agent:"scratch-mcp" }`; `targets[0]` is the Stage.

---

### Task 1: Schema + IR-type + manifest growth (additive — suite stays green)

Pure additive type growth + manifest `lists:` parsing. No new runtime behavior; the gate is "full compiler suite still green + `tsc` clean", plus a new manifest test. This unblocks the mechanism tasks.

**Files:**
- Modify: `src/compiler/blocks/types.ts` (ShadowType, FieldSpec, InputSpec menu)
- Modify: `src/compiler/types.ts` (InputValue, ListDecl, TargetDecl)
- Modify: `src/compiler/manifest.ts` (parse `lists:`)
- Test: `tests/compiler/manifest.test.ts` (extend)

**Interfaces:**
- Produces (consumed by all later tasks): `ShadowType` incl `7`; `FieldSpec` incl `{kind:"broadcast"}`/`{kind:"list"}`; `InputSpec` menu member with optional `broadcast?: boolean`; `InputValue` incl `{kind:"list";name:string}`; `ListDecl { name:string; value:(string|number)[] }`; `TargetDecl.lists?: ListDecl[]`.

- [ ] **Step 1: Grow the dictionary schema**

In `src/compiler/blocks/types.ts`, change `ShadowType` and the `menu` `InputSpec` member and `FieldSpec`:

```ts
/** Scratch input shadow opcode: 4 number, 6 positive integer, 7 integer, 8 angle, 9 color, 10 text. */
export type ShadowType = 4 | 6 | 7 | 8 | 9 | 10;

export type InputSpec =
  | { kind: "number" | "text"; shadowType: ShadowType }
  | { kind: "boolean" }
  | { kind: "menu"; menuOpcode: string; field: string; default: string; shadowType?: ShadowType; broadcast?: boolean }
  | { kind: "substack" };

export type FieldSpec =
  | { kind: "variable" }                                                      // resolves to [name, id]
  | { kind: "broadcast" }                                                     // resolves to [name, broadcastId]
  | { kind: "list" }                                                          // resolves to [name, listId]
  | { kind: "dropdown" };                                                     // option string stored directly on the block
```

(`BlockShape` and `BlockDef` are unchanged.)

- [ ] **Step 2: Grow the IR `InputValue` and the manifest model**

In `src/compiler/types.ts`, add the `list` member to `InputValue`, add `ListDecl`, and add `lists?` to `TargetDecl`:

```ts
export type InputValue =
  | { kind: "literal"; value: string }
  | { kind: "variable"; name: string }
  | { kind: "block"; block: ParsedBlock }
  | { kind: "menu"; value: string }
  | { kind: "list"; name: string };          // (mylist) used as a reporter input → [13,name,id]
```

```ts
export interface VariableDecl { name: string; value: string | number; }
export interface ListDecl { name: string; value: (string | number)[]; }
```

In `TargetDecl`, add the optional `lists` field (leave everything else unchanged):

```ts
export interface TargetDecl {
  name: string;
  isStage: boolean;
  sourceFile?: string;
  x?: number; y?: number; size?: number; direction?: number; visible?: boolean;
  variables: VariableDecl[];
  lists?: ListDecl[];            // scoped to this target (own ∪ global-Stage at resolution)
}
```

- [ ] **Step 3: Write the failing manifest test**

Append to `tests/compiler/manifest.test.ts`:

```ts
test("parses a lists: block into TargetDecl.lists (global on Stage, per-sprite on the sprite)", () => {
  const yaml = [
    "name: L",
    "sprites:",
    "  - name: Cat",
    "    source: cat.sprite.scratch",
    "variables:",
    "  global: { score: 0 }",
    "lists:",
    "  global: { inventory: [] }",
    "  Cat: { hand: [a, b] }",
  ].join("\n");
  const { project, diagnostics } = parseManifest(yaml, "project.yaml");
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const stage = project.targets.find((t) => t.isStage)!;
  const cat = project.targets.find((t) => t.name === "Cat")!;
  expect(stage.lists).toEqual([{ name: "inventory", value: [] }]);
  expect(cat.lists).toEqual([{ name: "hand", value: ["a", "b"] }]);
});
```

(If `parseManifest` is not already imported at the top of the test file, it is — the existing manifest tests use it.)

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/compiler/manifest.test.ts`
Expected: FAIL — `stage.lists` is `undefined` (manifest does not yet read `lists:`).

- [ ] **Step 5: Parse `lists:` in the manifest**

In `src/compiler/manifest.ts`, import `ListDecl`, add a `toListDecls` helper, and populate `lists` on the Stage and each sprite. Update the import line and add the helper:

```ts
import type { Diagnostic, ListDecl, Project, TargetDecl, VariableDecl } from "./types.js";

function toListDecls(obj: unknown): ListDecl[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? (value as (string | number)[]) : [],
  }));
}
```

Then inside `parseManifest`, after `const vars = doc?.variables ?? {};`, add:

```ts
  const lists = doc?.lists ?? {};
```

Add `lists: toListDecls(lists.global)` to the `stage` object and `lists: toListDecls(lists[s.name])` to each sprite object:

```ts
  const stage: TargetDecl = {
    name: "Stage", isStage: true,
    sourceFile: doc?.stage?.source,
    variables: toVarDecls(vars.global),
    lists: toListDecls(lists.global),
  };
  // ...
  const sprites: TargetDecl[] = spriteList.map((s: any) => ({
    name: s.name, isStage: false, sourceFile: s.source,
    x: s.x, y: s.y, size: s.size, direction: s.direction, visible: s.visible,
    variables: toVarDecls(vars[s.name]),
    lists: toListDecls(lists[s.name]),
  }));
```

- [ ] **Step 6: Run the test + typecheck + suite**

Run: `npx vitest run tests/compiler/manifest.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: clean.
Run: `npx vitest run tests/compiler/`
Expected: all green, output pristine apart from the known `vm warn No storage module present`. (The new schema members are declared but not yet emitted; no behavior change. `tests/editor/launch.test.ts` flakes only under full-suite parallel load — gate on the compiler suite.)

- [ ] **Step 7: Commit**

```bash
git add src/compiler/blocks/types.ts src/compiler/types.ts src/compiler/manifest.ts tests/compiler/manifest.test.ts
git commit -m "feat(compiler): grow schema (ShadowType+7, broadcast/list FieldSpec, list InputValue) + manifest lists:"
```

---

### Task 2: `extensions[]` auto-population (Pen/Music)

Scan emitted opcodes and populate `project.json`'s `extensions`. Add a tiny Pen + Music proving slice. VM-loads + structural gate.

**Files:**
- Modify: `src/compiler/packager.ts` (track emitted opcodes; build `extensions`)
- Modify: `src/compiler/blocks/slice.ts` (append `pen_clear`, `music_restForBeats`)
- Test: `tests/compiler/packager-extensions.test.ts` (new)

**Interfaces:**
- Consumes: `byOpcode`/`SLICE` (registry), `packageProject`.
- Produces: `project.json.extensions` is `["pen"]`/`["music"]`/`["pen","music"]`/`[]` based on used opcodes.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compiler/packager-extensions.test.ts
import JSZip from "jszip";
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript, ParsedBlock } from "../../src/compiler/types.js";
import { runHeadless } from "./vm-harness.js";

const B = (opcode: string, inputs: any = {}, fields: any = {}, substacks: any = {}): ParsedBlock =>
  ({ opcode, inputs, fields, substacks });
const project: Project = {
  name: "E",
  targets: [
    { name: "Stage", isStage: true, variables: [] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};
async function extensionsOf(scripts: ParsedScript[]): Promise<string[]> {
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", scripts]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  return pj.extensions;
}

test("a pen opcode populates extensions:['pen'] and the sb3 runs", async () => {
  const s: ParsedScript = { blocks: [B("event_whenflagclicked"), B("pen_clear")] };
  expect(await extensionsOf([s])).toEqual(["pen"]);
  const { sb3 } = await packageProject(project, new Map([["Cat", [s]]]));
  await runHeadless(sb3); // loads + runs without throwing
});

test("pen + music opcodes populate ['pen','music'] deduped and ordered", async () => {
  const s: ParsedScript = { blocks: [
    B("event_whenflagclicked"),
    B("pen_clear"),
    B("music_restForBeats", { BEATS: { kind: "literal", value: "1" } }),
    B("pen_clear"),
  ] };
  expect(await extensionsOf([s])).toEqual(["pen", "music"]);
});

test("no pen/music opcodes leaves extensions empty", async () => {
  const s: ParsedScript = { blocks: [B("event_whenflagclicked"), B("motion_movesteps", { STEPS: { kind: "literal", value: "10" } })] };
  expect(await extensionsOf([s])).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/compiler/packager-extensions.test.ts`
Expected: FAIL — `extensions` is always `[]` (hard-coded), and `pen_clear`/`music_restForBeats` are unknown opcodes (error diagnostics) until the slice entries exist.

- [ ] **Step 3: Add the proving-slice entries**

Append to the `SLICE` array in `src/compiler/blocks/slice.ts`:

```ts
  // ---- extensions proving slice (full Pen/Music palettes are Sub-project B) ----
  { signature: "erase all", opcode: "pen_clear", shape: "stack" },
  { signature: "rest for (BEATS) beats", opcode: "music_restForBeats", shape: "stack",
    inputs: { BEATS: { kind: "number", shadowType: 4 } } },
```

- [ ] **Step 4: Track emitted opcodes and build `extensions`**

In `src/compiler/packager.ts`, add a project-scope opcode set and an `extensions` builder.

After `const diagnostics: Diagnostic[] = [];` near the top of `packageProject`, add:

```ts
  const usedOpcodes = new Set<string>();
```

Record opcodes wherever a block entry is created. In `emitBlock`, immediately after `const id = nextId();`, add:

```ts
      usedOpcodes.add(b.opcode);
```

In `emitStack`, inside the `list.forEach((b, i) => {` body, immediately after `const id = nextId();`, add:

```ts
        usedOpcodes.add(b.opcode);
```

Then replace the final `projectJson` line so `extensions` is computed:

```ts
  const extensions: string[] = [];
  if ([...usedOpcodes].some((op) => op.startsWith("pen_"))) extensions.push("pen");
  if ([...usedOpcodes].some((op) => op.startsWith("music_"))) extensions.push("music");
  const projectJson = { targets: targetsJson, monitors: [], extensions, meta: { semver: "3.0.0", vm: "0.2.0", agent: "scratch-mcp" } };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/compiler/packager-extensions.test.ts`
Expected: PASS (3 tests).
Run: `npx vitest run tests/compiler/`
Expected: all green (no regression), output pristine apart from the known vm warn.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/packager.ts src/compiler/blocks/slice.ts tests/compiler/packager-extensions.test.ts
git commit -m "feat(compiler): extensions[] auto-population from pen_/music_ opcodes (+ proving slice)"
```

---

### Task 3: Broadcast machinery — DE-RISK GATE (round-trips in the VM)

A broadcast registry on the Stage + the broadcast field/menu encoding + the underscore-hole-name parser fix. Proven by a `broadcast`↔`when I receive` round-trip in the headless VM.

**Files:**
- Modify: `src/compiler/parser/index.ts` (widen the signature hole-name charset to allow `_`)
- Modify: `src/compiler/packager.ts` (broadcast registry; menu `broadcast` flag; broadcast field; Stage `broadcasts`)
- Modify: `src/compiler/blocks/slice.ts` (append `event_broadcast`, `event_broadcastandwait`, `event_whenbroadcastreceived`)
- Test: `tests/compiler/broadcasts.test.ts` (new — VM round-trip + structural)

**Interfaces:**
- Consumes: `compileProject` (for the e2e), `byOpcode`/`SLICE`, `runHeadless`.
- Produces: blocks whose `BROADCAST_OPTION` fields and `event_broadcast_menu` shadows encode `[name, id]`; the Stage target carries a `broadcasts: { id: name }` map; signature holes may contain `_`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compiler/broadcasts.test.ts
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

async function projectDir(yaml: string, scratch: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bcast-"));
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const YAML = ["name: B", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
  "variables:", "  global: { x: 0 }"].join("\n");

test("broadcast round-trips in the VM: a received message sets x to 1", async () => {
  const src = [
    "when green flag clicked",
    "broadcast [go v]",
    "when I receive [go v]",
    "set [x v] to (1)",
  ].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("x"))).toBe(1);
});

test("broadcasts are registered on the Stage and the hat + menu share the message id", async () => {
  const src = [
    "when green flag clicked", "broadcast [go v]",
    "when I receive [go v]", "set [x v] to (1)",
  ].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const stage = pj.targets.find((t: any) => t.isStage);
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  // Stage broadcasts map contains "go"
  const ids = Object.entries(stage.broadcasts as Record<string, string>);
  expect(ids.some(([, name]) => name === "go")).toBe(true);
  const goId = ids.find(([, name]) => name === "go")![0];
  // the when-I-receive hat field references [name, id]
  const hat = Object.values(cat.blocks).find((b: any) => b.opcode === "event_whenbroadcastreceived") as any;
  expect(hat.fields.BROADCAST_OPTION).toEqual(["go", goId]);
  // the broadcast menu shadow references the same id
  const menu = Object.values(cat.blocks).find((b: any) => b.opcode === "event_broadcast_menu") as any;
  expect(menu.fields.BROADCAST_OPTION).toEqual(["go", goId]);
  expect(menu.shadow).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/compiler/broadcasts.test.ts`
Expected: FAIL — the broadcast blocks are unknown (no slice entries), and the `BROADCAST_OPTION`/`BROADCAST_INPUT` signature holes (with `_`) don't tokenize, so even with entries the parser won't bind them.

- [ ] **Step 3: Allow `_` in signature hole names**

In `src/compiler/parser/index.ts`, in `sigTokens`, widen the four hole-name character classes from `[A-Z0-9]` to `[A-Z0-9_]`:

```ts
  // ( NAME )  [ NAME v ]  [ NAME ]  < NAME >  bare-word    (NAME may contain underscores: BROADCAST_OPTION etc.)
  const re = /\(([A-Z0-9_]*)\)|\[([A-Z0-9_]+) v\]|\[([A-Z0-9_]*)\]|<([A-Z0-9_]*)>|(\S+)/g;
```

(Only the four capture-group character classes change; the `(\S+)` bare-word alternative is unchanged.)

- [ ] **Step 4: Add the broadcast slice entries**

Append to `SLICE` in `src/compiler/blocks/slice.ts`:

```ts
  // ---- broadcasts (event) ----
  { signature: "broadcast [BROADCAST_INPUT v]", opcode: "event_broadcast", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "broadcast [BROADCAST_INPUT v] and wait", opcode: "event_broadcastandwait", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "when I receive [BROADCAST_OPTION v]", opcode: "event_whenbroadcastreceived", shape: "hat",
    fields: { BROADCAST_OPTION: { kind: "broadcast" } } },
```

- [ ] **Step 5: Implement the broadcast registry + encoding in the packager**

In `src/compiler/packager.ts`:

(a) Add the project-scope registry. After `const usedOpcodes = new Set<string>();` add:

```ts
  let bcastCounter = 0;
  const broadcastIds = new Map<string, string>();
  const resolveBroadcast = (name: string): string => {
    let id = broadcastIds.get(name);
    if (!id) { id = `bcast-${++bcastCounter}`; broadcastIds.set(name, id); }
    return id;
  };
```

(b) In `emitInput`, in the `menu` branch, encode a broadcast menu field as `[name, id]`. Replace the menu branch body:

```ts
      if (spec.kind === "menu") {
        const sel = value && value.kind === "menu" ? value.value : spec.default;
        const mid = nextId();
        const fieldVal = spec.broadcast ? [sel, resolveBroadcast(sel)] : [sel, null];
        blocks[mid] = { opcode: spec.menuOpcode, next: null, parent: parentId,
          inputs: {}, fields: { [spec.field]: fieldVal }, shadow: true, topLevel: false };
        return [1, mid];
      }
```

(c) In `emitFields`, handle the `broadcast` field kind. Replace the field loop body so it switches on the kind (keep variable + dropdown unchanged, add broadcast):

```ts
    const emitFields = (def: BlockDef, b: ParsedBlock, entry: any): void => {
      for (const [nm, fspec] of Object.entries(def.fields ?? {})) {
        if (fspec.kind === "variable") {
          const vname = b.fields[nm] ?? "";
          const vid = resolveVar(vname);
          if (!vid) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
            message: `unresolved variable "${vname}"` });
          entry.fields[nm] = [vname, vid ?? ""];
        } else if (fspec.kind === "broadcast") {
          const bname = b.fields[nm] ?? "";
          entry.fields[nm] = [bname, resolveBroadcast(bname)];
        } else { // dropdown (list handled in Task 4)
          entry.fields[nm] = [b.fields[nm] ?? "", null];
        }
      }
    };
```

(d) After the per-target loop closes (after the `for (const target of project.targets)` block, before building `projectJson`), write the accumulated broadcasts onto the Stage's JSON:

```ts
  const stageJson = targetsJson.find((t) => t.isStage);
  if (stageJson) {
    const bmap: Record<string, string> = {};
    for (const [name, id] of broadcastIds) bmap[id] = name;
    stageJson.broadcasts = bmap;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/compiler/broadcasts.test.ts`
Expected: PASS (2 tests). **HARD GATE:** the VM round-trip (`x == 1`) must pass — if it does not, STOP and report.
Run: `npx vitest run tests/compiler/`
Expected: all green (no regression), output pristine apart from the known vm warn.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/compiler/parser/index.ts src/compiler/packager.ts src/compiler/blocks/slice.ts tests/compiler/broadcasts.test.ts
git commit -m "feat(compiler): broadcasts (registry on Stage, [name,id] field+menu); underscore hole names; VM-proven"
```

---

### Task 4: List machinery — DE-RISK GATE (list ops round-trip in the VM)

List registry per target (mirroring variables) + the `LIST` field, the integer index input, the `[13,…]` list-reporter primitive, and the `knownLists` parser classification. Proven by `add`×2 + `item of` in the headless VM.

**Files:**
- Modify: `src/compiler/parser/index.ts` (`knownLists` in `ParseCtx`, `parseScripts`, `parseRound`)
- Modify: `src/compiler/index.ts` (build `knownLists` per target, pass to `parseScripts`)
- Modify: `src/compiler/packager.ts` (list id maps; `resolveList`; `list` field; list-primitive input; per-target `lists` map)
- Modify: `src/compiler/blocks/slice.ts` (append `data_addtolist`, `data_itemoflist`)
- Test: `tests/compiler/lists.test.ts` (new — VM round-trip + structural)

**Interfaces:**
- Consumes: `compileProject`, `runHeadless`, the schema from Task 1.
- Produces: `parseScripts(source, file, knownVars, knownLists?)`; blocks whose `LIST` fields encode `[name, id]`; `(mylist)` reporter inputs encode `[3,[13,name,id],[st,""]]`; per-target `lists: { id: [name, contents] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compiler/lists.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

async function projectDir(yaml: string, scratch: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lists-"));
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const YAML = [
  "name: L", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
  "variables:", "  global: { n: 0, s: 0 }",
  "lists:", "  global: { inventory: [] }",
].join("\n");

test("list ops round-trip in the VM: item 2 of inventory is 'b'", async () => {
  const src = [
    "when green flag clicked",
    "add [a] to [inventory v]",
    "add [b] to [inventory v]",
    "set [n v] to (item (2) of [inventory v])",
  ].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const state = await runHeadless(res.sb3!);
  expect(String(state.variable("n"))).toBe("b");
});

test("a list registers on its target and the LIST field encodes [name, id]", async () => {
  const src = ["when green flag clicked", "add [a] to [inventory v]"].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const stage = pj.targets.find((t: any) => t.isStage);
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const ids = Object.entries(stage.lists as Record<string, [string, unknown[]]>);
  expect(ids.some(([, pair]) => pair[0] === "inventory")).toBe(true);
  const listId = ids.find(([, pair]) => pair[0] === "inventory")![0];
  expect(stage.lists[listId]).toEqual(["inventory", []]);
  const add = Object.values(cat.blocks).find((b: any) => b.opcode === "data_addtolist") as any;
  expect(add.fields.LIST).toEqual(["inventory", listId]);
});

test("a list used as a reporter input encodes the [13, name, id] primitive", async () => {
  const src = ["when green flag clicked", "set [s v] to (inventory)"].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const set = Object.values(cat.blocks).find((b: any) => b.opcode === "data_setvariableto") as any;
  // VALUE = [3, [13, "inventory", <id>], [10, ""]]
  expect(set.inputs.VALUE[0]).toBe(3);
  expect(set.inputs.VALUE[1][0]).toBe(13);
  expect(set.inputs.VALUE[1][1]).toBe("inventory");
});

test("an unresolved list reference is a fail-loud error", async () => {
  const src = ["when green flag clicked", "add [a] to [ghost v]"].join("\n");
  const dir = await projectDir(YAML, src);
  const res = await compileProject(dir);
  expect(res.ok).toBe(false);
  expect(res.diagnostics.some((d) => d.severity === "error" && /ghost/.test(d.message))).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/compiler/lists.test.ts`
Expected: FAIL — list blocks unknown; `(inventory)` not classified as a list; no `lists` map.

- [ ] **Step 3: Thread `knownLists` through the parser**

In `src/compiler/parser/index.ts`:

(a) Extend `ParseCtx`:

```ts
export interface ParseCtx { file: string; knownVars: Set<string>; knownLists: Set<string>; diagnostics: Diagnostic[]; }
```

(b) In `parseRound`, classify a bare known-list name as a list reporter. In the all-words block, add the `knownLists` check after the `knownVars` check (before the single-word lenient return):

```ts
      if (isNumeric(w)) return { kind: "literal", value: w };
      if (ctx.knownVars.has(w)) return { kind: "variable", name: w };
      if (ctx.knownLists.has(w)) return { kind: "list", name: w };
      if (gs.length === 1) return { kind: "literal", value: w };
```

(c) Update the `parseScripts` signature (optional 4th param, default empty) and the `ctx` it builds:

```ts
export function parseScripts(source: string, file: string, knownVars: Set<string>, knownLists: Set<string> = new Set()): { scripts: ParsedScript[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ctx: ParseCtx = { file, knownVars, knownLists, diagnostics };
```

(The optional default keeps every existing `parseScripts(src, file, vars)` call site — including all current parser tests — compiling unchanged.)

- [ ] **Step 4: Wire `knownLists` in the orchestrator**

In `src/compiler/index.ts`, build the per-target list-name set (own ∪ global Stage) and pass it. After `const globalNames = ...`, add:

```ts
  const globalListNames = stage ? (stage.lists ?? []).map((l) => l.name) : [];
```

Replace the `parseScripts` call inside the loop:

```ts
    const knownVars = new Set<string>([...t.variables.map((v) => v.name), ...globalNames]);
    const knownLists = new Set<string>([...(t.lists ?? []).map((l) => l.name), ...globalListNames]);
    const { scripts, diagnostics: pd } = parseScripts(src, t.sourceFile, knownVars, knownLists);
```

- [ ] **Step 5: Add the list slice entries**

Append to `SLICE` in `src/compiler/blocks/slice.ts`:

```ts
  // ---- lists (data) — proving slice; full list palette is Sub-project B ----
  { signature: "add [ITEM] to [LIST v]", opcode: "data_addtolist", shape: "stack",
    inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "item (INDEX) of [LIST v]", opcode: "data_itemoflist", shape: "reporter",
    inputs: { INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
```

- [ ] **Step 6: Implement list ids, field, primitive, and the `lists` map in the packager**

In `src/compiler/packager.ts`:

(a) Build global list ids before the per-target loop. After the `stageVarIds` block (`for (const v of stage.variables) ...`), add:

```ts
  let listCounter = 0;
  const stageListIds = new Map<string, string>();
  for (const l of stage.lists ?? []) stageListIds.set(l.name, `list-${++listCounter}`);
```

(b) Inside the per-target loop, build own list ids + the resolver. After the `resolveVar` definition, add:

```ts
    const ownListIds = new Map<string, string>();
    if (!target.isStage) for (const l of target.lists ?? []) ownListIds.set(l.name, `list-${++listCounter}`);
    const resolveList = (name: string): string | undefined =>
      ownListIds.get(name) ?? stageListIds.get(name);
```

(c) In `emitInput`, handle a list used as a reporter input. In the number/text slot section, add the list case alongside the variable case (after the `value.kind === "variable"` block, before the `value.kind === "block"` line):

```ts
      if (value.kind === "list") {
        const id = resolveList(value.name);
        if (!id) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
          message: `unresolved list "${value.name}"` });
        return [3, [13, value.name, id ?? ""], [st, ""]];
      }
```

(d) In `emitFields`, handle the `list` field kind. Add a branch before the final `else` (dropdown):

```ts
        } else if (fspec.kind === "list") {
          const lname = b.fields[nm] ?? "";
          const lid = resolveList(lname);
          if (!lid) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
            message: `unresolved list "${lname}"` });
          entry.fields[nm] = [lname, lid ?? ""];
        } else { // dropdown
```

(e) Emit the per-target `lists` map. Replace the `lists: {}` in the `base` object: first build `listsJson` next to `variablesJson`:

```ts
    const listsJson: Record<string, [string, (string | number)[]]> = {};
    const lmap = target.isStage ? stageListIds : ownListIds;
    for (const l of target.lists ?? []) listsJson[lmap.get(l.name)!] = [l.name, l.value];
```

and change `lists: {}` to `lists: listsJson` in the `base` object.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/compiler/lists.test.ts`
Expected: PASS (4 tests). **HARD GATE:** the VM round-trip (`n == "b"`) must pass — if it does not, STOP and report.
Run: `npx vitest run tests/compiler/`
Expected: all green (no regression), output pristine apart from the known vm warn.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/compiler/parser/index.ts src/compiler/index.ts src/compiler/packager.ts src/compiler/blocks/slice.ts tests/compiler/lists.test.ts
git commit -m "feat(compiler): lists (manifest-declared, [name,id] field, [13,...] primitive, knownLists); VM-proven"
```

---

### Task 5: Combined capstone e2e + re-freeze

One source fixture exercising all three mechanisms together (a pen extension + a broadcast round-trip + a list op) compiling text → `.sb3` → headless VM, confirming the mechanisms compose. Final full-suite gate; the extended contract is re-frozen for Sub-project B.

**Files:**
- Create: `tests/fixtures/infra-src/project.yaml`
- Create: `tests/fixtures/infra-src/cat.sprite.scratch`
- Test: `tests/compiler/infra-e2e.test.ts`

**Interfaces:**
- Consumes: `compileProject`, `runHeadless`. No source changes — pure integration proof.

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/infra-src/project.yaml` (content starts at `name:` — no `#` annotation lines):

```yaml
name: Infra
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
variables:
  global: { x: 0, n: 0 }
lists:
  global: { inventory: [] }
```

Create `tests/fixtures/infra-src/cat.sprite.scratch` (content starts at `when green flag clicked` — no `#` annotation line):

```
when green flag clicked
erase all
add [a] to [inventory v]
add [b] to [inventory v]
broadcast [go v]
when I receive [go v]
set [n v] to (item (2) of [inventory v])
set [x v] to (1)
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/compiler/infra-e2e.test.ts
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

const dir = fileURLToPath(new URL("../fixtures/infra-src", import.meta.url));

test("infra fixture compiles + runs: extensions=['pen'], broadcast sets x=1, list gives n='b'", async () => {
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  expect(pj.extensions).toEqual(["pen"]);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("x"))).toBe(1);
  expect(String(state.variable("n"))).toBe("b");
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run tests/compiler/infra-e2e.test.ts`
Expected: PASS (all three mechanisms compose: `extensions:["pen"]`, broadcast round-trip → `x==1`, list op → `n=="b"`). If it fails, STOP and report which mechanism broke under composition.

- [ ] **Step 4: Full suite + typecheck (re-freeze gate)**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `npx vitest run`
Expected: all green. NOTE: if `tests/editor/launch.test.ts` (and only it) fails under the full parallel run, re-run it alone (`npx vitest run tests/editor/launch.test.ts`) to confirm it passes — it is a known parallel-load flake, not a regression.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/infra-src tests/compiler/infra-e2e.test.ts
git commit -m "test(compiler): infra-extensions capstone e2e (extensions+broadcast+list compose in the VM)"
```

---

## What this plan delivers

A compiler whose shared machinery supports the **entire remaining core grammar** — Pen/Music `extensions[]`, broadcasts, and lists — each **proven to run in a headless `scratch-vm`**, with the extended `FieldSpec`/`InputValue`/`ShadowType`/manifest/parser/packager contract **frozen for the Sub-project B per-category fan-out to extend by adding `BlockDef` entries (and per-block tests) only**.

## Follow-on (not in this document)

- **Sub-project B — per-category palette fan-out** (its own spec → plan): one ultracode agent per category (Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, Lists, Pen, Music) adding the full block set + per-block semantic tests + a completeness critic, against the contract this plan freezes.
- **Custom blocks / procedures**, **asset resolver** — still deferred to their own plans.
- **Fan-out hardening minors** carried from the foundation (exclude the `control_if_else` sentinel from `matchStatement`; tighten two broad test regexes; add `]` to the lexer stop-set) — fold into Sub-project B.

## Self-Review

- **Spec coverage:** §1 extensions[] → Task 2; §2 broadcasts → Task 3; §3 lists → Task 4; §4 proving slice/dual-standard/re-freeze → Tasks 2–5; schema/manifest/InputValue growth (§2 of spec) → Task 1; deferrals (§7) recorded in Follow-on. All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; every test shows assertions and the exact run command + expected result.
- **Type consistency:** `resolveBroadcast`/`resolveList` names are used identically across packager steps; `knownLists` is declared in `ParseCtx`, defaulted in `parseScripts`, and supplied by the orchestrator; `ListDecl`/`TargetDecl.lists` are produced by the manifest (Task 1) and consumed by the packager (Task 4) and orchestrator (Task 4); `{kind:"list"}` `InputValue` is produced by `parseRound` (Task 4) and consumed by `emitInput` (Task 4); the `broadcast?` menu flag is produced by the slice (Task 3) and read by `emitInput` (Task 3); `ShadowType` `7` is produced by the slice (Task 4 `INDEX`) and accepted by the schema (Task 1).
- **Encoding fidelity safety net:** Tasks 3 and 4 are headless-VM HARD GATES on real runtime state (broadcast `x==1`, list `n=="b"`); Task 5 proves the three compose; any byte-shape error in the reference code is caught by the VM run or the structural asserts.
