# Parser + Schema Grammar-Extension Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the merged compiler skeleton from literal-only inputs to the **full core scratchblocks grammar** — nested reporters, booleans, infix operators, dropdown menus (shadow-input and direct-field), and `if/else`/`repeat until`/`forever` — proven on a small cross-shape slice that compiles to an `.sb3` and runs in a headless `scratch-vm`.

**Architecture:** Extend `InputValue` + `BlockDef`/`InputSpec`/`FieldSpec`, then **prove the riskiest contract first** (the extended packager encoding actually running in the VM, on a hand-built IR) before replacing the skeleton's line-matcher with a recursive-descent parser (lexer → statement/input parsing → control structures). The frozen result lets the next plan's per-category ultracode fan-out add dictionary entries only.

**Tech Stack:** TypeScript (strict, ESM), Node ≥25, Vitest, `jszip`, headless `scratch-vm@5.0.300`, Node `crypto`. No new dependencies.

## Global Constraints

- Node ≥ 25; TypeScript `strict: true`; ESM (`"type":"module"`); relative imports use `.js` extensions; no `any` outside the justified `scratch-vm`/JSON boundaries.
- **Fail loud, collect all:** accumulate every `Diagnostic { file, line, message, severity }`; `compileProject` returns `{ ok:false, diagnostics }` and **no `.sb3`** if any `error`-severity diagnostic fires. Never throw on malformed source — collect a diagnostic. Never emit a silently-broken project.
- Output `.sb3` must load and run in a headless `scratch-vm@5.0.300` (pinned to match the editor's bundled VM), assets read from the zip, fully offline.
- `project.json` envelope: `meta = { semver:"3.0.0", vm:"0.2.0", agent:"scratch-mcp" }`; `targets[0]` is the Stage.
- Variable field/reporter references resolve against {target's own variables} ∪ {global Stage variables}; an unresolved variable is an `error` diagnostic.
- **Frozen, do not change:** `compileProject(dir): Promise<CompileResult>`; the outer shape of `ParsedBlock { opcode; inputs; fields; substacks }` and `ParsedScript { blocks }`; `Diagnostic`; the manifest `Project`/`TargetDecl`/`VariableDecl` model.
- **Scratch 3 input encoding (use these exact forms):**
  - literal shadow in a number/text slot: `[1, [shadowType, value]]`
  - reporter block obscuring a shadow: `[3, childId, [shadowType, ""]]`
  - variable primitive obscuring a shadow: `[3, [12, name, id], [shadowType, ""]]`
  - boolean slot holding a block: `[2, childId]` (omit the input entirely if empty)
  - menu shadow input: `[1, menuShadowId]`, where the generated menu block is `{ opcode: menuOpcode, next: null, parent: parentId, inputs: {}, fields: { [field]: [value, null] }, shadow: true, topLevel: false }`
  - substack: `[2, firstChildId]` (omit if empty)
  - field — variable: `[name, id]`; dropdown: `[value, null]`
  - shadow types: 4 number, 6 positive integer, 8 angle, 9 color, 10 string (widen only as a block needs).

---

### Task 1: Schema + IR extension; migrate existing consumers (refactor — suite stays green)

Pure type growth + a mechanical `substack → substacks[]` migration. No new runtime behavior; the gate is "full suite still green + `tsc` clean". This unblocks every later task.

**Files:**
- Modify: `src/compiler/types.ts` (grow `InputValue`)
- Modify: `src/compiler/blocks/types.ts` (grow `InputSpec`/`FieldSpec`/`BlockDef`)
- Modify: `src/compiler/blocks/slice.ts` (`control_repeat`: `substack` → `substacks`)
- Modify: `src/compiler/packager.ts` (read `def.substacks` array)
- Modify: `src/compiler/parser.ts` (read `def.substacks?.[0]` — keeps the skeleton parser compiling until it is replaced in Task 5)

**Interfaces:**
- Produces (consumed by all later tasks):
  - `InputValue` union, `InputSpec` union, `FieldSpec` union, `BlockDef` with `substacks?: string[]`.

- [ ] **Step 1: Grow the IR `InputValue`**

In `src/compiler/types.ts`, replace the `InputValue` interface with a union (leave `ParsedBlock`/`ParsedScript` outer shape unchanged):

```ts
// src/compiler/types.ts  — replace the InputValue definition
export type InputValue =
  | { kind: "literal"; value: string }       // (10) / [hello]
  | { kind: "variable"; name: string }       // (score) used as a reporter input
  | { kind: "block"; block: ParsedBlock }    // nested reporter ( ) or boolean < >
  | { kind: "menu"; value: string };         // [edge v] shadow-menu selection
```

`ParsedBlock.inputs` stays `Record<string, InputValue>`; `ParsedBlock.fields` stays `Record<string, string>`; `ParsedBlock.substacks` stays `Record<string, ParsedBlock[]>`.

- [ ] **Step 2: Grow the dictionary schema**

Replace `src/compiler/blocks/types.ts` with:

```ts
// src/compiler/blocks/types.ts
export type BlockShape = "hat" | "stack" | "cap" | "c" | "reporter" | "boolean";

/** Scratch input shadow opcode: 4 number, 6 positive integer, 8 angle, 9 color, 10 text. */
export type ShadowType = 4 | 6 | 8 | 9 | 10;

export type InputSpec =
  | { kind: "number" | "text"; shadowType: ShadowType }                       // accepts a literal OR a nested reporter/variable
  | { kind: "boolean" }                                                       // < > slot; no shadow
  | { kind: "menu"; menuOpcode: string; field: string; default: string; shadowType?: ShadowType }
  | { kind: "substack" };

export type FieldSpec =
  | { kind: "variable" }                                                      // resolves to [name, id]
  | { kind: "dropdown" };                                                     // option string stored directly on the block

export interface BlockDef {
  signature: string;                       // "move (STEPS) steps", "() + ()", "if <CONDITION> then"
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substacks?: string[];                    // [] | ["SUBSTACK"] | ["SUBSTACK","SUBSTACK2"]
}
```

- [ ] **Step 3: Migrate the existing slice entry**

In `src/compiler/blocks/slice.ts`, change the `control_repeat` entry from `substack: "SUBSTACK"` to `substacks: ["SUBSTACK"]`. (The other five entries are unchanged. Their number/text `InputSpec`s already match the new union member.)

- [ ] **Step 4: Migrate the packager's substack handling**

In `src/compiler/packager.ts`, inside `emitStack`, replace the single-substack block:

```ts
// OLD:
if (def.substack) {
  const kids = b.substacks[def.substack] ?? [];
  if (kids.length) entry.inputs[def.substack] = [2, emitStack(kids, id, false, hatXY)];
}
// NEW:
for (const sub of def.substacks ?? []) {
  const kids = b.substacks[sub] ?? [];
  if (kids.length) entry.inputs[sub] = [2, emitStack(kids, id, false, hatXY)];
}
```

(The rest of the packager is unchanged in this task — literal-input encoding still works because the existing six blocks produce only literal inputs.)

- [ ] **Step 5: Migrate the skeleton parser (keep it compiling)**

In `src/compiler/parser.ts`, the skeleton reads `matched.def.substack`. Replace the c-block handling so it compiles against the new schema (this parser is fully replaced in Task 5; this is only to keep the suite green meanwhile):

```ts
// in parseStack, replace:
if (matched.def.shape === "c" && matched.def.substack) {
  block.substacks[matched.def.substack] = parseStack(true);
}
// with:
const sub0 = matched.def.substacks?.[0];
if (matched.def.shape === "c" && sub0) {
  block.substacks[sub0] = parseStack(true);
}
```

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).
Run: `npm test`
Expected: all existing tests green (24 passing), output pristine apart from the known `vm warn No storage module present`.

- [ ] **Step 7: Commit**

```bash
git add src/compiler/types.ts src/compiler/blocks/types.ts src/compiler/blocks/slice.ts src/compiler/packager.ts src/compiler/parser.ts
git commit -m "refactor(compiler): grow InputValue/BlockDef schema; substack->substacks[] migration"
```

---

### Task 2: Proving-slice dictionary entries

Add the `BlockDef`s the slice needs (operators, control structures, one menu block). No packager/parser changes yet — this task only grows the dictionary and proves the entries' shape.

**Files:**
- Modify: `src/compiler/blocks/slice.ts` (append entries)
- Test: `tests/compiler/registry.test.ts` (extend)

**Interfaces:**
- Consumes: `BlockDef`/`InputSpec`/`FieldSpec` (Task 1).
- Produces: new entries in `SLICE`, reachable via `byOpcode`/`bySignature`.

- [ ] **Step 1: Write the failing test**

Append to `tests/compiler/registry.test.ts`:

```ts
import { byOpcode, bySignature } from "../../src/compiler/blocks/registry.js";

test("operator_add is a reporter with two number inputs", () => {
  const def = byOpcode.get("operator_add")!;
  expect(def.shape).toBe("reporter");
  expect(def.inputs!.NUM1.kind).toBe("number");
  expect(def.inputs!.NUM2.kind).toBe("number");
});

test("operator_gt is a boolean reporter", () => {
  expect(byOpcode.get("operator_gt")!.shape).toBe("boolean");
});

test("operator_and takes two boolean inputs", () => {
  const def = byOpcode.get("operator_and")!;
  expect(def.shape).toBe("boolean");
  expect(def.inputs!.OPERAND1.kind).toBe("boolean");
  expect(def.inputs!.OPERAND2.kind).toBe("boolean");
});

test("operator_not takes one boolean input", () => {
  expect(byOpcode.get("operator_not")!.inputs!.OPERAND.kind).toBe("boolean");
});

test("operator_mathop has a dropdown OPERATOR field and a number input", () => {
  const def = byOpcode.get("operator_mathop")!;
  expect(def.shape).toBe("reporter");
  expect(def.fields!.OPERATOR.kind).toBe("dropdown");
  expect(def.inputs!.NUM.kind).toBe("number");
});

test("control_if_else is a c-block with two substacks and a boolean condition", () => {
  const def = byOpcode.get("control_if_else")!;
  expect(def.shape).toBe("c");
  expect(def.substacks).toEqual(["SUBSTACK", "SUBSTACK2"]);
  expect(def.inputs!.CONDITION.kind).toBe("boolean");
});

test("control_repeat_until is a c-block with a boolean condition", () => {
  const def = byOpcode.get("control_repeat_until")!;
  expect(def.inputs!.CONDITION.kind).toBe("boolean");
  expect(def.substacks).toEqual(["SUBSTACK"]);
});

test("control_forever is a c-block with one substack and no condition", () => {
  const def = byOpcode.get("control_forever")!;
  expect(def.substacks).toEqual(["SUBSTACK"]);
  expect(def.inputs).toBeUndefined();
});

test("motion_goto resolves a menu input by signature", () => {
  const def = bySignature.get("go to [TO v]")!;
  expect(def.opcode).toBe("motion_goto");
  const spec = def.inputs!.TO;
  expect(spec.kind).toBe("menu");
  if (spec.kind === "menu") {
    expect(spec.menuOpcode).toBe("motion_goto_menu");
    expect(spec.field).toBe("TO");
    expect(spec.default).toBe("_random_");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/registry.test.ts`
Expected: FAIL — `byOpcode.get("operator_add")` is `undefined`.

- [ ] **Step 3: Append the slice entries**

Add to the `SLICE` array in `src/compiler/blocks/slice.ts`:

Signatures use **named holes** (`(NUM1)`, `<OPERAND1>`, `[OPERATOR v]`) exactly like the skeleton's `move (STEPS) steps` — the hole name is the Scratch input/field name. Reporter/boolean signatures carry **no outer wrapping parens** (the `shape` says it's a reporter).

```ts
  // ---- operators ----
  { signature: "(NUM1) + (NUM2)", opcode: "operator_add", shape: "reporter",
    inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "(NUM1) - (NUM2)", opcode: "operator_subtract", shape: "reporter",
    inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "(OPERAND1) < (OPERAND2)", opcode: "operator_lt", shape: "boolean",
    inputs: { OPERAND1: { kind: "text", shadowType: 10 }, OPERAND2: { kind: "text", shadowType: 10 } } },
  { signature: "(OPERAND1) = (OPERAND2)", opcode: "operator_equals", shape: "boolean",
    inputs: { OPERAND1: { kind: "text", shadowType: 10 }, OPERAND2: { kind: "text", shadowType: 10 } } },
  { signature: "(OPERAND1) > (OPERAND2)", opcode: "operator_gt", shape: "boolean",
    inputs: { OPERAND1: { kind: "text", shadowType: 10 }, OPERAND2: { kind: "text", shadowType: 10 } } },
  { signature: "<OPERAND1> and <OPERAND2>", opcode: "operator_and", shape: "boolean",
    inputs: { OPERAND1: { kind: "boolean" }, OPERAND2: { kind: "boolean" } } },
  { signature: "<OPERAND1> or <OPERAND2>", opcode: "operator_or", shape: "boolean",
    inputs: { OPERAND1: { kind: "boolean" }, OPERAND2: { kind: "boolean" } } },
  { signature: "not <OPERAND>", opcode: "operator_not", shape: "boolean",
    inputs: { OPERAND: { kind: "boolean" } } },
  { signature: "[OPERATOR v] of (NUM)", opcode: "operator_mathop", shape: "reporter",
    inputs: { NUM: { kind: "number", shadowType: 4 } }, fields: { OPERATOR: { kind: "dropdown" } } },
  // ---- control ----
  { signature: "if <CONDITION> then", opcode: "control_if", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "if <CONDITION> then else", opcode: "control_if_else", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK", "SUBSTACK2"] },
  { signature: "repeat until <CONDITION>", opcode: "control_repeat_until", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "forever", opcode: "control_forever", shape: "c", substacks: ["SUBSTACK"] },
  // ---- motion (menu example) ----
  { signature: "go to [TO v]", opcode: "motion_goto", shape: "stack",
    inputs: { TO: { kind: "menu", menuOpcode: "motion_goto_menu", field: "TO", default: "_random_" } } },
```

(`control_if_else` carries a sentinel signature `"if <CONDITION> then else"`; the parser in Task 6 selects it by detecting an `else`, so it is reached by opcode, not by matching that literal text. `operator_subtract`/`operator_or` are included to show the pattern siblings; the full operator set is the fan-out's job.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compiler/registry.test.ts`
Expected: PASS (original 3 + the 9 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/blocks/slice.ts tests/compiler/registry.test.ts
git commit -m "feat(compiler): proving-slice dictionary entries (operators, control, menu)"
```

---

### Task 3: Packager encoding for the full grammar — DE-RISK GATE (hand-built IR → headless VM)

> **Nature:** the riskiest unknown. Does the extended Scratch-3 encoding (nested reporters `[3,…]`, booleans `[2,…]`, variable primitives `[3,[12,…],…]`, menu shadows `[1,menuId]`, two substacks) actually load and RUN in headless `scratch-vm`? Prove it now on hand-built IR, before the parser exists — exactly as the skeleton proved its hand-built IR.

**Files:**
- Modify: `src/compiler/packager.ts` (recursive input encoding)
- Test: `tests/compiler/packager-grammar.test.ts` (new — structural + VM-runtime on hand-built IR)

**Interfaces:**
- Consumes: `byOpcode` (Task 2); `InputValue` (Task 1); `runHeadless` (existing `tests/compiler/vm-harness.ts`).
- Produces: `packageProject` encodes all `InputValue` kinds + menus + two substacks. Signature unchanged: `packageProject(project, scriptsByTarget): Promise<{ sb3: Buffer; diagnostics: Diagnostic[] }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compiler/packager-grammar.test.ts
import JSZip from "jszip";
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript, ParsedBlock } from "../../src/compiler/types.js";
import { runHeadless } from "./vm-harness.js";

const lit = (value: string): any => ({ kind: "literal", value });
const v = (name: string): any => ({ kind: "variable", name });
const blk = (block: ParsedBlock): any => ({ kind: "block", block });
const B = (opcode: string, inputs: any = {}, fields: any = {}, substacks: any = {}): ParsedBlock =>
  ({ opcode, inputs, fields, substacks });

const project: Project = {
  name: "G",
  targets: [
    { name: "Stage", isStage: true, variables: [
      { name: "r", value: 0 }, { name: "b", value: 0 }, { name: "c", value: 0 }, { name: "m", value: 0 },
    ] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};

// set [r] to ((3) + (4))  => r = 7
const addScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("data_setvariableto",
    { VALUE: blk(B("operator_add", { NUM1: lit("3"), NUM2: lit("4") })) },
    { VARIABLE: "r" }),
] };

// if <(1) > (2)> then {} else { set [b] to (9) }  => b = 9
const ifElseScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("control_if_else",
    { CONDITION: blk(B("operator_gt", { OPERAND1: lit("1"), OPERAND2: lit("2") })) },
    {},
    { SUBSTACK: [], SUBSTACK2: [ B("data_setvariableto", { VALUE: lit("9") }, { VARIABLE: "b" }) ] }),
] };

// repeat until <(c) = (5)> { change [c] by (1) }  => c = 5
const repeatUntilScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("control_repeat_until",
    { CONDITION: blk(B("operator_equals", { OPERAND1: v("c"), OPERAND2: lit("5") })) },
    {},
    { SUBSTACK: [ B("data_changevariableby", { VALUE: lit("1") }, { VARIABLE: "c" }) ] }),
] };

// set [m] to ([abs v] of (-5))  => m = 5
const mathopScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("data_setvariableto",
    { VALUE: blk(B("operator_mathop", { NUM: lit("-5") }, { OPERATOR: "abs" })) },
    { VARIABLE: "m" }),
] };

test("hand-built grammar IR runs in the VM: r=7, b=9, c=5, m=5", async () => {
  const { sb3, diagnostics } = await packageProject(project,
    new Map([["Cat", [addScript, ifElseScript, repeatUntilScript, mathopScript]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const state = await runHeadless(sb3);
  expect(Number(state.variable("r"))).toBe(7);
  expect(Number(state.variable("b"))).toBe(9);
  expect(Number(state.variable("c"))).toBe(5);
  expect(Number(state.variable("m"))).toBe(5);
});

test("nested reporter is encoded as [3, childId, shadow] and the child block exists", async () => {
  const { sb3 } = await packageProject(project, new Map([["Cat", [addScript]]]));
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const setBlock = Object.values(cat.blocks).find((x: any) => x.opcode === "data_setvariableto") as any;
  const inp = setBlock.inputs.VALUE;
  expect(inp[0]).toBe(3);                         // block obscuring a shadow
  expect(typeof inp[1]).toBe("string");           // child block id
  expect(cat.blocks[inp[1]].opcode).toBe("operator_add");
});

test("a menu input generates a shadow menu block and a [1, id] input", async () => {
  const gotoScript: ParsedScript = { blocks: [
    B("event_whenflagclicked"),
    B("motion_goto", { TO: { kind: "menu", value: "_random_" } as any }),
  ] };
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", [gotoScript]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const gotoBlock = Object.values(cat.blocks).find((x: any) => x.opcode === "motion_goto") as any;
  const menuId = gotoBlock.inputs.TO[1];
  expect(gotoBlock.inputs.TO[0]).toBe(1);
  const menu = cat.blocks[menuId];
  expect(menu.opcode).toBe("motion_goto_menu");
  expect(menu.shadow).toBe(true);
  expect(menu.fields.TO).toEqual(["_random_", null]);
  // and it still loads + runs without error
  await runHeadless(sb3);
});

test("a variable used as a reporter input encodes the [12,name,id] primitive", async () => {
  const { sb3 } = await packageProject(project, new Map([["Cat", [repeatUntilScript]]]));
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const eq = Object.values(cat.blocks).find((x: any) => x.opcode === "operator_equals") as any;
  // OPERAND1 is the variable c: [3, [12, "c", <id>], [10, ""]]
  expect(eq.inputs.OPERAND1[0]).toBe(3);
  expect(eq.inputs.OPERAND1[1][0]).toBe(12);
  expect(eq.inputs.OPERAND1[1][1]).toBe("c");
});

test("unresolved variable in a reporter input is a fail-loud error", async () => {
  const bad: ParsedScript = { blocks: [
    B("event_whenflagclicked"),
    B("data_setvariableto", { VALUE: v("ghost") }, { VARIABLE: "r" }),
  ] };
  const { diagnostics } = await packageProject(project, new Map([["Cat", [bad]]]));
  expect(diagnostics.some((d) => d.severity === "error" && /ghost/.test(d.message))).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/compiler/packager-grammar.test.ts`
Expected: FAIL — the packager does not yet encode `kind:"block"`/`"variable"`/`"menu"` inputs (nested reporters are dropped or mis-encoded; `r` stays 0).

- [ ] **Step 3: Implement the recursive input encoding**

In `src/compiler/packager.ts`, replace the input-emission portion of `emitStack` so each block's inputs are produced by a recursive `emitInput`. The key changes: (a) a helper that emits a child block tree and returns its id; (b) `emitInput` switching on `InputValue.kind`; (c) menu shadow generation; (d) dropdown vs variable field handling. Use this structure (adapt names to the existing file):

```ts
// inside packageProject, alongside the existing nextId()/blocks map, within the per-target scope:

const emitInput = (parentId: string, spec: InputSpec, value: InputValue | undefined): any => {
  // boolean slot: a block or nothing
  if (spec.kind === "boolean") {
    if (value && value.kind === "block") return [2, emitBlock(value.block, parentId)];
    return undefined; // empty boolean → caller omits the input
  }
  // menu slot: generate a shadow menu block
  if (spec.kind === "menu") {
    const sel = value && value.kind === "menu" ? value.value : spec.default;
    const mid = nextId();
    blocks[mid] = { opcode: spec.menuOpcode, next: null, parent: parentId,
      inputs: {}, fields: { [spec.field]: [sel, null] }, shadow: true, topLevel: false };
    return [1, mid];
  }
  // number/text slot: literal, variable primitive, or nested reporter obscuring a shadow
  const st = spec.shadowType;
  if (!value || value.kind === "literal") {
    return [1, [st, value && value.kind === "literal" ? value.value : ""]];
  }
  if (value.kind === "variable") {
    const id = resolveVar(value.name);
    if (!id) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
      message: `unresolved variable "${value.name}"` });
    return [3, [12, value.name, id ?? ""], [st, ""]];
  }
  // value.kind === "block"
  return [3, emitBlock(value.block, parentId), [st, ""]];
};

// emitBlock emits a single (possibly nested) reporter/boolean block and returns its id.
const emitBlock = (b: ParsedBlock, parentId: string): string => {
  const id = nextId();
  const def = byOpcode.get(b.opcode);
  const entry: any = { opcode: b.opcode, next: null, parent: parentId,
    inputs: {}, fields: {}, shadow: false, topLevel: false };
  if (!def) {
    diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
      message: `unknown opcode "${b.opcode}"` });
  } else {
    for (const [nm, ispec] of Object.entries(def.inputs ?? {})) {
      if (ispec.kind === "substack") continue;
      const enc = emitInput(id, ispec, b.inputs[nm]);
      if (enc !== undefined) entry.inputs[nm] = enc;
    }
    emitFields(def, b, entry);
  }
  blocks[id] = entry;
  return id;
};

// emitFields handles variable fields ([name,id]) and dropdown fields ([value,null]).
const emitFields = (def: BlockDef, b: ParsedBlock, entry: any): void => {
  for (const [nm, fspec] of Object.entries(def.fields ?? {})) {
    if (fspec.kind === "variable") {
      const vname = b.fields[nm] ?? "";
      const vid = resolveVar(vname);
      if (!vid) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
        message: `unresolved variable "${vname}"` });
      entry.fields[nm] = [vname, vid ?? ""];
    } else { // dropdown
      entry.fields[nm] = [b.fields[nm] ?? "", null];
    }
  }
};
```

Then in the existing statement loop (`emitStack`), replace the inline input/field/substack code so each statement block uses `emitInput`/`emitFields` and the substacks loop from Task 1:

```ts
if (def) {
  for (const [nm, ispec] of Object.entries(def.inputs ?? {})) {
    if (ispec.kind === "substack") continue;
    const enc = emitInput(id, ispec, b.inputs[nm]);
    if (enc !== undefined) entry.inputs[nm] = enc;
  }
  for (const sub of def.substacks ?? []) {
    const kids = b.substacks[sub] ?? [];
    if (kids.length) entry.inputs[sub] = [2, emitStack(kids, id, false, hatXY)];
  }
  emitFields(def, b, entry);
} else {
  diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
    message: `unknown opcode "${b.opcode}"` });
}
```

Add the imports/types at the top of `packager.ts`: `import type { BlockDef, InputSpec } from "./blocks/types.js";` and ensure `InputValue` is imported from `./types.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/compiler/packager-grammar.test.ts`
Expected: PASS (6 tests). **HARD GATE:** the runtime test (`r=7, b=9, c=5, m=5`) must pass in the headless VM. If any value is wrong, STOP and report — the encoding contract must hold before the parser is built.
Run: `npx vitest run tests/compiler/packager.test.ts tests/compiler/run-ir.test.ts`
Expected: the original packager + run-ir tests still PASS (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/packager.ts tests/compiler/packager-grammar.test.ts
git commit -m "feat(compiler): packager encodes nested reporters/booleans/menus/vars/two-substacks; VM-proven"
```

---

### Task 4: Lexer / tokenizer

A bracket-aware tokenizer the recursive-descent parser consumes. Pure function, unit-tested in isolation.

**Files:**
- Create: `src/compiler/parser/lexer.ts`
- Test: `tests/compiler/lexer.test.ts`

**Interfaces:**
- Produces: `tokenizeLine(text: string): Tok[]` and the `Tok` type.

```ts
export type Tok =
  | { t: "word"; v: string }
  | { t: "(" } | { t: ")" }
  | { t: "<" } | { t: ">" }
  | { t: "text"; v: string }       // [hello]   (plain square brackets)
  | { t: "menu"; v: string };      // [edge v]  (trailing " v]")
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/compiler/lexer.test.ts
import { expect, test } from "vitest";
import { tokenizeLine } from "../../src/compiler/parser/lexer.js";

test("splits words and round/boolean brackets", () => {
  expect(tokenizeLine("move (10) steps")).toEqual([
    { t: "word", v: "move" }, { t: "(" }, { t: "word", v: "10" }, { t: ")" }, { t: "word", v: "steps" },
  ]);
});

test("distinguishes a [x v] menu from a [hello] text literal", () => {
  expect(tokenizeLine("go to [random position v]")).toEqual([
    { t: "word", v: "go" }, { t: "word", v: "to" }, { t: "menu", v: "random position" },
  ]);
  expect(tokenizeLine("say [hello]")).toEqual([
    { t: "word", v: "say" }, { t: "text", v: "hello" },
  ]);
});

test("tokenizes nested operators and booleans", () => {
  expect(tokenizeLine("if <(1) > (2)> then")).toEqual([
    { t: "word", v: "if" }, { t: "<" }, { t: "(" }, { t: "word", v: "1" }, { t: ")" },
    { t: "word", v: ">" }, { t: "(" }, { t: "word", v: "2" }, { t: ")" }, { t: ">" },
    { t: "word", v: "then" },
  ]);
});

test("an empty text literal and an empty menu are preserved", () => {
  expect(tokenizeLine("say []")).toEqual([{ t: "word", v: "say" }, { t: "text", v: "" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/lexer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the lexer**

The `<`/`>` boolean-bracket vs comparison-operator ambiguity is resolved by the **spacing rule** (canonical scratchblocks always puts spaces around binary operators and never inside brackets): a `<` **followed by** a space is the less-than operator (`word "<"`); a `<` followed by a non-space opens a boolean (`{t:"<"}`). A `>` **preceded by** a space is the greater-than operator (`word ">"`); a `>` preceded by a non-space closes a boolean (`{t:">"}`). `=` is never a bracket, so the word-scanner emits it as `word "="`. This makes operators ordinary word tokens (matched via the named-hole operator signatures) and `{t:"<"}`/`{t:">"}` unambiguous boolean delimiters.

```ts
// src/compiler/parser/lexer.ts
export type Tok =
  | { t: "word"; v: string }
  | { t: "(" } | { t: ")" }
  | { t: "<" } | { t: ">" }       // boolean-open / boolean-close ONLY (operators are word tokens)
  | { t: "text"; v: string }
  | { t: "menu"; v: string };

/** Tokenize one source line into a bracket-aware token stream. `[x v]` → menu,
 *  `[hello]` → text. `<`/`>` are boolean brackets unless space-adjacent (then
 *  they are comparison-operator words; see the spacing rule above). */
export function tokenizeLine(line: string): Tok[] {
  const out: Tok[] = [];
  const s = line.trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : "";        // "" (non-space) at the boundary → bracket
    const next = i + 1 < s.length ? s[i + 1] : "";
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "(") { out.push({ t: "(" }); i++; continue; }
    if (ch === ")") { out.push({ t: ")" }); i++; continue; }
    if (ch === "<") { out.push(next === " " ? { t: "word", v: "<" } : { t: "<" }); i++; continue; }
    if (ch === ">") { out.push(prev === " " ? { t: "word", v: ">" } : { t: ">" }); i++; continue; }
    if (ch === "[") {
      const close = s.indexOf("]", i);
      const inner = close === -1 ? s.slice(i + 1) : s.slice(i + 1, close);
      i = close === -1 ? s.length : close + 1;
      const m = inner.match(/^(.*)\s+v$/);            // "edge v" → menu "edge"
      if (m) out.push({ t: "menu", v: m[1].trim() });
      else out.push({ t: "text", v: inner.trim() });
      continue;
    }
    // a bare word: run until whitespace or a structural char
    let j = i;
    while (j < s.length && !" \t()<>[".includes(s[j])) j++;
    out.push({ t: "word", v: s.slice(i, j) });
    i = j;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compiler/lexer.test.ts`
Expected: PASS (4 tests). The "tokenizes nested operators" test confirms the spacing rule: `<` before `(` is `{t:"<"}`, ` > ` is `{t:"word",v:">"}`, the trailing `>` after `)` is `{t:">"}`.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser/lexer.ts tests/compiler/lexer.test.ts
git commit -m "feat(compiler): bracket-aware scratchblocks lexer (menu vs text, structural brackets)"
```

---

### Task 5: Recursive-descent parser core — statements + recursive input parsing

Replace the skeleton `src/compiler/parser.ts` with a recursive-descent parser. **This task covers flat (non-control) scripts**: hats, stack blocks, and full input recursion — literals, variable reporters, nested reporters, booleans, infix operators (matched by their bracketed signatures), and menus. C-blocks (if/else/repeat/forever) are added in Task 6 on top of this parser.

**Files:**
- Replace: `src/compiler/parser.ts` (becomes `src/compiler/parser/index.ts`; update the import in `src/compiler/index.ts` from `./parser.js` to `./parser/index.js`)
- Replace: `tests/compiler/parser.test.ts`

**Interfaces:**
- Consumes: `tokenizeLine` (Task 4); `bySignature`/`SLICE`/`BlockDef` (Task 2); `ParsedBlock`/`ParsedScript`/`InputValue`/`Diagnostic` (Task 1).
- Produces: `parseScripts(source: string, file: string, knownVars: Set<string>): { scripts: ParsedScript[]; diagnostics: Diagnostic[] }`. **The signature gains `knownVars`** (the set of variable names in scope for this target — own ∪ global), so a bare `(name)` in a round slot can be classified as a variable reporter vs an unknown reporter. The orchestrator (Task 7) passes it.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compiler/parser.test.ts
import { expect, test } from "vitest";
import { parseScripts } from "../../src/compiler/parser/index.js";

const vars = new Set(["angle", "r", "c"]);

test("parses a hat + a set with a literal", () => {
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [angle v] to (0)", "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const b = scripts[0].blocks;
  expect(b[0].opcode).toBe("event_whenflagclicked");
  expect(b[1].opcode).toBe("data_setvariableto");
  expect(b[1].fields.VARIABLE).toBe("angle");
  expect(b[1].inputs.VALUE).toEqual({ kind: "literal", value: "0" });
});

test("parses a nested infix reporter into a block InputValue", () => {
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [r v] to ((3) + (4))", "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const setv = scripts[0].blocks[1];
  const val = setv.inputs.VALUE;
  expect(val.kind).toBe("block");
  if (val.kind === "block") {
    expect(val.block.opcode).toBe("operator_add");
    expect(val.block.inputs.NUM1).toEqual({ kind: "literal", value: "3" });
    expect(val.block.inputs.NUM2).toEqual({ kind: "literal", value: "4" });
  }
});

test("a bare known-variable name in a round slot becomes a variable reporter", () => {
  const { scripts } = parseScripts("when green flag clicked\nchange [c v] by (c)", "f", vars);
  expect(scripts[0].blocks[1].inputs.VALUE).toEqual({ kind: "variable", name: "c" });
});

test("a dropdown field + nested input: ([abs v] of (-5))", () => {
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [r v] to ([abs v] of (-5))", "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const val = scripts[0].blocks[1].inputs.VALUE;
  expect(val.kind).toBe("block");
  if (val.kind === "block") {
    expect(val.block.opcode).toBe("operator_mathop");
    expect(val.block.fields.OPERATOR).toBe("abs");
    expect(val.block.inputs.NUM).toEqual({ kind: "literal", value: "-5" });
  }
});

test("a menu input becomes a menu InputValue", () => {
  const { scripts } = parseScripts("when green flag clicked\ngo to [random position v]", "f", vars);
  expect(scripts[0].blocks[1].inputs.TO).toEqual({ kind: "menu", value: "random position" });
});

test("an unknown block is a fail-loud diagnostic", () => {
  const { diagnostics } = parseScripts("when green flag clicked\nfly (3) times", "f", vars);
  expect(diagnostics.some((d) => d.severity === "error" && /fly/.test(d.message))).toBe(true);
});

test("a boolean reporter parses into a block: <(1) > (2)>", () => {
  // exercised via 'wait until' is Task 6; here assert operator_gt parses standalone as an input is not valid,
  // so test the matcher through 'not': set is invalid for boolean, use the standalone parse helper instead.
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [r v] to <(1) > (2)>", "f", vars);
  // boolean into a number slot is a type error → fail loud
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  void scripts;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/parser.test.ts`
Expected: FAIL — `parseScripts` signature/module differs (now under `parser/index.js`, takes `knownVars`).

- [ ] **Step 3: Implement the recursive-descent core**

Create `src/compiler/parser/index.ts`. Signatures are pre-tokenized into literal words and typed holes (round `()`, square `[]`, boolean `<>`, menu `[ v]`, and the substack/condition markers used in Task 6). A statement line is tokenized (Task 4) and matched against the dictionary; input holes are parsed recursively from the token stream. Comparison operators (`<`,`>`,`=`) between two round groups are matched via the operator signatures (`() < ()`, etc.). Full implementation:

```ts
// src/compiler/parser/index.ts
import { tokenizeLine, type Tok } from "./lexer.js";
import { SLICE } from "../blocks/registry.js";
import type { BlockDef } from "../blocks/types.js";
import type { Diagnostic, InputValue, ParsedBlock, ParsedScript } from "../types.js";

// ---- signature tokenization ----
type SigTok =
  | { lit: string }
  | { hole: "round" | "square" | "boolean" | "menu"; name: string };

function sigTokens(sig: string): SigTok[] {
  const out: SigTok[] = [];
  // ( NAME )  [ NAME v ]  [ NAME ]  < NAME >  bare-word
  const re = /\(([A-Z0-9]*)\)|\[([A-Z0-9]+) v\]|\[([A-Z0-9]*)\]|<([A-Z0-9]*)>|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sig))) {
    if (m[1] !== undefined && sig[m.index] === "(") out.push({ hole: "round", name: m[1] });
    else if (m[2] !== undefined) out.push({ hole: "menu", name: m[2] });
    else if (m[3] !== undefined && sig[m.index] === "[") out.push({ hole: "square", name: m[3] });
    else if (m[4] !== undefined && sig[m.index] === "<") out.push({ hole: "boolean", name: m[4] });
    else out.push({ lit: m[5] });
  }
  return out;
}
const SIGS: { def: BlockDef; toks: SigTok[] }[] = SLICE.map((def) => ({ def, toks: sigTokens(def.signature) }));

// A parsed signature hole's captured value: a token sub-stream.
type Group = { kind: "round" | "boolean"; toks: Tok[] } | { kind: "menu"; v: string } | { kind: "text"; v: string } | { kind: "word"; v: string };

/** Split a flat token stream into top-level groups: round (..), boolean <..>, menu, text, words. */
function groups(toks: Tok[]): Group[] {
  const out: Group[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === "(" || t.t === "<") {
      const open = t.t, close = t.t === "(" ? ")" : ">";
      let depth = 1, j = i + 1; const inner: Tok[] = [];
      while (j < toks.length && depth > 0) {
        if (toks[j].t === open) depth++;
        else if (toks[j].t === close) { depth--; if (depth === 0) break; }
        inner.push(toks[j]); j++;
      }
      out.push({ kind: open === "(" ? "round" : "boolean", toks: inner });
      i = j + 1;
    } else if (t.t === "menu") { out.push({ kind: "menu", v: t.v }); i++; }
    else if (t.t === "text") { out.push({ kind: "text", v: t.v }); i++; }
    else { out.push({ kind: "word", v: (t as any).v }); i++; }
  }
  return out;
}

export interface ParseCtx { file: string; knownVars: Set<string>; diagnostics: Diagnostic[]; }

const isNumeric = (s: string) => s.trim() !== "" && !Number.isNaN(Number(s));

/** Parse the content of a round ( ) input slot into an InputValue. */
function parseRound(g: Group, line: number, ctx: ParseCtx): InputValue {
  if (g.kind === "round") {
    const gs = groups(g.toks);
    // a single bare word → literal number/var; otherwise a nested reporter
    if (gs.length === 1 && gs[0].kind === "word") {
      const w = (gs[0] as any).v as string;
      if (isNumeric(w)) return { kind: "literal", value: w };
      if (ctx.knownVars.has(w)) return { kind: "variable", name: w };
      // a bare unknown word in a round slot: treat as a (string) literal — lenient
      return { kind: "literal", value: w };
    }
    const blk = matchGroups(gs, line, ctx, "reporter");
    if (blk) return { kind: "block", block: blk };
    ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `cannot parse reporter "(${render(g.toks)})"` });
    return { kind: "literal", value: "" };
  }
  if (g.kind === "text") return { kind: "literal", value: g.v };
  if (g.kind === "menu") return { kind: "menu", value: g.v };
  // a bare numeric/word handed in without parens
  if (g.kind === "word") return isNumeric((g as any).v) ? { kind: "literal", value: (g as any).v } : { kind: "literal", value: (g as any).v };
  ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `expected a value` });
  return { kind: "literal", value: "" };
}

/** Parse a boolean < > slot into a block InputValue (or report a type error). */
function parseBoolean(g: Group, line: number, ctx: ParseCtx): InputValue | undefined {
  if (g.kind !== "boolean") {
    ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `expected a boolean < >` });
    return undefined;
  }
  const gs = groups(g.toks);
  if (gs.length === 0) return undefined; // empty boolean
  const blk = matchGroups(gs, line, ctx, "boolean");
  if (!blk) { ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `cannot parse boolean "<${render(g.toks)}>"` }); return undefined; }
  return { kind: "block", block: blk };
}

/** Match a top-level group list against the dictionary, returning a ParsedBlock (reporters/booleans). */
function matchGroups(gs: Group[], line: number, ctx: ParseCtx, want: "reporter" | "boolean" | "any"): ParsedBlock | null {
  outer: for (const { def, toks } of SIGS) {
    if (want !== "any" && def.shape !== want) continue;
    if (toks.length !== gs.length) continue;
    const block: ParsedBlock = { opcode: def.opcode, inputs: {}, fields: {}, substacks: {} };
    for (let i = 0; i < toks.length; i++) {
      const st = toks[i], g = gs[i];
      if ("lit" in st) { if (g.kind !== "word" || (g as any).v !== st.lit) continue outer; continue; }
      if (st.hole === "round") { if (g.kind !== "round" && g.kind !== "word" && g.kind !== "text") continue outer; block.inputs[st.name] = parseRound(g, line, ctx); }
      else if (st.hole === "boolean") { if (g.kind !== "boolean") continue outer; const bv = parseBoolean(g, line, ctx); if (bv) block.inputs[st.name] = bv; }
      else if (st.hole === "menu") { if (g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "menu", value: g.v }; }
      else if (st.hole === "square") { if (g.kind !== "text" && g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "literal", value: g.v }; }  // a [VARIABLE] field accepts [x] or [x v]
    }
    return block;
  }
  return null;
}

function render(toks: Tok[]): string {
  return toks.map((t) => t.t === "word" ? (t as any).v : t.t === "text" ? `[${(t as any).v}]` : t.t === "menu" ? `[${(t as any).v} v]` : t.t).join(" ");
}

/** Match one statement line (hat/stack) against the dictionary. */
function matchStatement(line: string, lineNo: number, ctx: ParseCtx): { def: BlockDef; block: ParsedBlock } | null {
  const gs = groups(tokenizeLine(line));
  outer: for (const { def, toks } of SIGS) {
    if (def.shape === "reporter" || def.shape === "boolean") continue; // statements only
    if (toks.length !== gs.length) continue;
    const block: ParsedBlock = { opcode: def.opcode, inputs: {}, fields: {}, substacks: {} };
    for (let i = 0; i < toks.length; i++) {
      const st = toks[i], g = gs[i];
      if ("lit" in st) { if (g.kind !== "word" || (g as any).v !== st.lit) continue outer; continue; }
      if (st.hole === "round") { if (g.kind !== "round" && g.kind !== "word" && g.kind !== "text") continue outer; block.inputs[st.name] = parseRound(g, lineNo, ctx); }
      else if (st.hole === "boolean") { if (g.kind !== "boolean") continue outer; const bv = parseBoolean(g, lineNo, ctx); if (bv) block.inputs[st.name] = bv; }
      else if (st.hole === "menu") { if (g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "menu", value: g.v }; }
      else if (st.hole === "square") { if (g.kind !== "text" && g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "literal", value: g.v }; }  // a [VARIABLE] field accepts [x] or [x v]
    }
    return { def, block };
  }
  return null;
}

export function parseScripts(source: string, file: string, knownVars: Set<string>): { scripts: ParsedScript[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ctx: ParseCtx = { file, knownVars, diagnostics };
  const lines = source.split("\n").map((raw, i) => ({ raw: raw.trim(), line: i + 1 })).filter((l) => l.raw.length > 0);
  let pos = 0;

  // Collect statements until `end` (consumed) or EOF/new-hat (not consumed).
  // Single-substack c-blocks (repeat/forever/if/repeat until) recurse here via `end`.
  // Task 6 extends this to handle `else` (two substacks) + the unterminated-c-block diagnostic.
  function parseStack(): ParsedBlock[] {
    const out: ParsedBlock[] = [];
    while (pos < lines.length) {
      const { raw, line } = lines[pos];
      if (raw === "end") { pos++; return out; }
      const m = matchStatement(raw, line, ctx);
      if (!m) { diagnostics.push({ file, line, severity: "error", message: `unknown block "${raw}"` }); pos++; continue; }
      if (m.def.shape === "hat") return out;                 // new hat: stop, do not consume
      pos++;
      if (m.def.shape === "c") {
        const sub = m.def.substacks?.[0] ?? "SUBSTACK";
        m.block.substacks[sub] = parseStack();
      }
      out.push(m.block);
    }
    return out;
  }

  const scripts: ParsedScript[] = [];
  while (pos < lines.length) {
    const { raw, line } = lines[pos];
    const m = matchStatement(raw, line, ctx);
    if (!m || m.def.shape !== "hat") { diagnostics.push({ file, line, severity: "error", message: `script must start with a hat block, got "${raw}"` }); pos++; continue; }
    pos++;
    scripts.push({ blocks: [m.block, ...parseStack()] });
  }
  return { scripts, diagnostics };
}
```

(Task 6 replaces `parseScripts` with an `else`/two-substack-aware version; the matchers above are reused unchanged. This Task-5 version already handles single-substack c-blocks, so the existing `spin-src` e2e stays green.)

- [ ] **Step 4: Update the orchestrator import and run tests**

In `src/compiler/index.ts`, change `import { parseScripts } from "./parser.js";` to `import { parseScripts } from "./parser/index.js";` and pass a `knownVars` set per target: `const knownVars = new Set([...t.variables.map(v => v.name), ...stageVars])` (see Task 7 for the exact wiring — for now, build it from the target's own + Stage globals). Delete the obsolete `src/compiler/parser.ts`.

Run: `npx vitest run tests/compiler/parser.test.ts`
Expected: PASS (7 tests).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser/ tests/compiler/parser.test.ts src/compiler/index.ts
git rm src/compiler/parser.ts
git commit -m "feat(compiler): recursive-descent parser core (inputs, reporters, booleans, menus, vars)"
```

---

### Task 6: Parser control structures — if / if-else / repeat / repeat-until / forever + nesting

Extend the parser to parse c-blocks: a boolean CONDITION (where the block has one), a substack body to `end`, and `if … else … end` → `control_if_else` with SUBSTACK + SUBSTACK2. Nesting recurses.

**Files:**
- Modify: `src/compiler/parser/index.ts` (replace the `parseScripts` statement loop with control-aware recursion)
- Modify: `tests/compiler/parser.test.ts` (add control tests)

**Interfaces:**
- Consumes: the matchers from Task 5 unchanged.
- Produces: `parseScripts` now handles c-blocks; the `if`→`control_if`/`control_if_else` promotion rule lives here.

- [ ] **Step 1: Write the failing tests**

Append to `tests/compiler/parser.test.ts`:

```ts
test("parses repeat with a substack", () => {
  const src = "when green flag clicked\nrepeat (3)\n  change [c v] by (1)\nend";
  const { scripts, diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const rep = scripts[0].blocks[1];
  expect(rep.opcode).toBe("control_repeat");
  expect(rep.substacks.SUBSTACK.map((x) => x.opcode)).toEqual(["data_changevariableby"]);
});

test("parses if/else into control_if_else with two substacks and a boolean condition", () => {
  const src = "when green flag clicked\nif <(1) > (2)> then\n  change [c v] by (1)\nelse\n  change [c v] by (2)\nend";
  const { scripts, diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const ie = scripts[0].blocks[1];
  expect(ie.opcode).toBe("control_if_else");
  expect(ie.inputs.CONDITION.kind).toBe("block");
  expect(ie.substacks.SUBSTACK.map((x) => x.opcode)).toEqual(["data_changevariableby"]);
  expect(ie.substacks.SUBSTACK2.map((x) => x.opcode)).toEqual(["data_changevariableby"]);
});

test("a plain if (no else) is control_if with one substack", () => {
  const src = "when green flag clicked\nif <(1) > (2)> then\n  change [c v] by (1)\nend";
  const { scripts } = parseScripts(src, "f", vars);
  expect(scripts[0].blocks[1].opcode).toBe("control_if");
  expect(scripts[0].blocks[1].substacks.SUBSTACK2).toBeUndefined();
});

test("parses repeat until with a boolean condition and nesting", () => {
  const src = "when green flag clicked\nrepeat until <(c) = (5)>\n  change [c v] by (1)\nend";
  const { scripts, diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const ru = scripts[0].blocks[1];
  expect(ru.opcode).toBe("control_repeat_until");
  expect(ru.inputs.CONDITION.kind).toBe("block");
});

test("an unterminated c-block is a fail-loud diagnostic", () => {
  const src = "when green flag clicked\nrepeat (3)\n  change [c v] by (1)";
  const { diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.some((d) => d.severity === "error" && /end/.test(d.message))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compiler/parser.test.ts`
Expected: FAIL on the new `if/else` test (Task 5 has no `else` handling, so `else`/`end` mis-parse) and the unterminated-c-block test (Task 5 returns at EOF without a diagnostic). The `repeat`, plain-`if`, and `repeat until` tests already pass from Task 5's single-substack handling and must stay green.

- [ ] **Step 3: Implement control-structure parsing**

Replace the `parseScripts` body in `src/compiler/parser/index.ts` with a control-aware version (the matchers from Task 5 are unchanged). A c-block is a matched statement whose `def.shape === "c"`; after matching it, consume the body until `else`/`end`:

`parseStack` returns a `closedBy` discriminator (`"end" | "else" | "eof"`) so `parseCBlock` knows how its body closed without re-reading the line, and so the unterminated-c-block diagnostic fires only at EOF *inside* a c-block — never for the top-level stack reaching EOF (normal script end). A new hat stops the current stack without being consumed. `control_if` is promoted to `control_if_else` when an `else` follows.

```ts
export function parseScripts(source: string, file: string, knownVars: Set<string>): { scripts: ParsedScript[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ctx: ParseCtx = { file, knownVars, diagnostics };
  const lines = source.split("\n").map((raw, i) => ({ raw: raw.trim(), line: i + 1 })).filter((l) => l.raw.length > 0);
  let pos = 0;

  type Closed = "end" | "else" | "eof";

  // Collect statements until `end` (consumed), `else` (consumed), a new hat (not consumed), or EOF.
  function parseStack(): { blocks: ParsedBlock[]; closedBy: Closed } {
    const out: ParsedBlock[] = [];
    while (pos < lines.length) {
      const { raw, line } = lines[pos];
      if (raw === "end") { pos++; return { blocks: out, closedBy: "end" }; }
      if (raw === "else") { pos++; return { blocks: out, closedBy: "else" }; }
      const m = matchStatement(raw, line, ctx);
      if (!m) { diagnostics.push({ file, line, severity: "error", message: `unknown block "${raw}"` }); pos++; continue; }
      if (m.def.shape === "hat") return { blocks: out, closedBy: "eof" }; // new hat: stop, do not consume
      pos++;
      out.push(m.def.shape === "c" ? parseCBlock(m.def, m.block, line) : m.block);
    }
    return { blocks: out, closedBy: "eof" };
  }

  function parseCBlock(def: BlockDef, block: ParsedBlock, openLine: number): ParsedBlock {
    const firstSub = def.substacks?.[0] ?? "SUBSTACK";
    const r1 = parseStack();
    block.substacks[firstSub] = r1.blocks;
    if (r1.closedBy === "else") {
      if (block.opcode === "control_if") block.opcode = "control_if_else";
      const r2 = parseStack();
      block.substacks["SUBSTACK2"] = r2.blocks;
      if (r2.closedBy !== "end")
        diagnostics.push({ file, line: openLine, severity: "error", message: `c-block opened but no matching "end" before end of file` });
    } else if (r1.closedBy !== "end") {
      diagnostics.push({ file, line: openLine, severity: "error", message: `c-block opened but no matching "end" before end of file` });
    }
    return block;
  }

  const scripts: ParsedScript[] = [];
  while (pos < lines.length) {
    const { raw, line } = lines[pos];
    if (raw === "end" || raw === "else") { diagnostics.push({ file, line, severity: "error", message: `unexpected "${raw}"` }); pos++; continue; }
    const m = matchStatement(raw, line, ctx);
    if (!m || m.def.shape !== "hat") { diagnostics.push({ file, line, severity: "error", message: `script must start with a hat block, got "${raw}"` }); pos++; continue; }
    pos++;
    const r = parseStack();
    scripts.push({ blocks: [m.block, ...r.blocks] });
  }
  return { scripts, diagnostics };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/compiler/parser.test.ts`
Expected: PASS (Task 5 tests + the 5 new control tests).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser/index.ts tests/compiler/parser.test.ts
git commit -m "feat(compiler): parser control structures (if/else, repeat, repeat-until, forever, nesting)"
```

---

### Task 7: End-to-end — text → `.sb3` → headless VM on the full proving slice

Wire `knownVars` through the orchestrator and prove the whole grammar end-to-end: source folders compile and run, driving the slice's variables to their expected values. Plus a whole-project fixture.

**Files:**
- Modify: `src/compiler/index.ts` (build `knownVars` per target from own + global Stage variables; pass to `parseScripts`)
- Create: `tests/fixtures/grammar-src/project.yaml`
- Create: `tests/fixtures/grammar-src/cat.sprite.scratch`
- Test: `tests/compiler/grammar-e2e.test.ts`

**Interfaces:**
- Consumes: `parseScripts` (Tasks 5–6), `packageProject` (Task 3), `parseManifest` (existing), `runHeadless` (existing).

- [ ] **Step 1: Create the fixture**

```yaml
# tests/fixtures/grammar-src/project.yaml
name: Grammar
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
variables:
  global: { r: 0, b: 0, c: 0, m: 0, k: 0 }
```

```
# tests/fixtures/grammar-src/cat.sprite.scratch
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
set [m v] to ([abs v] of (-5))
if <<(1) < (2)> and <not <(3) < (1)>>> then
  set [k v] to (1)
end
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/compiler/grammar-e2e.test.ts
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

const dir = fileURLToPath(new URL("../fixtures/grammar-src", import.meta.url));

test("compiles the grammar fixture and runs it: r=7, b=9, c=5, m=5, k=1", async () => {
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("r"))).toBe(7);
  expect(Number(state.variable("b"))).toBe(9);
  expect(Number(state.variable("c"))).toBe(5);
  expect(Number(state.variable("m"))).toBe(5);
  expect(Number(state.variable("k"))).toBe(1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/compiler/grammar-e2e.test.ts`
Expected: FAIL initially — `knownVars` not yet wired (a bare `(c)` is mis-classified, or the compile errors).

- [ ] **Step 4: Wire `knownVars` in the orchestrator**

In `src/compiler/index.ts`, before parsing each target's source, build the in-scope variable name set (own + global Stage) and pass it:

```ts
const stage = project.targets.find((t) => t.isStage)!;
const globalNames = stage.variables.map((v) => v.name);
// ...for each target t with a sourceFile:
const knownVars = new Set<string>([...t.variables.map((v) => v.name), ...globalNames]);
const { scripts, diagnostics: pd } = parseScripts(src, t.sourceFile, knownVars);
```

- [ ] **Step 5: Run the test + full suite**

Run: `npx vitest run tests/compiler/grammar-e2e.test.ts`
Expected: PASS — `r=7, b=9, c=5, m=5, k=1` through the headless VM.
Run: `npx tsc --noEmit && npm test`
Expected: all compiler + editor tests green; output pristine apart from the known `vm warn No storage module present`.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/index.ts tests/fixtures/grammar-src tests/compiler/grammar-e2e.test.ts
git commit -m "feat(compiler): full-grammar text->.sb3->run e2e (r=7,b=9,c=5,m=5,k=1)"
```

---

## What this plan delivers

A compiler that parses the **full core scratchblocks grammar** — nested reporters, booleans, infix operators, dropdown menus (shadow-input and direct-field), and `if/else`/`repeat until`/`forever`/`repeat` — and compiles a multi-shape program to an `.sb3` that **runs correctly in a headless `scratch-vm`** (the fixture drives `r=7, b=9, c=5, m=5, k=1`), with the `BlockDef`/`InputSpec`/`FieldSpec` schema and the recursive-descent parser established for the per-category ultracode fan-out to extend by adding entries only.

## Follow-on plans (not in this document)

- **Block-dictionary build-out** — the full core palette by category. **← ultracode fan-out** (one agent per category: dictionary entries + per-block semantic tests + a completeness critic), plus the `extensions[]` population for Pen/Music.
- **Custom blocks (procedures)** — `define`, prototypes, calls, argument reporters, mutations, `warp` (two-pass parser).
- **Asset resolver** — CDN library index + fetch/cache + named-costume resolution (the placeholder generator stays the fallback).
- **MCP server** — wraps `compileProject` + the `ScratchEditor` bridge as stdio tools.

## Self-Review

- **Spec coverage:** `InputValue` growth ✓ (T1); `BlockDef`/`InputSpec`/`FieldSpec` extension ✓ (T1); proving-slice dictionary ✓ (T2); packager nested/boolean/variable/menu/two-substack encoding ✓ (T3, VM-proven); lexer ✓ (T4); recursive-descent parser core ✓ (T5); control structures + if/else promotion ✓ (T6); end-to-end text→run ✓ (T7); fail-loud throughout ✓ (T1/T3/T5/T6). Custom blocks, Pen/Music `extensions[]`, asset resolver, broadcasts, lists-as-inputs, unbracketed-infix are explicitly deferred (spec §7).
- **De-risk ordering:** the riskiest contract (extended encoding actually running in the VM) is Task 3 on hand-built IR, before the parser exists — mirroring the skeleton's gate.
- **Type consistency:** `InputValue` (T1) is produced by the parser (T5/T6) and consumed by the packager (T3); `BlockDef.substacks?: string[]` (T1) is read by the packager (T1/T3) and parser (T5/T6); `parseScripts(source, file, knownVars)` (T5) is called by the orchestrator (T7); `InputSpec`/`FieldSpec` kinds (T1) are emitted by the slice (T2) and consumed by the packager (T3) and parser matchers (T5).
- **Design rules baked into the code (so the implementer doesn't re-derive them):** (1) signatures use **named holes** (`(NUM1)`, `<OPERAND>`, `[OPERATOR v]`); reporter/boolean signatures carry no outer wrapping parens (T2). (2) The lexer disambiguates `<`/`>` by the **spacing rule** — space-adjacent ⇒ comparison-operator word, bracket-adjacent ⇒ boolean delimiter (T4). (3) A signature `[VARIABLE]` square hole matches **either** `[x]` (text) **or** `[x v]` (menu), so both the skeleton's variable convention and canonical scratchblocks bind to the field (T5). (4) `parseStack` returns a `closedBy` discriminator so the unterminated-c-block diagnostic fires only at EOF inside a c-block (T6). (5) `control_if` is promoted to `control_if_else` when an `else` follows (T6).
- **Carried-forward fact:** `tests/compiler/vm-harness.ts` already sets `vm.runtime.currentStepTime = 1000/30` (from the skeleton) — required for VM stepping to advance; all VM-runtime tests here depend on it.
- **Empirical safety net:** every parser/packager task is TDD with a headless-VM or structural assertion; the per-task review + the Task 3 and Task 7 VM gates catch any residual encoding/parse error in the reference code above.
