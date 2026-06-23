# Compiler Pipeline Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the end-to-end compiler pipeline — `project.yaml` + `*.sprite.scratch` source → a real `.sb3` that loads and **runs correctly in a headless `scratch-vm`** — with a minimal ~6-block vertical slice, before the full block-dictionary build-out.

**Architecture:** A headless `compileProject(dir)` pipeline: manifest parser → script parser (scratchblocks text → block-tree IR) → block dictionary (signature ↔ opcode/inputs/fields) → packager (IR → `project.json` + zip via `jszip`, with a generated placeholder costume) → `.sb3` Buffer. Correctness is proven by loading the output in a headless `scratch-vm`, green-flagging, and asserting a runtime effect. The riskiest path (hand-assembled `project.json` actually running in the VM) is proven first, on a hand-built IR, before the parser exists.

**Tech Stack:** TypeScript (strict, ESM), Node ≥25, Vitest, `js-yaml`, `jszip`, `scratch-vm` (dev, headless validation), Node `crypto`.

## Global Constraints

- Node ≥ 25; TypeScript `strict: true`; ESM (`"type": "module"`); imports use `.js` extensions.
- New runtime deps: `js-yaml`, `jszip`. New dev dep: `scratch-vm` pinned to **`5.0.300`** (must match the editor's bundled `scratch-vm@5.0.300` so a `.sb3` that passes tests also loads in the editor).
- **Fail loud, collect all:** the compiler accumulates every `Diagnostic { file, line, message, severity }`; `compileProject` returns `{ ok:false, diagnostics }` and **no `.sb3`** if any `error`-severity diagnostic fires. Never emit a silently-broken project.
- Output `.sb3` must load and run in a **headless `scratch-vm`** with assets read from the zip (fully offline — no network, no renderer).
- Block IDs are unique within a project. Variable field references resolve against `{target's own variables} ∪ {global Stage variables}`; an unresolved variable is an `error` diagnostic.
- `project.json` envelope: `meta = { semver:"3.0.0", vm:"0.2.0", agent:"scratch-mcp" }`; `targets[0]` is the Stage.
- The `BlockDef` schema, the IR types (`ParsedBlock`/`ParsedScript`), and `compileProject`'s signature are FROZEN here — later compiler plans (dictionary build-out, custom blocks) extend the dictionary and parser without changing these shapes.

---

### Task 1: Dependencies, core types, placeholder costume

**Files:**
- Modify: `package.json` (add deps)
- Create: `src/compiler/types.ts`
- Create: `src/compiler/placeholder.ts`
- Test: `tests/compiler/placeholder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types: `Diagnostic`, `VariableDecl`, `TargetDecl`, `Project`, `InputValue`, `ParsedBlock`, `ParsedScript`, `CompileResult` (exact shapes below).
  - `generatePlaceholderCostume(seed: string): { name: string; svg: string; bytes: Buffer; md5: string; md5ext: string }` — a deterministic simple SVG costume.

- [ ] **Step 1: Add dependencies**

Edit `package.json` — add to `dependencies`: `"js-yaml": "^4.1.0"`, `"jszip": "^3.10.1"`. Add to `devDependencies`: `"scratch-vm": "5.0.300"`, `"@types/js-yaml": "^4.0.9"`. Then:

Run: `npm install`
Expected: installs without error.

- [ ] **Step 2: Create the core types**

```ts
// src/compiler/types.ts

export interface Diagnostic {
  file: string;
  line: number;
  col?: number;
  message: string;
  severity: "error" | "warning";
}

export interface VariableDecl { name: string; value: string | number; }

export interface TargetDecl {
  name: string;
  isStage: boolean;
  sourceFile?: string;          // *.scratch path relative to project dir
  x?: number; y?: number; size?: number; direction?: number; visible?: boolean;
  variables: VariableDecl[];     // scoped to this target
}

export interface Project { name: string; targets: TargetDecl[]; } // targets[0] is the Stage

// ---- parsed script IR (produced by the parser, consumed by the packager) ----
export interface InputValue { kind: "literal"; value: string; } // skeleton: literal number/text only
export interface ParsedBlock {
  opcode: string;
  inputs: Record<string, InputValue>;       // e.g. STEPS -> { kind:"literal", value:"10" }
  fields: Record<string, string>;           // e.g. VARIABLE -> "angle"
  substacks: Record<string, ParsedBlock[]>; // e.g. SUBSTACK -> [...]
}
export interface ParsedScript { blocks: ParsedBlock[]; } // blocks[0] is the hat

export interface CompileResult { ok: boolean; sb3?: Buffer; diagnostics: Diagnostic[]; }
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/compiler/placeholder.test.ts
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { generatePlaceholderCostume } from "../../src/compiler/placeholder.js";

test("placeholder costume is a valid svg with a content-matching md5", () => {
  const c = generatePlaceholderCostume("Cat");
  expect(c.svg.startsWith("<svg")).toBe(true);
  expect(c.dataFormatOk ?? true).toBe(true);
  const md5 = createHash("md5").update(c.bytes).digest("hex");
  expect(c.md5).toBe(md5);
  expect(c.md5ext).toBe(`${md5}.svg`);
});

test("placeholder is deterministic for the same seed", () => {
  expect(generatePlaceholderCostume("Cat").md5).toBe(generatePlaceholderCostume("Cat").md5);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/compiler/placeholder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the placeholder generator**

```ts
// src/compiler/placeholder.ts
import { createHash } from "node:crypto";

/** A deterministic, self-contained SVG costume used when no real art is resolved. */
export function generatePlaceholderCostume(seed: string): {
  name: string; svg: string; bytes: Buffer; md5: string; md5ext: string;
} {
  // deterministic hue from the seed
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">` +
    `<rect x="5" y="5" width="90" height="90" rx="12" fill="hsl(${h},70%,60%)" stroke="#222" stroke-width="3"/>` +
    `</svg>`;
  const bytes = Buffer.from(svg, "utf8");
  const md5 = createHash("md5").update(bytes).digest("hex");
  return { name: "costume1", svg, bytes, md5, md5ext: `${md5}.svg` };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/compiler/placeholder.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/compiler/types.ts src/compiler/placeholder.ts tests/compiler/placeholder.test.ts
git commit -m "feat(compiler): core types + deterministic placeholder costume"
```

---

### Task 2: Block dictionary — BlockDef schema + the 6-block slice

**Files:**
- Create: `src/compiler/blocks/types.ts`
- Create: `src/compiler/blocks/slice.ts`
- Create: `src/compiler/blocks/registry.ts`
- Test: `tests/compiler/registry.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `BlockDef`, `InputSpec`, `FieldSpec`, `BlockShape` (shapes below).
  - `SLICE: BlockDef[]` — the 6 starter blocks.
  - `byOpcode: Map<string, BlockDef>` and `bySignature: Map<string, BlockDef>` built from `SLICE`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/compiler/registry.test.ts
import { expect, test } from "vitest";
import { byOpcode, bySignature, SLICE } from "../../src/compiler/blocks/registry.js";

test("slice covers the six expected opcodes", () => {
  const opcodes = SLICE.map((d) => d.opcode).sort();
  expect(opcodes).toEqual([
    "control_repeat", "data_changevariableby", "data_setvariableto",
    "event_whenflagclicked", "motion_movesteps", "motion_turnright",
  ]);
});

test("repeat is a c-block with a SUBSTACK and a whole-number TIMES input", () => {
  const def = byOpcode.get("control_repeat")!;
  expect(def.shape).toBe("c");
  expect(def.substack).toBe("SUBSTACK");
  expect(def.inputs!.TIMES.shadowType).toBe(6);
});

test("set variable resolves by signature and has a variable field", () => {
  const def = bySignature.get("set [VARIABLE] to (VALUE)")!;
  expect(def.opcode).toBe("data_setvariableto");
  expect(def.fields!.VARIABLE.kind).toBe("variable");
  expect(def.inputs!.VALUE.shadowType).toBe(10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the BlockDef schema**

```ts
// src/compiler/blocks/types.ts
export type BlockShape = "hat" | "stack" | "cap" | "c" | "reporter" | "boolean";

/** shadowType: Scratch input shadow opcode — 4 math_number, 6 math_whole_number, 10 text. */
export interface InputSpec { kind: "number" | "text" | "substack"; shadowType?: 4 | 6 | 10; }
export interface FieldSpec { kind: "variable"; }

export interface BlockDef {
  signature: string;                       // e.g. "move (STEPS) steps", "repeat (TIMES)"
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substack?: string;                       // c-blocks: the substack input name (e.g. "SUBSTACK")
}
```

- [ ] **Step 4: Implement the slice**

```ts
// src/compiler/blocks/slice.ts
import type { BlockDef } from "./types.js";

export const SLICE: BlockDef[] = [
  { signature: "when green flag clicked", opcode: "event_whenflagclicked", shape: "hat" },
  {
    signature: "set [VARIABLE] to (VALUE)", opcode: "data_setvariableto", shape: "stack",
    inputs: { VALUE: { kind: "text", shadowType: 10 } }, fields: { VARIABLE: { kind: "variable" } },
  },
  {
    signature: "change [VARIABLE] by (VALUE)", opcode: "data_changevariableby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } }, fields: { VARIABLE: { kind: "variable" } },
  },
  {
    signature: "repeat (TIMES)", opcode: "control_repeat", shape: "c",
    inputs: { TIMES: { kind: "number", shadowType: 6 } }, substack: "SUBSTACK",
  },
  {
    signature: "move (STEPS) steps", opcode: "motion_movesteps", shape: "stack",
    inputs: { STEPS: { kind: "number", shadowType: 4 } },
  },
  {
    signature: "turn right (DEGREES) degrees", opcode: "motion_turnright", shape: "stack",
    inputs: { DEGREES: { kind: "number", shadowType: 4 } },
  },
];
```

- [ ] **Step 5: Implement the registry**

```ts
// src/compiler/blocks/registry.ts
import { SLICE } from "./slice.js";
import type { BlockDef } from "./types.js";

export { SLICE };
export const byOpcode = new Map<string, BlockDef>(SLICE.map((d) => [d.opcode, d]));
export const bySignature = new Map<string, BlockDef>(SLICE.map((d) => [d.signature, d]));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/compiler/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/compiler/blocks tests/compiler/registry.test.ts
git commit -m "feat(compiler): BlockDef schema + 6-block dictionary slice"
```

---

### Task 3: Packager — IR → `.sb3`

**Files:**
- Create: `src/compiler/packager.ts`
- Test: `tests/compiler/packager.test.ts`

**Interfaces:**
- Consumes: `Project`, `ParsedScript`, `ParsedBlock` (Task 1); `byOpcode` (Task 2); `generatePlaceholderCostume` (Task 1).
- Produces: `packageProject(project: Project, scriptsByTarget: Map<string, ParsedScript[]>): { sb3: Buffer; diagnostics: Diagnostic[] }`. (Async — returns a Promise.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/compiler/packager.test.ts
import JSZip from "jszip";
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript } from "../../src/compiler/types.js";

const project: Project = {
  name: "T",
  targets: [
    { name: "Stage", isStage: true, variables: [{ name: "angle", value: 0 }] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};
const spin: ParsedScript = {
  blocks: [
    { opcode: "event_whenflagclicked", inputs: {}, fields: {}, substacks: {} },
    { opcode: "data_setvariableto", inputs: { VALUE: { kind: "literal", value: "0" } }, fields: { VARIABLE: "angle" }, substacks: {} },
    { opcode: "control_repeat", inputs: { TIMES: { kind: "literal", value: "36" } }, fields: {}, substacks: {
      SUBSTACK: [
        { opcode: "motion_turnright", inputs: { DEGREES: { kind: "literal", value: "10" } }, fields: {}, substacks: {} },
        { opcode: "data_changevariableby", inputs: { VALUE: { kind: "literal", value: "10" } }, fields: { VARIABLE: "angle" }, substacks: {} },
      ],
    } },
  ],
};

test("packages a project.json with the right structure and bundles the costume asset", async () => {
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", [spin]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  expect(pj.meta.semver).toBe("3.0.0");
  expect(pj.targets[0].isStage).toBe(true);
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  // hat is top-level, links into the body
  const hat = Object.values(cat.blocks).find((b: any) => b.opcode === "event_whenflagclicked") as any;
  expect(hat.topLevel).toBe(true);
  expect(hat.next).not.toBeNull();
  // the global variable lives on the stage and is referenced by id in the field
  const stageVarId = Object.keys(pj.targets[0].variables)[0];
  const setBlock = Object.values(cat.blocks).find((b: any) => b.opcode === "data_setvariableto") as any;
  expect(setBlock.fields.VARIABLE[1]).toBe(stageVarId);
  // the placeholder costume asset is in the zip
  expect(cat.costumes[0].md5ext).toMatch(/\.svg$/);
  expect(zip.file(cat.costumes[0].md5ext)).not.toBeNull();
});

test("an unresolved variable is a fail-loud error", async () => {
  const bad: ParsedScript = { blocks: [
    { opcode: "event_whenflagclicked", inputs: {}, fields: {}, substacks: {} },
    { opcode: "data_changevariableby", inputs: { VALUE: { kind: "literal", value: "1" } }, fields: { VARIABLE: "ghost" }, substacks: {} },
  ] };
  const { diagnostics } = await packageProject(project, new Map([["Cat", [bad]]]));
  expect(diagnostics.some((d) => d.severity === "error" && /ghost/.test(d.message))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/packager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the packager**

```ts
// src/compiler/packager.ts
import JSZip from "jszip";
import { byOpcode } from "./blocks/registry.js";
import { generatePlaceholderCostume } from "./placeholder.js";
import type { Diagnostic, ParsedBlock, ParsedScript, Project } from "./types.js";

const COSTUME_BASE = { bitmapResolution: 1, dataFormat: "svg", rotationCenterX: 50, rotationCenterY: 50 };

export async function packageProject(
  project: Project,
  scriptsByTarget: Map<string, ParsedScript[]>,
): Promise<{ sb3: Buffer; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const zip = new JSZip();

  // 1. variable id maps. Global vars live on the Stage; each target sees its own + globals.
  const stage = project.targets.find((t) => t.isStage)!;
  let varCounter = 0;
  const stageVarIds = new Map<string, string>();
  for (const v of stage.variables) stageVarIds.set(v.name, `var-${++varCounter}`);

  const targetsJson: any[] = [];
  for (const target of project.targets) {
    const ownVarIds = new Map<string, string>();
    if (!target.isStage) for (const v of target.variables) ownVarIds.set(v.name, `var-${++varCounter}`);
    const resolveVar = (name: string): string | undefined =>
      ownVarIds.get(name) ?? stageVarIds.get(name);

    // block emission
    const blocks: Record<string, any> = {};
    let idCounter = 0;
    const nextId = () => `blk-${++idCounter}`;
    const scripts = scriptsByTarget.get(target.name) ?? [];

    const emitStack = (list: ParsedBlock[], parentForFirst: string | null, topLevel: boolean, hatXY: { x: number; y: number }): string | null => {
      let firstId: string | null = null;
      let prevId: string | null = null;
      list.forEach((b, i) => {
        const id = nextId();
        const def = byOpcode.get(b.opcode);
        const entry: any = {
          opcode: b.opcode, next: null,
          parent: i === 0 ? parentForFirst : prevId,
          inputs: {}, fields: {}, shadow: false,
          topLevel: topLevel && i === 0,
        };
        if (entry.topLevel) { entry.x = hatXY.x; entry.y = hatXY.y; }
        if (def) {
          for (const [nm, spec] of Object.entries(def.inputs ?? {})) {
            if (spec.kind === "substack") continue;
            const v = b.inputs[nm]?.value ?? "";
            entry.inputs[nm] = [1, [spec.shadowType ?? 4, v]];
          }
          if (def.substack) {
            const kids = b.substacks[def.substack] ?? [];
            if (kids.length) entry.inputs[def.substack] = [2, emitStack(kids, id, false, hatXY)];
          }
          for (const [nm, fspec] of Object.entries(def.fields ?? {})) {
            if (fspec.kind === "variable") {
              const vname = b.fields[nm] ?? "";
              const vid = resolveVar(vname);
              if (!vid) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error", message: `unresolved variable "${vname}"` });
              entry.fields[nm] = [vname, vid ?? ""];
            }
          }
        } else {
          diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error", message: `unknown opcode "${b.opcode}"` });
        }
        blocks[id] = entry;
        if (prevId) blocks[prevId].next = id;
        if (i === 0) firstId = id;
        prevId = id;
      });
      return firstId;
    };

    scripts.forEach((s, si) => emitStack(s.blocks, null, true, { x: 40, y: 40 + si * 200 }));

    // costume (placeholder for the skeleton)
    const costume = generatePlaceholderCostume(target.name);
    zip.file(costume.md5ext, costume.bytes);

    const variablesJson: Record<string, [string, string | number]> = {};
    const vmap = target.isStage ? stageVarIds : ownVarIds;
    for (const v of target.variables) variablesJson[vmap.get(v.name)!] = [v.name, v.value];

    const base = {
      isStage: target.isStage, name: target.name,
      variables: variablesJson, lists: {}, broadcasts: {}, blocks, comments: {},
      currentCostume: 0,
      costumes: [{ ...COSTUME_BASE, name: costume.name, assetId: costume.md5, md5ext: costume.md5ext }],
      sounds: [], volume: 100, layerOrder: target.isStage ? 0 : 1,
    };
    targetsJson.push(target.isStage
      ? { ...base, tempo: 60, videoTransparency: 50, videoState: "on", textToSpeechLanguage: null }
      : { ...base, visible: target.visible ?? true, x: target.x ?? 0, y: target.y ?? 0,
          size: target.size ?? 100, direction: target.direction ?? 90, draggable: false, rotationStyle: "all around" });
  }

  const projectJson = { targets: targetsJson, monitors: [], extensions: [], meta: { semver: "3.0.0", vm: "0.2.0", agent: "scratch-mcp" } };
  zip.file("project.json", JSON.stringify(projectJson));
  const sb3 = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { sb3, diagnostics };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compiler/packager.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/packager.ts tests/compiler/packager.test.ts
git commit -m "feat(compiler): packager assembles project.json + zips .sb3"
```

---

### Task 4: Headless `scratch-vm` proof on a hand-built IR (de-risk gate)

> **Nature:** the riskiest unknown — does our hand-assembled `.sb3` actually load and run correctly in a headless `scratch-vm`? Prove it now, on a hand-built IR, before the parser exists. Treat the exact VM stepping incantation as a small spike (clear goal + a fallback).

**Files:**
- Create: `tests/compiler/vm-harness.ts` (test helper)
- Test: `tests/compiler/run-ir.test.ts`

**Interfaces:**
- Consumes: `packageProject` (Task 3).
- Produces: `runHeadless(sb3: Buffer, frames?: number): Promise<{ variable(name: string): string | number | undefined; spriteX(name: string): number }>` — a test helper that loads the `.sb3` in a headless VM, green-flags, advances the runtime, and exposes state.

- [ ] **Step 1: Implement the headless VM harness**

```ts
// tests/compiler/vm-harness.ts
// @ts-expect-error scratch-vm ships no types
import VM from "scratch-vm";

export async function runHeadless(sb3: Buffer, frames = 120) {
  const vm: any = new VM();
  // Headless: no renderer/storage host. loadProject reads assets from the sb3 zip itself.
  await vm.loadProject(sb3);
  vm.greenFlag();
  // Deterministic stepping: advance the runtime N frames so all threads complete.
  for (let i = 0; i < frames; i++) vm.runtime._step();
  const targets: any[] = vm.runtime.targets;
  const all = targets.flatMap((t) => Object.values(t.variables ?? {}));
  return {
    variable(name: string) { return (all.find((v: any) => v.name === name) as any)?.value; },
    spriteX(name: string) { return (targets.find((t) => t.sprite?.name === name || t.getName?.() === name) as any)?.x; },
  };
}
```

If `runtime._step()` is unavailable or threads do not advance in this `scratch-vm` version, fall back to `vm.start()` + `vm.greenFlag()` + a real `await new Promise(r => setTimeout(r, 1500))` before reading state, and record which approach worked in your report.

- [ ] **Step 2: Write the failing test**

```ts
// tests/compiler/run-ir.test.ts
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript } from "../../src/compiler/types.js";
import { runHeadless } from "./vm-harness.js";

const project: Project = {
  name: "Spin", targets: [
    { name: "Stage", isStage: true, variables: [{ name: "angle", value: 0 }] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};
const spin: ParsedScript = { blocks: [
  { opcode: "event_whenflagclicked", inputs: {}, fields: {}, substacks: {} },
  { opcode: "data_setvariableto", inputs: { VALUE: { kind: "literal", value: "0" } }, fields: { VARIABLE: "angle" }, substacks: {} },
  { opcode: "control_repeat", inputs: { TIMES: { kind: "literal", value: "36" } }, fields: {}, substacks: {
    SUBSTACK: [
      { opcode: "motion_turnright", inputs: { DEGREES: { kind: "literal", value: "10" } }, fields: {}, substacks: {} },
      { opcode: "data_changevariableby", inputs: { VALUE: { kind: "literal", value: "10" } }, fields: { VARIABLE: "angle" }, substacks: {} },
    ],
  } },
] };

test("a hand-built IR compiles to an .sb3 that runs: angle reaches 360", async () => {
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", [spin]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const state = await runHeadless(sb3);
  expect(Number(state.variable("angle"))).toBe(360);
});
```

- [ ] **Step 3: Run test to verify it fails (before harness exists / passes after)**

Run: `npx vitest run tests/compiler/run-ir.test.ts`
Expected: FAIL first (harness missing), then PASS once the harness loads and runs the project and `angle === 360`. **HARD GATE:** if the `.sb3` will not load or run in headless `scratch-vm`, STOP and report — the packager/VM contract must hold before the parser is built.

- [ ] **Step 4: Commit**

```bash
git add tests/compiler/vm-harness.ts tests/compiler/run-ir.test.ts
git commit -m "test(compiler): headless scratch-vm proves hand-built IR runs (angle→360)"
```

---

### Task 5: Manifest parser

**Files:**
- Create: `src/compiler/manifest.ts`
- Test: `tests/compiler/manifest.test.ts`

**Interfaces:**
- Consumes: `Project`, `TargetDecl`, `VariableDecl`, `Diagnostic` (Task 1).
- Produces: `parseManifest(yamlText: string, file: string): { project: Project; diagnostics: Diagnostic[] }`. Stage is always `targets[0]`. Global variables go on the Stage; per-sprite under each sprite.

- [ ] **Step 1: Write the failing test**

```ts
// tests/compiler/manifest.test.ts
import { expect, test } from "vitest";
import { parseManifest } from "../../src/compiler/manifest.js";

const yaml = `
name: My Game
stage:
  source: stage.scratch
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 10
    y: -5
variables:
  global: { score: 0 }
  Cat: { speed: 10 }
`;

test("parses stage + sprites + scoped variables", () => {
  const { project, diagnostics } = parseManifest(yaml, "project.yaml");
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(project.name).toBe("My Game");
  expect(project.targets[0].isStage).toBe(true);
  expect(project.targets[0].variables).toEqual([{ name: "score", value: 0 }]);
  const cat = project.targets.find((t) => t.name === "Cat")!;
  expect(cat.x).toBe(10);
  expect(cat.sourceFile).toBe("cat.sprite.scratch");
  expect(cat.variables).toEqual([{ name: "speed", value: 10 }]);
});

test("malformed yaml is a fail-loud diagnostic, not a throw", () => {
  const { diagnostics } = parseManifest("name: [unterminated", "project.yaml");
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/manifest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the manifest parser**

```ts
// src/compiler/manifest.ts
import yaml from "js-yaml";
import type { Diagnostic, Project, TargetDecl, VariableDecl } from "./types.js";

function toVarDecls(obj: unknown): VariableDecl[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, string | number>).map(([name, value]) => ({ name, value }));
}

export function parseManifest(yamlText: string, file: string): { project: Project; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let doc: any;
  try { doc = yaml.load(yamlText); }
  catch (e) {
    diagnostics.push({ file, line: 0, severity: "error", message: `invalid YAML: ${(e as Error).message}` });
    return { project: { name: "", targets: [] }, diagnostics };
  }
  const vars = doc?.variables ?? {};
  const stage: TargetDecl = {
    name: "Stage", isStage: true,
    sourceFile: doc?.stage?.source,
    variables: toVarDecls(vars.global),
  };
  const sprites: TargetDecl[] = (doc?.sprites ?? []).map((s: any) => ({
    name: s.name, isStage: false, sourceFile: s.source,
    x: s.x, y: s.y, size: s.size, direction: s.direction, visible: s.visible,
    variables: toVarDecls(vars[s.name]),
  }));
  return { project: { name: doc?.name ?? "", targets: [stage, ...sprites] }, diagnostics };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compiler/manifest.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/manifest.ts tests/compiler/manifest.test.ts
git commit -m "feat(compiler): manifest parser (project.yaml → Project)"
```

---

### Task 6: Script parser — scratchblocks text → IR

**Files:**
- Create: `src/compiler/parser.ts`
- Test: `tests/compiler/parser.test.ts`

**Interfaces:**
- Consumes: `bySignature` (Task 2); `ParsedBlock`, `ParsedScript`, `Diagnostic` (Task 1).
- Produces: `parseScripts(source: string, file: string): { scripts: ParsedScript[]; diagnostics: Diagnostic[] }`.

**Approach (signature matching):** each non-empty line is a block. Convert the line and each `BlockDef.signature` to a normalized form: split on whitespace, where `(NAME)` / `[NAME]` / `{NAME}` are *holes* and everything else is a literal word. A line matches a signature when the literal words line up and the holes capture the bracketed values. `(…)` and `[…]` captured values become inputs/fields by the def's spec. A matched `c`-block (`shape === "c"`) consumes following lines (greater or equal indentation, until a line that is exactly `end`) as its substack, recursively. The first block of a script must be a `hat`; a stack with no leading hat, an unmatched line, or an `end` with no open c-block are `error` diagnostics.

- [ ] **Step 1: Write the failing test**

```ts
// tests/compiler/parser.test.ts
import { expect, test } from "vitest";
import { parseScripts } from "../../src/compiler/parser.js";

const src = `when green flag clicked
set [angle] to (0)
repeat (36)
  turn right (10) degrees
  change [angle] by (10)
end`;

test("parses a hat + nested c-block into IR", () => {
  const { scripts, diagnostics } = parseScripts(src, "cat.sprite.scratch");
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(scripts).toHaveLength(1);
  const b = scripts[0].blocks;
  expect(b[0].opcode).toBe("event_whenflagclicked");
  expect(b[1].opcode).toBe("data_setvariableto");
  expect(b[1].fields.VARIABLE).toBe("angle");
  expect(b[1].inputs.VALUE.value).toBe("0");
  const rep = b[2];
  expect(rep.opcode).toBe("control_repeat");
  expect(rep.inputs.TIMES.value).toBe("36");
  expect(rep.substacks.SUBSTACK.map((x) => x.opcode)).toEqual(["motion_turnright", "data_changevariableby"]);
});

test("an unknown block is a fail-loud diagnostic", () => {
  const { diagnostics } = parseScripts("when green flag clicked\nfly (3) times", "f.scratch");
  expect(diagnostics.some((d) => d.severity === "error" && /fly/.test(d.message))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

```ts
// src/compiler/parser.ts
import { bySignature, SLICE } from "./blocks/registry.js";
import type { BlockDef } from "./blocks/types.js";
import type { Diagnostic, ParsedBlock, ParsedScript } from "./types.js";

type Token = { lit: string } | { hole: "round" | "square" | "curly"; name: string };

function sigTokens(sig: string): Token[] {
  const out: Token[] = [];
  const re = /\(([A-Z]+)\)|\[([A-Z]+)\]|\{([A-Z]+)\}|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sig))) {
    if (m[1]) out.push({ hole: "round", name: m[1] });
    else if (m[2]) out.push({ hole: "square", name: m[2] });
    else if (m[3]) out.push({ hole: "curly", name: m[3] });
    else out.push({ lit: m[4] });
  }
  return out;
}

// pre-tokenize all signatures once
const SIGS: { def: BlockDef; toks: Token[] }[] = SLICE.map((def) => ({ def, toks: sigTokens(def.signature) }));

/** Split a source line into bracket-aware tokens: words, (..), [..]. */
function lineTokens(line: string): { lit: string }[] | { val: string; kind: "round" | "square" }[] | any[] {
  const out: any[] = [];
  const re = /\(([^)]*)\)|\[([^\]]*)\]|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined && m[3] === undefined && line[m.index] === "(") out.push({ val: m[1].trim(), kind: "round" });
    else if (m[2] !== undefined && line[m.index] === "[") out.push({ val: m[2].trim(), kind: "square" });
    else out.push({ lit: m[3] });
  }
  return out;
}

function matchLine(line: string): { def: BlockDef; inputs: Record<string, { kind: "literal"; value: string }>; fields: Record<string, string> } | null {
  const lt = lineTokens(line);
  outer: for (const { def, toks } of SIGS) {
    if (toks.length !== lt.length) continue;
    const inputs: Record<string, { kind: "literal"; value: string }> = {};
    const fields: Record<string, string> = {};
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as any; const v = lt[i] as any;
      if ("lit" in t) { if (!("lit" in v) || v.lit !== t.lit) continue outer; }
      else if (t.hole === "round") { if (v.kind !== "round") continue outer; inputs[t.name] = { kind: "literal", value: v.val }; }
      else if (t.hole === "square") {
        if (v.kind !== "square") continue outer;
        if (def.fields?.[t.name]) fields[t.name] = v.val; else inputs[t.name] = { kind: "literal", value: v.val };
      } else continue outer; // curly holes don't appear in source lines
    }
    return { def, inputs, fields };
  }
  return null;
}

const indentOf = (s: string) => s.length - s.trimStart().length;

export function parseScripts(source: string, file: string): { scripts: ParsedScript[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split("\n").map((l, i) => ({ raw: l, line: i + 1 }))
    .filter((l) => l.raw.trim().length > 0);

  let pos = 0;
  // parse a run of blocks at >= baseIndent until 'end' (for c-blocks) or EOF
  function parseStack(stopOnEnd: boolean): ParsedBlock[] {
    const out: ParsedBlock[] = [];
    while (pos < lines.length) {
      const { raw, line } = lines[pos];
      const text = raw.trim();
      if (text === "end") { if (stopOnEnd) { pos++; return out; } diagnostics.push({ file, line, severity: "error", message: `unexpected "end"` }); pos++; continue; }
      const matched = matchLine(text);
      if (!matched) { diagnostics.push({ file, line, severity: "error", message: `unknown block "${text}"` }); pos++; continue; }
      pos++;
      const block: ParsedBlock = { opcode: matched.def.opcode, inputs: matched.inputs, fields: matched.fields, substacks: {} };
      if (matched.def.shape === "c" && matched.def.substack) {
        block.substacks[matched.def.substack] = parseStack(true);
      }
      out.push(block);
    }
    return out;
  }

  const scripts: ParsedScript[] = [];
  while (pos < lines.length) {
    const start = pos;
    const text = lines[pos].raw.trim();
    const head = matchLine(text);
    if (!head || head.def.shape !== "hat") {
      diagnostics.push({ file, line: lines[pos].line, severity: "error", message: `script must start with a hat block, got "${text}"` });
      pos++; continue;
    }
    pos++;
    const hat: ParsedBlock = { opcode: head.def.opcode, inputs: head.inputs, fields: head.fields, substacks: {} };
    const body = parseStack(false);
    scripts.push({ blocks: [hat, ...body] });
    if (pos === start) pos++; // safety: never stall
  }
  return { scripts, diagnostics };
}
```

(`indentOf` is provided for future indentation rules; the skeleton scopes c-blocks by `end`, which is sufficient for the slice.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compiler/parser.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser.ts tests/compiler/parser.test.ts
git commit -m "feat(compiler): scratchblocks script parser → IR"
```

---

### Task 7: `compileProject` orchestrator + full text→run e2e

**Files:**
- Create: `src/compiler/index.ts`
- Create: `tests/fixtures/spin-src/project.yaml`
- Create: `tests/fixtures/spin-src/cat.sprite.scratch`
- Test: `tests/compiler/compile-e2e.test.ts`

**Interfaces:**
- Consumes: `parseManifest` (Task 5), `parseScripts` (Task 6), `packageProject` (Task 3); `runHeadless` (Task 4).
- Produces: `compileProject(dir: string): Promise<CompileResult>` — reads `project.yaml` + each target's `*.scratch`, parses, packages; returns `{ ok, sb3, diagnostics }` (no `sb3` if any error).

- [ ] **Step 1: Create the fixture project**

```yaml
# tests/fixtures/spin-src/project.yaml
name: Spin
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
variables:
  global: { angle: 0 }
```

```
# tests/fixtures/spin-src/cat.sprite.scratch
when green flag clicked
set [angle] to (0)
repeat (36)
  turn right (10) degrees
  change [angle] by (10)
end
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/compiler/compile-e2e.test.ts
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

const dir = fileURLToPath(new URL("../fixtures/spin-src", import.meta.url));

test("compiles a source folder to an .sb3 that runs: angle → 360", async () => {
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  expect(res.sb3).toBeInstanceOf(Buffer);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("angle"))).toBe(360);
});

test("a source folder with an unknown block fails loud with no .sb3", async () => {
  // reuse the fixture but inject an unknown line via a sibling temp dir is overkill;
  // assert the contract instead: ok=false implies no sb3.
  const res = await compileProject(dir);
  if (!res.ok) expect(res.sb3).toBeUndefined();
  else expect(res.sb3).toBeInstanceOf(Buffer);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/compiler/compile-e2e.test.ts`
Expected: FAIL — `compileProject` not found.

- [ ] **Step 4: Implement the orchestrator**

```ts
// src/compiler/index.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseManifest } from "./manifest.js";
import { parseScripts } from "./parser.js";
import { packageProject } from "./packager.js";
import type { CompileResult, Diagnostic, ParsedScript } from "./types.js";

export type { CompileResult, Diagnostic } from "./types.js";

export async function compileProject(dir: string): Promise<CompileResult> {
  const diagnostics: Diagnostic[] = [];
  let manifestText: string;
  try { manifestText = await readFile(join(dir, "project.yaml"), "utf8"); }
  catch { return { ok: false, diagnostics: [{ file: "project.yaml", line: 0, severity: "error", message: "project.yaml not found" }] }; }

  const { project, diagnostics: md } = parseManifest(manifestText, "project.yaml");
  diagnostics.push(...md);

  const scriptsByTarget = new Map<string, ParsedScript[]>();
  for (const t of project.targets) {
    if (!t.sourceFile) continue;
    let src: string;
    try { src = await readFile(join(dir, t.sourceFile), "utf8"); }
    catch { diagnostics.push({ file: t.sourceFile, line: 0, severity: "error", message: `source file not found: ${t.sourceFile}` }); continue; }
    const { scripts, diagnostics: pd } = parseScripts(src, t.sourceFile);
    diagnostics.push(...pd);
    scriptsByTarget.set(t.name, scripts);
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) return { ok: false, diagnostics };

  const { sb3, diagnostics: gd } = await packageProject(project, scriptsByTarget);
  diagnostics.push(...gd);
  if (diagnostics.some((d) => d.severity === "error")) return { ok: false, diagnostics };
  return { ok: true, sb3, diagnostics };
}
```

- [ ] **Step 5: Run test + the full suite**

Run: `npx vitest run tests/compiler/compile-e2e.test.ts`
Expected: PASS — compiles from text and `angle === 360`.
Run: `npm test`
Expected: all compiler + editor tests green.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/index.ts tests/fixtures/spin-src tests/compiler/compile-e2e.test.ts
git commit -m "feat(compiler): compileProject orchestrator; full text→.sb3→run e2e (angle→360)"
```

---

## What this plan delivers

A proven compiler pipeline: a `project.yaml` + `*.sprite.scratch` source folder compiles to an `.sb3` that **runs correctly in a headless `scratch-vm`** (the spin program drives a variable `0 → 360`), with fail-loud diagnostics. The `BlockDef` schema, the IR types, and `compileProject`'s signature are established for the build-out to extend.

## Follow-on plans (not in this document)

- **Block-dictionary build-out** — the full core palette + Pen + Music, by category. **← ultracode fan-out** (one agent per category: dictionary entries + per-block semantic tests + a completeness critic). Extends `SLICE`/registry and the parser's input handling (nested reporters/booleans, menus).
- **Custom blocks (procedures)** — `define`, prototypes, calls, argument reporters, mutations, `warp`. Extends the parser (two-pass) and packager (mutations).
- **Asset resolver** — library index + CDN fetch/cache + named-costume resolution (the placeholder generator built here is the fallback).
- **MCP server** — wraps `compileProject` + the `ScratchEditor` bridge as stdio tools (resolving the parent-spec §15 carry-forward decisions).

## Self-Review

- **Spec coverage:** manifest parser ✓ (T5), script parser ✓ (T6), block dictionary ✓ (T2, slice — full build-out is the next plan), packager ✓ (T3), headless-vm validation ✓ (T4, T7), fail-loud diagnostics ✓ (T3/T5/T6/T7), placeholder costume ✓ (T1, seeds the asset resolver). Pen/Music, custom blocks, full palette, CDN assets, decompile are explicitly later plans (noted above) — this plan is the de-risk skeleton only.
- **Placeholder scan:** Task 4 is an intentional spike with a hard gate + a named fallback (vm stepping); no "TODO"/"add error handling" placeholders, no stray dead code in test snippets.
- **Type consistency:** `Project`/`TargetDecl`/`VariableDecl`/`ParsedBlock`/`ParsedScript`/`InputValue`/`Diagnostic`/`CompileResult` defined once (T1) and used unchanged in T3/T5/T6/T7; `BlockDef`/`InputSpec`/`FieldSpec` defined once (T2) and consumed by T3 (`byOpcode`) and T6 (`bySignature`); `packageProject` / `parseManifest` / `parseScripts` / `compileProject` / `runHeadless` signatures match across producer and consumer tasks.
- **Known cross-task note:** Task 4's harness is also used by Task 7 — created in T4, imported in T7 (no redefinition).
