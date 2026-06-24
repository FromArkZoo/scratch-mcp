# Block-Dictionary Sub-project B — Per-Category Palette Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan is built for a **Workflow + git-worktree fan-out** (Tasks 3–13 run in parallel, one agent per category). Tasks 1–2 (shared prep) and Task 14 (audit + merge) are serial. Steps use checkbox (`- [ ]`) syntax for tracking. If executing manually, use superpowers:subagent-driven-development.

**Goal:** Add the entire core Scratch-3 default-palette (137 blocks, 11 categories, −custom blocks) as `BlockDef` entries against the frozen contract, every block proven to load+run in a headless `scratch-vm`.

**Architecture:** Two serial prep tasks harden the matcher and split the registry into per-category modules so the fan-out is conflict-free; then 11 parallel category tasks each add only their `categories/<cat>.ts` module + `tests/compiler/cat-<cat>.test.ts`; then a parity-audit + whole-branch review merges. B is entries-only except one additive contract delta (`dropdown.options?`) landed in prep.

**Tech Stack:** TypeScript (strict, ESM), Node ≥25, Vitest, `jszip`, headless `scratch-vm@5.0.300`. No new dependencies.

## Global Constraints

- Node ≥ 25; TypeScript `strict: true`; ESM; relative imports use `.js` extensions; no `any` outside the justified `scratch-vm`/JSON boundaries.
- **Fail loud, collect all:** every malformed construct is an `error` `Diagnostic`; `compileProject` returns `{ ok:false, diagnostics }` and **no `.sb3`** if any `error` fires. Never throw from the compiler; never emit a silently-broken project.
- **Frozen, do not change:** `compileProject`/`CompileResult`; the outer shapes of `ParsedBlock { opcode; inputs; fields; substacks }` / `ParsedScript`; `Diagnostic`; the manifest model; the variable/list/broadcast resolution rules and the `meta` envelope; the existing input-encoding paths in the packager; `ShadowType` stays `4|6|7|8|9|10`.
- **The only contract growth (additive, landed in Task 1):** `FieldSpec` `dropdown` gains optional `options?: string[]`; `BlockDef` gains optional `synthetic?: boolean`. No new `InputSpec`/`FieldSpec` *kinds*, no mutations, no packager-shape changes.
- **Entry encoding (how a `BlockDef` maps to Scratch-3):** a `number`/`text` input → `{ kind, shadowType }` (shadow `[1,[shadowType,value]]`); a `boolean` input → `{ kind:"boolean" }` (no shadow); a dropdown that references **dynamic project content** (sprites/costumes/backdrops/sounds/keys/clone-targets/sensing-objects) → a **menu input** `{ kind:"menu", menuOpcode, field, default }` (packager emits a shadow block of `menuOpcode` with `fields:{[field]:[value,null]}`); a dropdown with a **fixed inline option set** → a **field** `{ kind:"dropdown" }` (emits `[value,null]` on the block); a variable/list/broadcast reference → the matching `FieldSpec`. `number`/`text` InputSpecs carry **no default** — color (`shadowType 9`) inputs take an authored `#rrggbb` from source.
- **Shadow types:** 4 number · 6 positive-int · 7 integer · 8 angle · 9 color · 10 text. (Whole palette; no new types.)
- **Dual standard + floor:** Tier 1 = compile→headless VM→greenFlag→step→assert an observable VM-state effect. Tier 2 = assert the emitted `project.json` shape **and** that the `.sb3` loads + steps without throwing. **Every** entry is at least Tier 2.
- **Documented cosmetic compromises (valid runnable sb3; never silent):** `control_stop` omits the editor `hasnext` mutation (`shape:"stack"`, `STOP_OPTION` dropdown); music `NOTE` → number shadow (type 4); `switch costume/backdrop`/`play sound` reference the placeholder asset (runtime no-op); color inputs use `shadowType 9` + an authored hex.
- **Worktree isolation:** Tasks 3–13 each edit ONLY `src/compiler/blocks/categories/<cat>.ts` + `tests/compiler/cat-<cat>.test.ts`. No category task edits `registry.ts`, `registry.test.ts`, the parser, the packager, or another category's files.
- Gate policy: gate on `npx vitest run tests/compiler/` + `npx tsc --noEmit`. `tests/editor/launch.test.ts` flakes only under full-suite parallel load — re-run it in isolation rather than treating a parallel-load flake as a failure.

---

### Task 1: Registry split into per-category modules + skeleton-uniqueness guard

Move the 27 existing slice entries into 11 per-category modules, add the two additive type fields, and add a module-load skeleton-uniqueness assertion. Pure restructuring + guard: `SLICE` membership is unchanged, so the suite stays green. This makes the fan-out conflict-free and order-independent.

**Files:**
- Modify: `src/compiler/blocks/types.ts` (add `dropdown.options?`, `BlockDef.synthetic?`)
- Create: `src/compiler/blocks/categories/{motion,looks,sound,events,control,sensing,operators,variables,lists,pen,music}.ts` (11 files)
- Create: `src/compiler/blocks/skeleton.ts` (`skeletonKey`, `assertUniqueSkeletons`)
- Delete: `src/compiler/blocks/slice.ts` (entries moved)
- Modify: `src/compiler/blocks/registry.ts` (import + concat the 11 modules; run the assertion)
- Modify: `tests/compiler/registry.test.ts` (replace the brittle 27-opcode enumeration with scalable invariants)
- Create: `tests/compiler/skeleton.test.ts`

**Interfaces:**
- Produces (consumed everywhere): `SLICE` = concat of the 11 category arrays (`MOTION`, `LOOKS`, `SOUND`, `EVENTS`, `CONTROL`, `SENSING`, `OPERATORS`, `VARIABLES`, `LISTS`, `PEN`, `MUSIC`); `byOpcode`/`bySignature` unchanged; `skeletonKey(def): string`; `assertUniqueSkeletons(defs): void`; `FieldSpec` dropdown `options?: string[]`; `BlockDef.synthetic?: boolean`.

- [ ] **Step 1: Grow the two additive type fields**

In `src/compiler/blocks/types.ts`, change the `dropdown` member of `FieldSpec` and add `synthetic?` to `BlockDef`:

```ts
export type FieldSpec =
  | { kind: "variable" }                                                      // resolves to [name, id]
  | { kind: "broadcast" }                                                     // resolves to [name, broadcastId]
  | { kind: "list" }                                                          // resolves to [name, listId]
  | { kind: "dropdown"; options?: string[] };                                 // option string stored on the block; options[] = disambiguation + fail-loud validation

export interface BlockDef {
  signature: string;
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substacks?: string[];
  synthetic?: boolean;             // constructed dynamically (control_if_else); excluded from source-line matching
}
```

- [ ] **Step 2: Create the 11 category modules with the moved slice entries**

Create each file. The 27 existing entries distribute as below (verbatim from the old `slice.ts`; `control_if_else` gains `synthetic: true`). Empty categories still get a typed export.

`src/compiler/blocks/categories/motion.ts`:

```ts
import type { BlockDef } from "../types.js";

export const MOTION: BlockDef[] = [
  { signature: "move (STEPS) steps", opcode: "motion_movesteps", shape: "stack",
    inputs: { STEPS: { kind: "number", shadowType: 4 } } },
  { signature: "turn right (DEGREES) degrees", opcode: "motion_turnright", shape: "stack",
    inputs: { DEGREES: { kind: "number", shadowType: 4 } } },
  { signature: "go to [TO v]", opcode: "motion_goto", shape: "stack",
    inputs: { TO: { kind: "menu", menuOpcode: "motion_goto_menu", field: "TO", default: "_random_" } } },
];
```

`src/compiler/blocks/categories/looks.ts`:

```ts
import type { BlockDef } from "../types.js";

export const LOOKS: BlockDef[] = [];
```

`src/compiler/blocks/categories/sound.ts`:

```ts
import type { BlockDef } from "../types.js";

export const SOUND: BlockDef[] = [];
```

`src/compiler/blocks/categories/events.ts`:

```ts
import type { BlockDef } from "../types.js";

export const EVENTS: BlockDef[] = [
  { signature: "when green flag clicked", opcode: "event_whenflagclicked", shape: "hat" },
  { signature: "broadcast [BROADCAST_INPUT v]", opcode: "event_broadcast", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "broadcast [BROADCAST_INPUT v] and wait", opcode: "event_broadcastandwait", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "when I receive [BROADCAST_OPTION v]", opcode: "event_whenbroadcastreceived", shape: "hat",
    fields: { BROADCAST_OPTION: { kind: "broadcast" } } },
];
```

`src/compiler/blocks/categories/control.ts`:

```ts
import type { BlockDef } from "../types.js";

export const CONTROL: BlockDef[] = [
  { signature: "repeat (TIMES)", opcode: "control_repeat", shape: "c",
    inputs: { TIMES: { kind: "number", shadowType: 6 } }, substacks: ["SUBSTACK"] },
  { signature: "if <CONDITION> then", opcode: "control_if", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "if <CONDITION> then else", opcode: "control_if_else", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK", "SUBSTACK2"], synthetic: true },
  { signature: "repeat until <CONDITION>", opcode: "control_repeat_until", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "forever", opcode: "control_forever", shape: "c", substacks: ["SUBSTACK"] },
];
```

`src/compiler/blocks/categories/sensing.ts`:

```ts
import type { BlockDef } from "../types.js";

export const SENSING: BlockDef[] = [];
```

`src/compiler/blocks/categories/operators.ts`:

```ts
import type { BlockDef } from "../types.js";

export const OPERATORS: BlockDef[] = [
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
];
```

`src/compiler/blocks/categories/variables.ts`:

```ts
import type { BlockDef } from "../types.js";

export const VARIABLES: BlockDef[] = [
  { signature: "set [VARIABLE] to (VALUE)", opcode: "data_setvariableto", shape: "stack",
    inputs: { VALUE: { kind: "text", shadowType: 10 } }, fields: { VARIABLE: { kind: "variable" } } },
  { signature: "change [VARIABLE] by (VALUE)", opcode: "data_changevariableby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } }, fields: { VARIABLE: { kind: "variable" } } },
];
```

`src/compiler/blocks/categories/lists.ts`:

```ts
import type { BlockDef } from "../types.js";

export const LISTS: BlockDef[] = [
  { signature: "add [ITEM] to [LIST v]", opcode: "data_addtolist", shape: "stack",
    inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "item (INDEX) of [LIST v]", opcode: "data_itemoflist", shape: "reporter",
    inputs: { INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
];
```

`src/compiler/blocks/categories/pen.ts`:

```ts
import type { BlockDef } from "../types.js";

export const PEN: BlockDef[] = [
  { signature: "erase all", opcode: "pen_clear", shape: "stack" },
];
```

`src/compiler/blocks/categories/music.ts`:

```ts
import type { BlockDef } from "../types.js";

export const MUSIC: BlockDef[] = [
  { signature: "rest for (BEATS) beats", opcode: "music_restForBeats", shape: "stack",
    inputs: { BEATS: { kind: "number", shadowType: 4 } } },
];
```

- [ ] **Step 3: Write the skeleton-uniqueness module**

Create `src/compiler/blocks/skeleton.ts`:

```ts
import type { BlockDef } from "./types.js";

// Mirror parser/index.ts sigTokens: detect holes, erase hole NAMES, keep hole SHAPES + literal words.
const HOLE_RE = /\(([A-Z0-9_]*)\)|\[([A-Z0-9_]+) v\]|\[([A-Z0-9_]*)\]|<([A-Z0-9_]*)>|(\S+)/g;

function skeleton(sig: string): string {
  const toks: string[] = [];
  HOLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HOLE_RE.exec(sig))) {
    if (m[1] !== undefined && sig[m.index] === "(") toks.push("(R)");
    else if (m[2] !== undefined) toks.push("[M]");
    else if (m[3] !== undefined && sig[m.index] === "[") toks.push("[S]");
    else if (m[4] !== undefined && sig[m.index] === "<") toks.push("<B>");
    else toks.push("w:" + m[5]);
  }
  return toks.join(" ");
}

// matchStatement pools all non-reporter/boolean shapes together; matchGroups separates reporter vs boolean.
const pool = (shape: BlockDef["shape"]): string =>
  shape === "reporter" ? "REPORTER" : shape === "boolean" ? "BOOLEAN" : "STATEMENT";

// Sorted option-sets of dropdown fields — two otherwise-identical skeletons with disjoint option sets are NOT duplicates.
function optionsKey(def: BlockDef): string {
  const sets: string[] = [];
  for (const f of Object.values(def.fields ?? {}))
    if (f.kind === "dropdown" && f.options) sets.push([...f.options].sort().join(","));
  return sets.sort().join("|");
}

export function skeletonKey(def: BlockDef): string {
  return `${pool(def.shape)}::${skeleton(def.signature)}::${optionsKey(def)}`;
}

/** Throw if any two non-synthetic defs share a skeleton key (would make one unreachable under the positional matcher). */
export function assertUniqueSkeletons(defs: BlockDef[]): void {
  const seen = new Map<string, string>();
  for (const def of defs) {
    if (def.synthetic) continue;
    const k = skeletonKey(def);
    const prev = seen.get(k);
    if (prev) throw new Error(`block-dictionary skeleton collision: "${def.signature}" (${def.opcode}) collides with ${prev} — key=${k}`);
    seen.set(k, `"${def.signature}" (${def.opcode})`);
  }
}
```

- [ ] **Step 4: Rewrite `registry.ts` to concat the modules + run the guard**

Replace the entire contents of `src/compiler/blocks/registry.ts`:

```ts
import type { BlockDef } from "./types.js";
import { assertUniqueSkeletons } from "./skeleton.js";
import { MOTION } from "./categories/motion.js";
import { LOOKS } from "./categories/looks.js";
import { SOUND } from "./categories/sound.js";
import { EVENTS } from "./categories/events.js";
import { CONTROL } from "./categories/control.js";
import { SENSING } from "./categories/sensing.js";
import { OPERATORS } from "./categories/operators.js";
import { VARIABLES } from "./categories/variables.js";
import { LISTS } from "./categories/lists.js";
import { PEN } from "./categories/pen.js";
import { MUSIC } from "./categories/music.js";

export const SLICE: BlockDef[] = [
  ...MOTION, ...LOOKS, ...SOUND, ...EVENTS, ...CONTROL, ...SENSING,
  ...OPERATORS, ...VARIABLES, ...LISTS, ...PEN, ...MUSIC,
];

// Order-independence guard: throws at import if any two non-synthetic signatures share a skeleton.
assertUniqueSkeletons(SLICE);

export const byOpcode = new Map<string, BlockDef>(SLICE.map((d) => [d.opcode, d]));
export const bySignature = new Map<string, BlockDef>(SLICE.map((d) => [d.signature, d]));
```

Then delete `src/compiler/blocks/slice.ts`.

- [ ] **Step 5: Replace the brittle opcode-enumeration test with scalable invariants**

In `tests/compiler/registry.test.ts`, replace the first test (`"slice covers the expected opcodes"`) — keep all the other tests unchanged:

```ts
test("registry has unique opcodes and survives the per-category split", () => {
  const opcodes = SLICE.map((d) => d.opcode);
  expect(new Set(opcodes).size).toBe(opcodes.length);           // no duplicate opcodes
  // assertUniqueSkeletons runs at import; importing registry without a throw proves no skeleton collisions.
  for (const op of ["motion_movesteps", "motion_goto", "control_if_else", "event_broadcast", "data_addtolist", "operator_mathop", "pen_clear", "music_restForBeats"])
    expect(byOpcode.has(op)).toBe(true);
});
```

(Per-category opcode coverage is asserted by each category's own test; the full count is asserted in Task 14.)

- [ ] **Step 6: Write the skeleton tests**

Create `tests/compiler/skeleton.test.ts`:

```ts
import { expect, test } from "vitest";
import { assertUniqueSkeletons, skeletonKey } from "../../src/compiler/blocks/skeleton.js";
import type { BlockDef } from "../../src/compiler/blocks/types.js";

test("two identical-skeleton statement defs collide", () => {
  const a: BlockDef = { signature: "set [E v] effect to (V)", opcode: "a", shape: "stack", fields: { E: { kind: "dropdown" } } };
  const b: BlockDef = { signature: "set [E v] effect to (V)", opcode: "b", shape: "stack", fields: { E: { kind: "dropdown" } } };
  expect(() => assertUniqueSkeletons([a, b])).toThrow(/collision/);
});

test("options-distinguished dropdowns do NOT collide", () => {
  const a: BlockDef = { signature: "set [E v] effect to (V)", opcode: "a", shape: "stack", fields: { E: { kind: "dropdown", options: ["color", "ghost"] } } };
  const b: BlockDef = { signature: "set [E v] effect to (V)", opcode: "b", shape: "stack", fields: { E: { kind: "dropdown", options: ["pitch", "pan"] } } };
  expect(() => assertUniqueSkeletons([a, b])).not.toThrow();
  expect(skeletonKey(a)).not.toBe(skeletonKey(b));
});

test("same text in different pools does not collide (reporter vs statement)", () => {
  const a: BlockDef = { signature: "size", opcode: "looks_size", shape: "reporter" };
  const b: BlockDef = { signature: "size", opcode: "x_size", shape: "stack" };
  expect(() => assertUniqueSkeletons([a, b])).not.toThrow();
});

test("synthetic defs are skipped by the guard", () => {
  const a: BlockDef = { signature: "if <C> then else", opcode: "control_if_else", shape: "c", synthetic: true };
  const b: BlockDef = { signature: "if <C> then else", opcode: "dup", shape: "c", synthetic: true };
  expect(() => assertUniqueSkeletons([a, b])).not.toThrow();
});
```

- [ ] **Step 7: Run the tests + typecheck + suite**

Run: `npx vitest run tests/compiler/skeleton.test.ts tests/compiler/registry.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: clean.
Run: `npx vitest run tests/compiler/`
Expected: all green (the split changed no `SLICE` membership; every existing test still passes). Output pristine apart from the known `vm warn No storage module present`.

- [ ] **Step 8: Commit**

```bash
git add src/compiler/blocks tests/compiler/registry.test.ts tests/compiler/skeleton.test.ts
git rm src/compiler/blocks/slice.ts
git commit -m "refactor(compiler): split registry into per-category modules + skeleton-uniqueness guard (B prep)"
```

---

### Task 2: Matcher / lexer / parser hardening + `options` tiebreak + anchor entries + VM-harness extension

Make the matcher option-set-aware (so the looks/sound effect blocks coexist), exclude the `control_if_else` sentinel from source-matching, fix the `]` lexer gap and the zero-arg-reporter reachability gap, add the 5 anchor entries that exercise these mechanisms, and extend the test harness with the target/runtime observables the fan-out's Tier-1 tests need. After this task the contract is re-frozen.

**Files:**
- Modify: `src/compiler/parser/index.ts` (filter synthetic from `SIGS`; `optionsOk` tiebreak in both matchers; zero-arg-reporter lookup in `parseRound`)
- Modify: `src/compiler/parser/lexer.ts` (`]` as its own token + stop-set)
- Modify: `src/compiler/blocks/categories/motion.ts` (anchor: `motion_direction`)
- Modify: `src/compiler/blocks/categories/looks.ts` (anchors: `looks_changeeffectby`, `looks_seteffectto` — with `options`)
- Modify: `src/compiler/blocks/categories/sound.ts` (anchors: `sound_changeeffectby`, `sound_seteffectto` — with `options`)
- Modify: `tests/compiler/vm-harness.ts` (add `target()`, `stage()`, `cloneCount()`, `runtime()`)
- Create: `tests/compiler/hardening.test.ts`

**Interfaces:**
- Consumes: `SLICE`/`byOpcode`, `parseScripts`, `tokenizeLine`, `compileProject`, `runHeadless`.
- Produces: a matcher that (a) never matches a `synthetic` def from source, (b) on a dropdown with `options` accepts only when the authored value ∈ options (else tries the next def), (c) resolves a bare single-word zero-arg reporter `(name)` to its reporter block. The lexer treats `]` as its own token. `runHeadless` returns `{ variable, spriteX, target, stage, cloneCount, runtime }`. The 5 anchor entries exist (so the Looks/Sound/Motion category tasks must NOT re-add them).

- [ ] **Step 1: Write the failing tests**

Create `tests/compiler/hardening.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseScripts } from "../../src/compiler/parser/index.js";
import { tokenizeLine } from "../../src/compiler/parser/lexer.js";
import type { InputValue } from "../../src/compiler/types.js";

const parse = (lines: string[], vars: string[] = []) =>
  parseScripts(["when green flag clicked", ...lines].join("\n"), "f", new Set(vars), new Set());

test("effect block disambiguates by dropdown option: color→looks, pitch→sound", () => {
  const r = parse(["set [color v] effect to (25)", "set [pitch v] effect to (100)"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(r.scripts[0].blocks[1].opcode).toBe("looks_seteffectto");
  expect(r.scripts[0].blocks[2].opcode).toBe("sound_seteffectto");
});

test("change-effect disambiguates too (skeleton-identical, options differ)", () => {
  const r = parse(["change [ghost v] effect by (10)", "change [pan v] effect by (-5)"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(r.scripts[0].blocks[1].opcode).toBe("looks_changeeffectby");
  expect(r.scripts[0].blocks[2].opcode).toBe("sound_changeeffectby");
});

test("an unknown effect option fails loud (no silent match)", () => {
  const r = parse(["set [gloop v] effect to (5)"]);
  expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
});

test("a single-line 'if <c> then else' does not match the synthetic control_if_else", () => {
  const r = parse(["if <(1) = (1)> then else"]);
  expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
  expect(r.scripts[0].blocks.map((b) => b.opcode)).not.toContain("control_if_else");
});

test("the two-line if/else idiom still builds control_if_else", () => {
  const r = parse(["if <(1) = (1)> then", "set [x v] to (1)", "else", "set [x v] to (2)", "end"], ["x"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(r.scripts[0].blocks[1].opcode).toBe("control_if_else");
});

test("a stray ] is its own token, not glued onto the previous word", () => {
  expect(tokenizeLine("foo] bar").map((t) => (t.t === "word" ? t.v : t.t))).toEqual(["foo", "]", "bar"]);
});

test("a bare (direction) parses as the motion_direction reporter, not a literal", () => {
  const r = parse(["set [d v] to (direction)"], ["d"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const value = r.scripts[0].blocks[1].inputs.VALUE as InputValue;
  expect(value.kind).toBe("block");
  expect(value.kind === "block" && value.block.opcode).toBe("motion_direction");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/compiler/hardening.test.ts`
Expected: FAIL — anchors don't exist yet; both effect opcodes collide (one unreachable); `control_if_else` matches a single line; `]` glues onto `foo`; `(direction)` is a literal.

- [ ] **Step 3: Add the 5 anchor entries**

Append to `MOTION` in `src/compiler/blocks/categories/motion.ts`:

```ts
  { signature: "direction", opcode: "motion_direction", shape: "reporter" },
```

Append to `LOOKS` in `src/compiler/blocks/categories/looks.ts` (the effect blocks — they carry `options`; the Looks category task adds the rest):

```ts
  { signature: "change [EFFECT v] effect by (CHANGE)", opcode: "looks_changeeffectby", shape: "stack",
    inputs: { CHANGE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"] } } },
  { signature: "set [EFFECT v] effect to (VALUE)", opcode: "looks_seteffectto", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"] } } },
```

Append to `SOUND` in `src/compiler/blocks/categories/sound.ts`:

```ts
  { signature: "change [EFFECT v] effect by (VALUE)", opcode: "sound_changeeffectby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["pitch", "pan"] } } },
  { signature: "set [EFFECT v] effect to (VALUE)", opcode: "sound_seteffectto", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["pitch", "pan"] } } },
```

- [ ] **Step 4: Harden the parser (`src/compiler/parser/index.ts`)**

(a) Exclude `synthetic` defs from the match table. Change the `SIGS` builder:

```ts
const SIGS: { def: BlockDef; toks: SigTok[] }[] = SLICE.filter((def) => !def.synthetic).map((def) => ({ def, toks: sigTokens(def.signature) }));
```

(b) Add a zero-arg-reporter table after `SIGS` (a reporter whose signature is all literal words):

```ts
const ZERO_ARG_REPORTERS = new Map<string, BlockDef>(
  SLICE.filter((d) => d.shape === "reporter" && sigTokens(d.signature).every((t) => "lit" in t))
       .map((d) => [d.signature, d]),
);
```

(c) Add the option-set tiebreak helper just above `matchGroups`:

```ts
/** A dropdown field carrying `options` matches only when the authored value is in the set (disambiguates same-skeleton defs). */
function optionsOk(def: BlockDef, block: ParsedBlock): boolean {
  for (const [nm, fspec] of Object.entries(def.fields ?? {}))
    if (fspec.kind === "dropdown" && fspec.options && !fspec.options.includes(block.fields[nm] ?? ""))
      return false;
  return true;
}
```

(d) In `matchGroups`, gate the success return on `optionsOk`. Change `return block;` (the line after the `for` loop that fills the block) to:

```ts
    if (!optionsOk(def, block)) continue outer;
    return block;
```

(e) In `matchStatement`, gate the success return likewise. Change `return { def, block };` to:

```ts
    if (!optionsOk(def, block)) continue outer;
    return { def, block };
```

(f) In `parseRound`, resolve a bare single-word zero-arg reporter before the lenient literal. Replace the line `if (gs.length === 1) return { kind: "literal", value: w };` with:

```ts
      if (gs.length === 1) {
        const zr = ZERO_ARG_REPORTERS.get(w);
        if (zr) return { kind: "block", block: { opcode: zr.opcode, inputs: {}, fields: {}, substacks: {} } };
        return { kind: "literal", value: w };
      }
```

(Precedence is preserved: numeric → knownVars → knownLists → zero-arg reporter → lenient literal. A user variable named `timer` still wins because the `knownVars` check runs first.)

- [ ] **Step 5: Harden the lexer (`src/compiler/parser/lexer.ts`)**

Add an explicit `]` branch in the outer dispatch (right after the `if (ch === "[")` block, before the bare-word run) and add `]` to the bare-word stop-set:

```ts
    if (ch === "]") { out.push({ t: "word", v: "]" }); i++; continue; }
    // a bare word: run until whitespace or a structural char
    let j = i;
    while (j < s.length && !" \t()<>[]".includes(s[j])) j++;
```

(Without the explicit `]` branch, adding `]` to the stop-set alone would spin on a literal `]`. With both, `foo]bar` tokenizes as `foo | ] | bar`.)

- [ ] **Step 6: Extend the VM harness (`tests/compiler/vm-harness.ts`)**

Replace the returned object so tests can read full target + runtime state (the existing `variable`/`spriteX` are unchanged):

```ts
  const targets: any[] = vm.runtime.targets;
  const all = targets.flatMap((t) => Object.values(t.variables ?? {}));
  const find = (name: string) => targets.find((t) => t.sprite?.name === name || t.getName?.() === name);
  return {
    variable(name: string) { return (all.find((v: any) => v.name === name) as any)?.value; },
    spriteX(name: string) { return (find(name) as any)?.x; },
    target(name: string) { return find(name); },          // .x/.y/.direction/.size/.visible/.draggable/.currentCostume/.volume/.rotationStyle/.effects
    stage() { return targets.find((t) => t.isStage); },
    cloneCount() { return targets.length; },               // read after stepping → includes clones
    runtime() { return vm.runtime; },                      // .threads, .ioDevices, .targets
  };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/compiler/hardening.test.ts`
Expected: PASS (7 tests).
Run: `npx tsc --noEmit`
Expected: clean.
Run: `npx vitest run tests/compiler/`
Expected: all green (no regression — `grammar-e2e`/`parser` prove the two-line if/else still works; `registry`/`skeleton` green; the anchors carry `options` so the skeleton guard passes).

- [ ] **Step 8: Commit**

```bash
git add src/compiler/parser/index.ts src/compiler/parser/lexer.ts src/compiler/blocks/categories/motion.ts src/compiler/blocks/categories/looks.ts src/compiler/blocks/categories/sound.ts tests/compiler/vm-harness.ts tests/compiler/hardening.test.ts
git commit -m "feat(compiler): matcher options tiebreak + synthetic exclusion + lexer ']' + zero-arg reporters + anchors (B prep, contract re-frozen)"
```

---

## Category Task Recipe (Tasks 3–13)

Every category task is the same shape: **append `BlockDef` entries to one category module, write one test file, gate on the VM.** Read this once; each task below gives only its entries + its test-spec.

**Worktree isolation.** Each category task runs in its own git worktree branched off the post-Task-2 `main`. It edits **exactly two files**: `src/compiler/blocks/categories/<file>.ts` (append to the existing exported array — never touch the import line, other entries, or `registry.ts`) and `tests/compiler/cat-<file>.test.ts` (new). The `registry.ts` spread (`...LOOKS`) picks up appended entries automatically. The skeleton guard runs at import; if you introduce an intra-category collision it throws immediately.

**The category test file.** Create `tests/compiler/cat-<file>.test.ts` with this header (adjust the YAML's `name`, and add any sprite vars your probes set), then one test per the patterns below:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

async function projectDir(scratch: string, yamlExtra = ""): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cat-"));
  const yaml = [
    "name: C", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
    "variables:", "  global: { v: 0, n: 0 }",
    ...(yamlExtra ? [yamlExtra] : []),
  ].join("\n");
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const script = (...lines: string[]) => ["when green flag clicked", ...lines].join("\n");
```

**Pattern T1 — runtime assert (one per Tier-1 block).** Compile a minimal script using the block, run it, assert the observable. Two shapes:

```ts
// T1a — observable is a target property:
test("motion_setx: set x to 42 moves the sprite", async () => {
  const res = await compileProject(await projectDir(script("set x to (42)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const state = await runHeadless(res.sb3!);
  expect(state.target("Cat").x).toBe(42);
});

// T1b — observable is a reporter → capture it into a variable, then read the variable:
test("motion_xposition: reads the sprite's x", async () => {
  const res = await compileProject(await projectDir(script("set x to (7)", "set [v v] to (x position)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("v"))).toBe(7);
});
```

Useful observables on `state.target("Cat")`: `.x .y .direction .size .visible .draggable .currentCostume .volume .rotationStyle .effects` (e.g. `.effects.color`). `state.stage()` for backdrop/stage state, `state.cloneCount()` for clone blocks, `state.runtime().threads` for `stop`/`wait`. For boolean reporters, capture via `if <…> then { set [v v] to (1) }`.

**Pattern T2 — structural + loads-and-runs (one per Tier-2 block).** Assert the emitted JSON shape and that the `.sb3` loads/steps:

```ts
test("looks_switchcostumeto: emits a looks_costume menu shadow and loads", async () => {
  const res = await compileProject(await projectDir(script("switch costume to [costume2 v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "looks_switchcostumeto")).toBe(true);
  expect(blocks.some((b) => b.opcode === "looks_costume" && b.shadow === true)).toBe(true);  // the menu shadow
  await runHeadless(res.sb3!);  // loads + steps without throwing
});
```

For a Tier-2 **field** dropdown (no shadow), assert the field instead: `expect(theBlock.fields.FRONT_BACK).toEqual(["front", null])`.

**Pattern F — the category floor (exactly one).** Compile a single script that uses **every** entry your task added (chain the stack blocks; drop reporters/booleans into a `set [v v] to (…)` or an `if`), assert `res.ok`, and assert `runHeadless` loads+steps without throwing. This is the hard floor — every entry proves it loads in a real VM. Use real-looking menu/dropdown values; for asset menus any name is fine (resolves to the placeholder).

**Per-block menus/defaults are VM-gated.** The entries below carry the best-known `menuOpcode`/`field`/`default`. If a Tier-2 loads-and-runs test throws on load, the menu opcode/shadow is wrong — correct it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js` (search the opcode) and re-run. A throw on load is the signal; never weaken the test to make it pass.

**TDD rhythm per task:** (1) write the entries; (2) write the test file (T1×each Tier-1, T2×each Tier-2, F×1); (3) `npx vitest run tests/compiler/cat-<file>.test.ts` — iterate to green (a load throw ⇒ fix the menu opcode); (4) `npx tsc --noEmit` clean + `npx vitest run tests/compiler/` green; (5) commit `feat(compiler): <Category> palette entries + tests (B)`.

---

### Task 3: Motion palette (14 entries — 11 Tier-1, 3 Tier-2)

Follow the **Category Task Recipe**. The `motion_direction` anchor entry is already present from Task 2 — do NOT re-add it.

**Files:**
- Modify: `src/compiler/blocks/categories/motion.ts` (append 14 entries to the `MOTION` array)
- Test: `tests/compiler/cat-motion.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `MOTION` array already exists (Task 1). Produces 14 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `MOTION` array in `src/compiler/blocks/categories/motion.ts`:

```ts
  { signature: "turn left (DEGREES) degrees", opcode: "motion_turnleft", shape: "stack", inputs: { DEGREES: { kind: "number", shadowType: 4 } } },
  { signature: "point in direction (DIRECTION)", opcode: "motion_pointindirection", shape: "stack", inputs: { DIRECTION: { kind: "number", shadowType: 8 } } },
  { signature: "point towards [TOWARDS v]", opcode: "motion_pointtowards", shape: "stack", inputs: { TOWARDS: { kind: "menu", menuOpcode: "motion_pointtowards_menu", field: "TOWARDS", default: "_mouse_" } } },
  { signature: "go to x: (X) y: (Y)", opcode: "motion_gotoxy", shape: "stack", inputs: { X: { kind: "number", shadowType: 4 }, Y: { kind: "number", shadowType: 4 } } },
  { signature: "glide (SECS) secs to x: (X) y: (Y)", opcode: "motion_glidesecstoxy", shape: "stack", inputs: { SECS: { kind: "number", shadowType: 4 }, X: { kind: "number", shadowType: 4 }, Y: { kind: "number", shadowType: 4 } } },
  { signature: "glide (SECS) secs to [TO v]", opcode: "motion_glideto", shape: "stack", inputs: { SECS: { kind: "number", shadowType: 4 }, TO: { kind: "menu", menuOpcode: "motion_glideto_menu", field: "TO", default: "_random_" } } },
  { signature: "change x by (DX)", opcode: "motion_changexby", shape: "stack", inputs: { DX: { kind: "number", shadowType: 4 } } },
  { signature: "set x to (X)", opcode: "motion_setx", shape: "stack", inputs: { X: { kind: "number", shadowType: 4 } } },
  { signature: "change y by (DY)", opcode: "motion_changeyby", shape: "stack", inputs: { DY: { kind: "number", shadowType: 4 } } },
  { signature: "set y to (Y)", opcode: "motion_sety", shape: "stack", inputs: { Y: { kind: "number", shadowType: 4 } } },
  { signature: "if on edge, bounce", opcode: "motion_ifonedgebounce", shape: "stack" },
  { signature: "set rotation style [STYLE v]", opcode: "motion_setrotationstyle", shape: "stack", fields: { STYLE: { kind: "dropdown" } } },
  { signature: "x position", opcode: "motion_xposition", shape: "reporter" },
  { signature: "y position", opcode: "motion_yposition", shape: "reporter" },
```

- [ ] **Step 2: Write `tests/compiler/cat-motion.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Motion entry.

Tier-1 runtime probes (Pattern T1):

- `turn left (DEGREES) degrees` (motion_turnleft) — From direction 90, turn left 90 -> assert target.direction === 0 wraps to Scratch range (-90 == 0? actually 0); generally assert target.direction decreased by DEGREES modulo Scratch wrap.
- `point in direction (DIRECTION)` (motion_pointindirection) — point in direction 90 -> assert target.direction === 90.
- `go to x: (X) y: (Y)` (motion_gotoxy) — go to x:10 y:20 -> assert target.x === 10 && target.y === 20.
- `glide (SECS) secs to x: (X) y: (Y)` (motion_glidesecstoxy) — glide 0 secs to x:5 y:5 (duration<=0 snaps) -> assert target.x===5 && target.y===5; or step until thread done for SECS>0 then assert final position.
- `change x by (DX)` (motion_changexby) — From x=0, change x by 10 -> assert target.x === 10 (and target.y unchanged).
- `set x to (X)` (motion_setx) — set x to 42 -> assert target.x === 42.
- `change y by (DY)` (motion_changeyby) — From y=0, change y by 10 -> assert target.y === 10 (and target.x unchanged).
- `set y to (Y)` (motion_sety) — set y to 42 -> assert target.y === 42.
- `set rotation style [STYLE v]` (motion_setrotationstyle) — set rotation style [left-right] -> assert target.rotationStyle === 'left-right'.
- `x position` (motion_xposition) — set sprite x to 7, then run 'set [v] to (x position)' -> assert variable v === 7.
- `y position` (motion_yposition) — set sprite y to 7, then 'set [v] to (y position)' -> assert variable v === 7.

Tier-2 structural + loads-and-runs (Pattern T2):

- `point towards [TOWARDS v]` (motion_pointtowards) — TOWARDS→menu motion_pointtowards_menu
- `glide (SECS) secs to [TO v]` (motion_glideto) — TO→menu motion_glideto_menu
- `if on edge, bounce` (motion_ifonedgebounce) — no menu/dropdown

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-motion.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/motion.ts tests/compiler/cat-motion.test.ts
git commit -m "feat(compiler): Motion palette entries + per-block tests (B)"
```

---

### Task 4: Looks palette (19 entries — 10 Tier-1, 9 Tier-2)

Follow the **Category Task Recipe**. The 2 effect anchor entries (`looks_seteffectto`, `looks_changeeffectby`) are already present from Task 2 — do NOT re-add them.

**Files:**
- Modify: `src/compiler/blocks/categories/looks.ts` (append 19 entries to the `LOOKS` array)
- Test: `tests/compiler/cat-looks.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `LOOKS` array already exists (Task 1). Produces 19 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `LOOKS` array in `src/compiler/blocks/categories/looks.ts`:

```ts
  { signature: "say (MESSAGE) for (SECS) seconds", opcode: "looks_sayforsecs", shape: "stack", inputs: { MESSAGE: { kind: "text", shadowType: 10 }, SECS: { kind: "number", shadowType: 4 } } },
  { signature: "say (MESSAGE)", opcode: "looks_say", shape: "stack", inputs: { MESSAGE: { kind: "text", shadowType: 10 } } },
  { signature: "think (MESSAGE) for (SECS) seconds", opcode: "looks_thinkforsecs", shape: "stack", inputs: { MESSAGE: { kind: "text", shadowType: 10 }, SECS: { kind: "number", shadowType: 4 } } },
  { signature: "think (MESSAGE)", opcode: "looks_think", shape: "stack", inputs: { MESSAGE: { kind: "text", shadowType: 10 } } },
  { signature: "switch costume to [COSTUME v]", opcode: "looks_switchcostumeto", shape: "stack", inputs: { COSTUME: { kind: "menu", menuOpcode: "looks_costume", field: "COSTUME", default: "costume1" } } },
  { signature: "next costume", opcode: "looks_nextcostume", shape: "stack" },
  { signature: "switch backdrop to [BACKDROP v]", opcode: "looks_switchbackdropto", shape: "stack", inputs: { BACKDROP: { kind: "menu", menuOpcode: "looks_backdrops", field: "BACKDROP", default: "backdrop1" } } },
  { signature: "switch backdrop to [BACKDROP v] and wait", opcode: "looks_switchbackdroptoandwait", shape: "stack", inputs: { BACKDROP: { kind: "menu", menuOpcode: "looks_backdrops", field: "BACKDROP", default: "backdrop1" } } },
  { signature: "next backdrop", opcode: "looks_nextbackdrop", shape: "stack" },
  { signature: "clear graphic effects", opcode: "looks_cleargraphiceffects", shape: "stack" },
  { signature: "change size by (CHANGE)", opcode: "looks_changesizeby", shape: "stack", inputs: { CHANGE: { kind: "number", shadowType: 4 } } },
  { signature: "set size to (SIZE) %", opcode: "looks_setsizeto", shape: "stack", inputs: { SIZE: { kind: "number", shadowType: 4 } } },
  { signature: "show", opcode: "looks_show", shape: "stack" },
  { signature: "hide", opcode: "looks_hide", shape: "stack" },
  { signature: "go to [FRONT_BACK v] layer", opcode: "looks_gotofrontback", shape: "stack", fields: { FRONT_BACK: { kind: "dropdown" } } },
  { signature: "go [FORWARD_BACKWARD v] (NUM) layers", opcode: "looks_goforwardbackwardlayers", shape: "stack", inputs: { NUM: { kind: "number", shadowType: 7 } }, fields: { FORWARD_BACKWARD: { kind: "dropdown" } } },
  { signature: "costume [NUMBER_NAME v]", opcode: "looks_costumenumbername", shape: "reporter", fields: { NUMBER_NAME: { kind: "dropdown" } } },
  { signature: "backdrop [NUMBER_NAME v]", opcode: "looks_backdropnumbername", shape: "reporter", fields: { NUMBER_NAME: { kind: "dropdown" } } },
  { signature: "size", opcode: "looks_size", shape: "reporter" },
```

- [ ] **Step 2: Write `tests/compiler/cat-looks.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Looks entry.

Tier-1 runtime probes (Pattern T1):

- `next costume` (looks_nextcostume) — After stepping, assert target.currentCostume incremented by 1 (mod costume count) vs its pre-step value (target.setCostume wraps the index).
- `next backdrop` (looks_nextbackdrop) — Assert runtime.getTargetForStage().currentCostume incremented by 1 (mod backdrop count) after stepping.
- `clear graphic effects` (looks_cleargraphiceffects) — Set an effect to nonzero, run clear, assert all values in target.effects are 0.
- `change size by (CHANGE)` (looks_changesizeby) — Assert target.size increased by CHANGE after stepping (from default 100 to 100+CHANGE, subject to size clamp).
- `set size to (SIZE) %` (looks_setsizeto) — Assert target.size === SIZE after stepping (subject to renderer-independent size clamp).
- `show` (looks_show) — Hide first, then run show; assert target.visible === true.
- `hide` (looks_hide) — Run hide; assert target.visible === false.
- `costume [NUMBER_NAME v]` (looks_costumenumbername) — Stack into a variable: set [v] to (costume [number v]); assert variable === target.currentCostume+1. Or [name v] returns target costume name.
- `backdrop [NUMBER_NAME v]` (looks_backdropnumbername) — set [v] to (backdrop [number v]); assert variable === stage.currentCostume+1.
- `size` (looks_size) — set size to (50), then set [v] to (size); assert variable === 50.

Tier-2 structural + loads-and-runs (Pattern T2):

- `say (MESSAGE) for (SECS) seconds` (looks_sayforsecs) — no menu/dropdown
- `say (MESSAGE)` (looks_say) — no menu/dropdown
- `think (MESSAGE) for (SECS) seconds` (looks_thinkforsecs) — no menu/dropdown
- `think (MESSAGE)` (looks_think) — no menu/dropdown
- `switch costume to [COSTUME v]` (looks_switchcostumeto) — COSTUME→menu looks_costume [conf:medium]
- `switch backdrop to [BACKDROP v]` (looks_switchbackdropto) — BACKDROP→menu looks_backdrops [conf:medium]
- `switch backdrop to [BACKDROP v] and wait` (looks_switchbackdroptoandwait) — BACKDROP→menu looks_backdrops [conf:medium]
- `go to [FRONT_BACK v] layer` (looks_gotofrontback) — FRONT_BACK:dropdown
- `go [FORWARD_BACKWARD v] (NUM) layers` (looks_goforwardbackwardlayers) — FORWARD_BACKWARD:dropdown

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-looks.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/looks.ts tests/compiler/cat-looks.test.ts
git commit -m "feat(compiler): Looks palette entries + per-block tests (B)"
```

---

### Task 5: Sound palette (7 entries — 4 Tier-1, 3 Tier-2)

Follow the **Category Task Recipe**. The 2 effect anchor entries (`sound_seteffectto`, `sound_changeeffectby`) are already present from Task 2 — do NOT re-add them.

**Files:**
- Modify: `src/compiler/blocks/categories/sound.ts` (append 7 entries to the `SOUND` array)
- Test: `tests/compiler/cat-sound.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `SOUND` array already exists (Task 1). Produces 7 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `SOUND` array in `src/compiler/blocks/categories/sound.ts`:

```ts
  { signature: "play sound [SOUND_MENU v] until done", opcode: "sound_playuntildone", shape: "stack", inputs: { SOUND_MENU: { kind: "menu", menuOpcode: "sound_sounds_menu", field: "SOUND_MENU", default: "Meow" } } },
  { signature: "start sound [SOUND_MENU v]", opcode: "sound_play", shape: "stack", inputs: { SOUND_MENU: { kind: "menu", menuOpcode: "sound_sounds_menu", field: "SOUND_MENU", default: "Meow" } } },
  { signature: "stop all sounds", opcode: "sound_stopallsounds", shape: "stack" },
  { signature: "clear sound effects", opcode: "sound_cleareffects", shape: "stack" },
  { signature: "change volume by (VOLUME)", opcode: "sound_changevolumeby", shape: "stack", inputs: { VOLUME: { kind: "number", shadowType: 4 } } },
  { signature: "set volume to (VOLUME) %", opcode: "sound_setvolumeto", shape: "stack", inputs: { VOLUME: { kind: "number", shadowType: 4 } } },
  { signature: "volume", opcode: "sound_volume", shape: "reporter" },
```

- [ ] **Step 2: Write `tests/compiler/cat-sound.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Sound entry.

Tier-1 runtime probes (Pattern T1):

- `clear sound effects` (sound_cleareffects) — After setting pitch=50 then 'clear sound effects', assert target.soundEffects.pitch === 0 && target.soundEffects.pan === 0.
- `change volume by (VOLUME)` (sound_changevolumeby) — From default volume 100, after 'change volume by (-30)' assert target.volume === 70; clamps to 0 and 100 at the bounds.
- `set volume to (VOLUME) %` (sound_setvolumeto) — After 'set volume to (40) %' assert target.volume === 40; 'set volume to (150)' clamps to 100; negative clamps to 0.
- `volume` (sound_volume) — After 'set volume to (55) %', evaluate the (volume) reporter (e.g. nest in 'set [v] to (volume)') and assert it reports 55 / target.volume === 55.

Tier-2 structural + loads-and-runs (Pattern T2):

- `play sound [SOUND_MENU v] until done` (sound_playuntildone) — SOUND_MENU→menu sound_sounds_menu [conf:medium]
- `start sound [SOUND_MENU v]` (sound_play) — SOUND_MENU→menu sound_sounds_menu [conf:medium]
- `stop all sounds` (sound_stopallsounds) — no menu/dropdown

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-sound.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/sound.ts tests/compiler/cat-sound.test.ts
git commit -m "feat(compiler): Sound palette entries + per-block tests (B)"
```

---

### Task 6: Events palette (5 entries — 0 Tier-1, 5 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/events.ts` (append 5 entries to the `EVENTS` array)
- Test: `tests/compiler/cat-events.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `EVENTS` array already exists (Task 1). Produces 5 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `EVENTS` array in `src/compiler/blocks/categories/events.ts`:

```ts
  { signature: "when [KEY_OPTION v] key pressed", opcode: "event_whenkeypressed", shape: "hat", fields: { KEY_OPTION: { kind: "dropdown" } } },
  { signature: "when this sprite clicked", opcode: "event_whenthisspriteclicked", shape: "hat" },
  { signature: "when stage clicked", opcode: "event_whenstageclicked", shape: "hat" },
  { signature: "when backdrop switches to [BACKDROP v]", opcode: "event_whenbackdropswitchesto", shape: "hat", fields: { BACKDROP: { kind: "dropdown" } } },
  { signature: "when [WHENGREATERTHANMENU v] > (VALUE)", opcode: "event_whengreaterthan", shape: "hat", inputs: { VALUE: { kind: "number", shadowType: 4 } }, fields: { WHENGREATERTHANMENU: { kind: "dropdown" } } },
```

- [ ] **Step 2: Write `tests/compiler/cat-events.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Events entry.

Tier-1 runtime probes (Pattern T1):

_(none — all Tier-2; the floor test is the gate)_

Tier-2 structural + loads-and-runs (Pattern T2):

- `when [KEY_OPTION v] key pressed` (event_whenkeypressed) — KEY_OPTION:dropdown
- `when this sprite clicked` (event_whenthisspriteclicked) — no menu/dropdown
- `when stage clicked` (event_whenstageclicked) — no menu/dropdown [conf:medium]
- `when backdrop switches to [BACKDROP v]` (event_whenbackdropswitchesto) — BACKDROP:dropdown
- `when [WHENGREATERTHANMENU v] > (VALUE)` (event_whengreaterthan) — WHENGREATERTHANMENU:dropdown [conf:medium]

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-events.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/events.ts tests/compiler/cat-events.test.ts
git commit -m "feat(compiler): Events palette entries + per-block tests (B)"
```

---

### Task 7: Control palette (6 entries — 6 Tier-1, 0 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/control.ts` (append 6 entries to the `CONTROL` array)
- Test: `tests/compiler/cat-control.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `CONTROL` array already exists (Task 1). Produces 6 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `CONTROL` array in `src/compiler/blocks/categories/control.ts`:

```ts
  { signature: "wait (DURATION) seconds", opcode: "control_wait", shape: "stack", inputs: { DURATION: { kind: "number", shadowType: 4 } } },
  { signature: "wait until <CONDITION>", opcode: "control_wait_until", shape: "stack", inputs: { CONDITION: { kind: "boolean" } } },
  { signature: "stop [STOP_OPTION v]", opcode: "control_stop", shape: "stack", fields: { STOP_OPTION: { kind: "dropdown" } } },
  { signature: "when I start as a clone", opcode: "control_start_as_clone", shape: "hat" },
  { signature: "create clone of [CLONE_OPTION v]", opcode: "control_create_clone_of", shape: "stack", inputs: { CLONE_OPTION: { kind: "menu", menuOpcode: "control_create_clone_of_menu", field: "CLONE_OPTION", default: "_myself_" } } },
  { signature: "delete this clone", opcode: "control_delete_this_clone", shape: "cap" },
```

- [ ] **Step 2: Write `tests/compiler/cat-control.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Control entry.

Tier-1 runtime probes (Pattern T1):

- `wait (DURATION) seconds` (control_wait) — Start a thread with 'wait (0.2) seconds' followed by 'set [done] to (1)'; step the VM and assert the variable is NOT set before ~0.2s of stepping has elapsed, then IS set after; or assert the thread remains in runtime.threads (status YIELD) immediately after the wait block runs.
- `wait until <CONDITION>` (control_wait_until) — Thread: 'wait until <(answer) = (1)>' then 'set [passed] to (1)'. Set a variable used in the condition to a true-making value mid-run; assert 'passed' is unset while condition false and set once it becomes true (thread stays in YIELD until then).
- `stop [STOP_OPTION v]` (control_stop) — Thread A: 'forever { change [a] by (1) }'. Thread B: 'wait (0.05) secs; stop [all v]'. After B runs, step further and assert thread A is gone (runtime.threads no longer contains it) and 'a' stops increasing. For 'this script' assert the current thread terminates (the block after it never runs).
- `when I start as a clone` (control_start_as_clone) — On a sprite, 'when I start as a clone { change [clones] by (1) }' plus a flag script 'create clone of [myself v]'; after run assert clones==1 and runtime.targets.length increased by 1 (the clone exists and its hat ran).
- `create clone of [CLONE_OPTION v]` (control_create_clone_of) — 'create clone of [myself v]' (CLONE_OPTION='_myself_'); after run assert runtime.targets.length increased by exactly 1 and the new target is a clone (isOriginal===false).
- `delete this clone` (control_delete_this_clone) — Create a clone, then on the clone run 'delete this clone'; assert runtime.targets.length returns to its pre-clone value and the disposed target is no longer in runtime.targets.

Tier-2 structural + loads-and-runs (Pattern T2):

_(none — all Tier-1)_

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-control.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/control.ts tests/compiler/cat-control.test.ts
git commit -m "feat(compiler): Control palette entries + per-block tests (B)"
```

---

### Task 8: Sensing palette (18 entries — 4 Tier-1, 14 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/sensing.ts` (append 18 entries to the `SENSING` array)
- Test: `tests/compiler/cat-sensing.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `SENSING` array already exists (Task 1). Produces 18 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `SENSING` array in `src/compiler/blocks/categories/sensing.ts`:

```ts
  { signature: "touching [TOUCHINGOBJECTMENU v]?", opcode: "sensing_touchingobject", shape: "boolean", inputs: { TOUCHINGOBJECTMENU: { kind: "menu", menuOpcode: "sensing_touchingobjectmenu", field: "TOUCHINGOBJECTMENU", default: "_mouse_" } } },
  { signature: "touching color (COLOR)?", opcode: "sensing_touchingcolor", shape: "boolean", inputs: { COLOR: { kind: "text", shadowType: 9 } } },
  { signature: "color (COLOR) is touching (COLOR2)?", opcode: "sensing_coloristouchingcolor", shape: "boolean", inputs: { COLOR: { kind: "text", shadowType: 9 }, COLOR2: { kind: "text", shadowType: 9 } } },
  { signature: "distance to [DISTANCETOMENU v]", opcode: "sensing_distanceto", shape: "reporter", inputs: { DISTANCETOMENU: { kind: "menu", menuOpcode: "sensing_distancetomenu", field: "DISTANCETOMENU", default: "_mouse_" } } },
  { signature: "ask (QUESTION) and wait", opcode: "sensing_askandwait", shape: "stack", inputs: { QUESTION: { kind: "text", shadowType: 10 } } },
  { signature: "answer", opcode: "sensing_answer", shape: "reporter" },
  { signature: "key [KEY_OPTION v] pressed?", opcode: "sensing_keypressed", shape: "boolean", inputs: { KEY_OPTION: { kind: "menu", menuOpcode: "sensing_keyoptions", field: "KEY_OPTION", default: "space" } } },
  { signature: "mouse down?", opcode: "sensing_mousedown", shape: "boolean" },
  { signature: "mouse x", opcode: "sensing_mousex", shape: "reporter" },
  { signature: "mouse y", opcode: "sensing_mousey", shape: "reporter" },
  { signature: "set drag mode [DRAG_MODE v]", opcode: "sensing_setdragmode", shape: "stack", fields: { DRAG_MODE: { kind: "dropdown" } } },
  { signature: "loudness", opcode: "sensing_loudness", shape: "reporter" },
  { signature: "timer", opcode: "sensing_timer", shape: "reporter" },
  { signature: "reset timer", opcode: "sensing_resettimer", shape: "stack" },
  { signature: "[PROPERTY v] of [OBJECT v]", opcode: "sensing_of", shape: "reporter", inputs: { OBJECT: { kind: "menu", menuOpcode: "sensing_of_object_menu", field: "OBJECT", default: "_stage_" } }, fields: { PROPERTY: { kind: "dropdown" } } },
  { signature: "current [CURRENTMENU v]", opcode: "sensing_current", shape: "reporter", fields: { CURRENTMENU: { kind: "dropdown" } } },
  { signature: "days since 2000", opcode: "sensing_dayssince2000", shape: "reporter" },
  { signature: "username", opcode: "sensing_username", shape: "reporter" },
```

- [ ] **Step 2: Write `tests/compiler/cat-sensing.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Sensing entry.

Tier-1 runtime probes (Pattern T1):

- `set drag mode [DRAG_MODE v]` (sensing_setdragmode) — After 'set drag mode [draggable v]' assert target.draggable === true; after 'set drag mode [not draggable v]' assert target.draggable === false.
- `timer` (sensing_timer) — Read sensing_timer (e.g. set a var to it): assert it is a number >= 0 and increases over successive steps; after a resettimer it is ~0.
- `reset timer` (sensing_resettimer) — After 'reset timer', read sensing_timer into a variable and assert it is ~0 (< a small epsilon).
- `[PROPERTY v] of [OBJECT v]` (sensing_of) — Build '[x position v] of [SpriteName v]' where SpriteName.x is set to a known value; assert the reporter (captured into a variable) equals that x. PROPERTY field is a fixed dropdown; OBJECT is a menu-input shadow referencing project sprites/stage.

Tier-2 structural + loads-and-runs (Pattern T2):

- `touching [TOUCHINGOBJECTMENU v]?` (sensing_touchingobject) — TOUCHINGOBJECTMENU→menu sensing_touchingobjectmenu
- `touching color (COLOR)?` (sensing_touchingcolor) — no menu/dropdown [conf:medium]
- `color (COLOR) is touching (COLOR2)?` (sensing_coloristouchingcolor) — no menu/dropdown [conf:medium]
- `distance to [DISTANCETOMENU v]` (sensing_distanceto) — DISTANCETOMENU→menu sensing_distancetomenu
- `ask (QUESTION) and wait` (sensing_askandwait) — no menu/dropdown
- `answer` (sensing_answer) — no menu/dropdown
- `key [KEY_OPTION v] pressed?` (sensing_keypressed) — KEY_OPTION→menu sensing_keyoptions
- `mouse down?` (sensing_mousedown) — no menu/dropdown
- `mouse x` (sensing_mousex) — no menu/dropdown
- `mouse y` (sensing_mousey) — no menu/dropdown
- `loudness` (sensing_loudness) — no menu/dropdown
- `current [CURRENTMENU v]` (sensing_current) — CURRENTMENU:dropdown
- `days since 2000` (sensing_dayssince2000) — no menu/dropdown
- `username` (sensing_username) — no menu/dropdown

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-sensing.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/sensing.ts tests/compiler/cat-sensing.test.ts
git commit -m "feat(compiler): Sensing palette entries + per-block tests (B)"
```

---

### Task 9: Operators palette (9 entries — 9 Tier-1, 0 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/operators.ts` (append 9 entries to the `OPERATORS` array)
- Test: `tests/compiler/cat-operators.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `OPERATORS` array already exists (Task 1). Produces 9 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `OPERATORS` array in `src/compiler/blocks/categories/operators.ts`:

```ts
  { signature: "(NUM1) * (NUM2)", opcode: "operator_multiply", shape: "reporter", inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "(NUM1) / (NUM2)", opcode: "operator_divide", shape: "reporter", inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "pick random (FROM) to (TO)", opcode: "operator_random", shape: "reporter", inputs: { FROM: { kind: "number", shadowType: 4 }, TO: { kind: "number", shadowType: 4 } } },
  { signature: "join (STRING1) (STRING2)", opcode: "operator_join", shape: "reporter", inputs: { STRING1: { kind: "text", shadowType: 10 }, STRING2: { kind: "text", shadowType: 10 } } },
  { signature: "letter (LETTER) of (STRING)", opcode: "operator_letter_of", shape: "reporter", inputs: { LETTER: { kind: "number", shadowType: 6 }, STRING: { kind: "text", shadowType: 10 } } },
  { signature: "length of (STRING)", opcode: "operator_length", shape: "reporter", inputs: { STRING: { kind: "text", shadowType: 10 } } },
  { signature: "(STRING1) contains (STRING2)?", opcode: "operator_contains", shape: "boolean", inputs: { STRING1: { kind: "text", shadowType: 10 }, STRING2: { kind: "text", shadowType: 10 } } },
  { signature: "(NUM1) mod (NUM2)", opcode: "operator_mod", shape: "reporter", inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "round (NUM)", opcode: "operator_round", shape: "reporter", inputs: { NUM: { kind: "number", shadowType: 4 } } },
```

- [ ] **Step 2: Write `tests/compiler/cat-operators.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Operators entry.

Tier-1 runtime probes (Pattern T1):

- `(NUM1) * (NUM2)` (operator_multiply) — set [v] to ((6)*(7)); assert v === 42.
- `(NUM1) / (NUM2)` (operator_divide) — set [v] to ((20)/(4)); assert v === 5.
- `pick random (FROM) to (TO)` (operator_random) — set [v] to (pick random (5) to (5)); assert v === 5 (low===high short-circuit). Or assert v is an integer within [1,10] when picking 1 to 10.
- `join (STRING1) (STRING2)` (operator_join) — set [v] to (join [hello ] [world]); assert v === 'hello world'.
- `letter (LETTER) of (STRING)` (operator_letter_of) — set [v] to (letter (1) of [apple]); assert v === 'a'.
- `length of (STRING)` (operator_length) — set [v] to (length of [apple]); assert v === 5.
- `(STRING1) contains (STRING2)?` (operator_contains) — if <[apple] contains [pp]?> then set [v] to (1); assert v === 1.
- `(NUM1) mod (NUM2)` (operator_mod) — set [v] to ((10) mod (3)); assert v === 1.
- `round (NUM)` (operator_round) — set [v] to (round (2.6)); assert v === 3.

Tier-2 structural + loads-and-runs (Pattern T2):

_(none — all Tier-1)_

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-operators.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/operators.ts tests/compiler/cat-operators.test.ts
git commit -m "feat(compiler): Operators palette entries + per-block tests (B)"
```

---

### Task 10: Variables palette (2 entries — 2 Tier-1, 0 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/variables.ts` (append 2 entries to the `VARIABLES` array)
- Test: `tests/compiler/cat-variables.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `VARIABLES` array already exists (Task 1). Produces 2 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `VARIABLES` array in `src/compiler/blocks/categories/variables.ts`:

```ts
  { signature: "show variable [VARIABLE v]", opcode: "data_showvariable", shape: "stack", fields: { VARIABLE: { kind: "variable" } } },
  { signature: "hide variable [VARIABLE v]", opcode: "data_hidevariable", shape: "stack", fields: { VARIABLE: { kind: "variable" } } },
```

- [ ] **Step 2: Write `tests/compiler/cat-variables.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Variables entry.

Tier-1 runtime probes (Pattern T1):

- `show variable [VARIABLE v]` (data_showvariable) — Create a variable, run the block, then read the monitor record for that variable id from runtime monitor state (e.g. runtime._monitorState / getMonitorState) and assert visible === true.
- `hide variable [VARIABLE v]` (data_hidevariable) — Create a variable (default monitor visible or show it first), run the block, then read the monitor record for that variable id from runtime monitor state and assert visible === false.

Tier-2 structural + loads-and-runs (Pattern T2):

_(none — all Tier-1)_

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-variables.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/variables.ts tests/compiler/cat-variables.test.ts
git commit -m "feat(compiler): Variables palette entries + per-block tests (B)"
```

---

### Task 11: Lists palette (9 entries — 9 Tier-1, 0 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/lists.ts` (append 9 entries to the `LISTS` array)
- Test: `tests/compiler/cat-lists.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `LISTS` array already exists (Task 1). Produces 9 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `LISTS` array in `src/compiler/blocks/categories/lists.ts`:

```ts
  { signature: "delete (INDEX) of [LIST v]", opcode: "data_deleteoflist", shape: "stack", inputs: { INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
  { signature: "delete all of [LIST v]", opcode: "data_deletealloflist", shape: "stack", fields: { LIST: { kind: "list" } } },
  { signature: "insert [ITEM] at (INDEX) of [LIST v]", opcode: "data_insertatlist", shape: "stack", inputs: { ITEM: { kind: "text", shadowType: 10 }, INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
  { signature: "replace item (INDEX) of [LIST v] with [ITEM]", opcode: "data_replaceitemoflist", shape: "stack", inputs: { INDEX: { kind: "number", shadowType: 7 }, ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "item # of [ITEM] in [LIST v]", opcode: "data_itemnumoflist", shape: "reporter", inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "length of [LIST v]", opcode: "data_lengthoflist", shape: "reporter", fields: { LIST: { kind: "list" } } },
  { signature: "[LIST v] contains [ITEM]?", opcode: "data_listcontainsitem", shape: "boolean", inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "show list [LIST v]", opcode: "data_showlist", shape: "stack", fields: { LIST: { kind: "list" } } },
  { signature: "hide list [LIST v]", opcode: "data_hidelist", shape: "stack", fields: { LIST: { kind: "list" } } },
```

- [ ] **Step 2: Write `tests/compiler/cat-lists.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Lists entry.

Tier-1 runtime probes (Pattern T1):

- `delete (INDEX) of [LIST v]` (data_deleteoflist) — Seed a known list, run delete (2) of [LIST]; assert list.value has the 2nd element removed and length decremented; delete (all) clears list.value to [].
- `delete all of [LIST v]` (data_deletealloflist) — Seed a non-empty list, run; assert target list.value.length === 0.
- `insert [ITEM] at (INDEX) of [LIST v]` (data_insertatlist) — Seed list ['a','b'], run insert [x] at (1) of [LIST]; assert list.value === ['x','a','b'].
- `replace item (INDEX) of [LIST v] with [ITEM]` (data_replaceitemoflist) — Seed list ['a','b'], run replace item (2) of [LIST] with [z]; assert list.value === ['a','z'].
- `item # of [ITEM] in [LIST v]` (data_itemnumoflist) — Seed list ['a','b']; run set [v] to (item # of [b] in [LIST]); assert v === 2; absent item yields 0.
- `length of [LIST v]` (data_lengthoflist) — Seed list of 3 items; run set [v] to (length of [LIST]); assert v === 3.
- `[LIST v] contains [ITEM]?` (data_listcontainsitem) — Seed list ['a','b']; run if <[LIST] contains [a]> set [v] to (1); assert branch taken / v set. Or capture the boolean into a variable.
- `show list [LIST v]` (data_showlist) — Run show list [LIST]; assert runtime.getMonitorState()/_monitorState entry for the list id has visible === true. (Lower-confidence Tier-1: some treat monitor display as renderer-tier; degrades cleanly to Tier-2 load+step if monitor state not asserted.)
- `hide list [LIST v]` (data_hidelist) — Run hide list [LIST]; assert the monitor state entry for the list id has visible === false. (Same Tier-1/Tier-2 caveat as show list.)

Tier-2 structural + loads-and-runs (Pattern T2):

_(none — all Tier-1)_

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-lists.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/lists.ts tests/compiler/cat-lists.test.ts
git commit -m "feat(compiler): Lists palette entries + per-block tests (B)"
```

---

### Task 12: Pen palette (8 entries — 0 Tier-1, 8 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/pen.ts` (append 8 entries to the `PEN` array)
- Test: `tests/compiler/cat-pen.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `PEN` array already exists (Task 1). Produces 8 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `PEN` array in `src/compiler/blocks/categories/pen.ts`:

```ts
  { signature: "stamp", opcode: "pen_stamp", shape: "stack" },
  { signature: "pen down", opcode: "pen_penDown", shape: "stack" },
  { signature: "pen up", opcode: "pen_penUp", shape: "stack" },
  { signature: "set pen color to [COLOR]", opcode: "pen_setPenColorToColor", shape: "stack", inputs: { COLOR: { kind: "text", shadowType: 9 } } },
  { signature: "change pen [COLOR_PARAM v] by (VALUE)", opcode: "pen_changePenColorParamBy", shape: "stack", inputs: { COLOR_PARAM: { kind: "menu", menuOpcode: "pen_menu_colorParam", field: "colorParam", default: "color" }, VALUE: { kind: "number", shadowType: 4 } } },
  { signature: "set pen [COLOR_PARAM v] to (VALUE)", opcode: "pen_setPenColorParamTo", shape: "stack", inputs: { COLOR_PARAM: { kind: "menu", menuOpcode: "pen_menu_colorParam", field: "colorParam", default: "color" }, VALUE: { kind: "number", shadowType: 4 } } },
  { signature: "change pen size by (SIZE)", opcode: "pen_changePenSizeBy", shape: "stack", inputs: { SIZE: { kind: "number", shadowType: 4 } } },
  { signature: "set pen size to (SIZE)", opcode: "pen_setPenSizeTo", shape: "stack", inputs: { SIZE: { kind: "number", shadowType: 4 } } },
```

- [ ] **Step 2: Write `tests/compiler/cat-pen.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Pen entry.

Tier-1 runtime probes (Pattern T1):

_(none — all Tier-2; the floor test is the gate)_

Tier-2 structural + loads-and-runs (Pattern T2):

- `stamp` (pen_stamp) — no menu/dropdown
- `pen down` (pen_penDown) — no menu/dropdown
- `pen up` (pen_penUp) — no menu/dropdown
- `set pen color to [COLOR]` (pen_setPenColorToColor) — no menu/dropdown [conf:medium]
- `change pen [COLOR_PARAM v] by (VALUE)` (pen_changePenColorParamBy) — COLOR_PARAM→menu pen_menu_colorParam [conf:low]
- `set pen [COLOR_PARAM v] to (VALUE)` (pen_setPenColorParamTo) — COLOR_PARAM→menu pen_menu_colorParam [conf:low]
- `change pen size by (SIZE)` (pen_changePenSizeBy) — no menu/dropdown
- `set pen size to (SIZE)` (pen_setPenSizeTo) — no menu/dropdown

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-pen.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/pen.ts tests/compiler/cat-pen.test.ts
git commit -m "feat(compiler): Pen palette entries + per-block tests (B)"
```

---

### Task 13: Music palette (6 entries — 4 Tier-1, 2 Tier-2)

Follow the **Category Task Recipe**.

**Files:**
- Modify: `src/compiler/blocks/categories/music.ts` (append 6 entries to the `MUSIC` array)
- Test: `tests/compiler/cat-music.test.ts` (new)

**Interfaces:** Consumes the frozen contract + Task-2 hardening (skeleton guard, options tiebreak, zero-arg reporters, extended `runHeadless`). The `MUSIC` array already exists (Task 1). Produces 6 new `BlockDef` entries; no parser/packager/schema change.

- [ ] **Step 1: Append the entries** to the `MUSIC` array in `src/compiler/blocks/categories/music.ts`:

```ts
  { signature: "play drum [DRUM v] for (BEATS) beats", opcode: "music_playDrumForBeats", shape: "stack", inputs: { DRUM: { kind: "menu", menuOpcode: "music_menu_DRUM", field: "DRUM", default: "1" }, BEATS: { kind: "number", shadowType: 4 } } },
  { signature: "play note (NOTE) for (BEATS) beats", opcode: "music_playNoteForBeats", shape: "stack", inputs: { NOTE: { kind: "number", shadowType: 4 }, BEATS: { kind: "number", shadowType: 4 } } },
  { signature: "set instrument to [INSTRUMENT v]", opcode: "music_setInstrument", shape: "stack", inputs: { INSTRUMENT: { kind: "menu", menuOpcode: "music_menu_INSTRUMENT", field: "INSTRUMENT", default: "1" } } },
  { signature: "set tempo to (TEMPO)", opcode: "music_setTempo", shape: "stack", inputs: { TEMPO: { kind: "number", shadowType: 4 } } },
  { signature: "change tempo by (TEMPO)", opcode: "music_changeTempo", shape: "stack", inputs: { TEMPO: { kind: "number", shadowType: 4 } } },
  { signature: "tempo", opcode: "music_getTempo", shape: "reporter" },
```

- [ ] **Step 2: Write `tests/compiler/cat-music.test.ts`** per the Recipe — one **T1** test per Tier-1 block, one **T2** test per Tier-2 block, and one **floor (F)** test using every Music entry.

Tier-1 runtime probes (Pattern T1):

- `set instrument to [INSTRUMENT v]` (music_setInstrument) — After stepping, assert target.getCustomState('Scratch.music').currentInstrument === (chosen 1-indexed menu value minus 1, wrap-clamped to 0..INSTRUMENT_INFO.length-1). E.g. menu '1' (Piano) -> currentInstrument === 0.
- `set tempo to (TEMPO)` (music_setTempo) — After stepping, assert runtime.getTargetForStage().tempo === MathUtil.clamp(TEMPO, 20, 500). E.g. set tempo to 120 -> stage.tempo === 120.
- `change tempo by (TEMPO)` (music_changeTempo) — From a known starting tempo (default 60), after stepping assert runtime.getTargetForStage().tempo === MathUtil.clamp(60 + TEMPO, 20, 500). E.g. change tempo by 20 -> stage.tempo === 80.
- `tempo` (music_getTempo) — Wrap in 'set [v] to (tempo)'; after a setTempo to 120 + step, assert the variable's value === 120 (or default 60 with no prior setTempo).

Tier-2 structural + loads-and-runs (Pattern T2):

- `play drum [DRUM v] for (BEATS) beats` (music_playDrumForBeats) — DRUM→menu music_menu_DRUM
- `play note (NOTE) for (BEATS) beats` (music_playNoteForBeats) — no menu/dropdown [conf:low]

- [ ] **Step 3: Gate + commit.** Run `npx vitest run tests/compiler/cat-music.test.ts` and iterate to green (a load-time throw ⇒ a wrong menu opcode/shadow; fix it against `node_modules/scratch-vm/src/serialization/sb2_specmap.js`, never weaken the test). Then `npx tsc --noEmit` (clean) + `npx vitest run tests/compiler/` (green).

```bash
git add src/compiler/blocks/categories/music.ts tests/compiler/cat-music.test.ts
git commit -m "feat(compiler): Music palette entries + per-block tests (B)"
```

---


---

### Task 14: Parity audit, dual-standard floor, whole-branch review + merge

All 11 category branches are merged. Verify full parity, the skeleton guard on the whole set, and an all-category integration run; then whole-branch review and merge to main.

**Files:**
- Create: `tests/fixtures/palette-src/project.yaml`, `tests/fixtures/palette-src/cat.sprite.scratch`
- Create: `tests/compiler/palette-parity.test.ts`

**Interfaces:**
- Consumes: `byOpcode`/`SLICE` (full merged registry), `compileProject`, `runHeadless`.

- [ ] **Step 1: Parity test (count + per-category presence + guard)**

Create `tests/compiler/palette-parity.test.ts`:

```ts
import { expect, test } from "vitest";
import { SLICE, byOpcode } from "../../src/compiler/blocks/registry.js";

test("the registry holds all 135 default-palette BlockDefs (137 palette − 2 parser-implicit reporters)", () => {
  expect(byOpcode.size).toBe(135);
  expect(new Set(SLICE.map((d) => d.opcode)).size).toBe(135);
});

test("each category contributes its expected opcode count", () => {
  const n = (prefix: string) => SLICE.filter((d) => d.opcode.startsWith(prefix)).length;
  expect(n("motion_")).toBe(18);
  expect(n("looks_")).toBe(21);
  expect(n("sound_")).toBe(9);
  expect(n("event_")).toBe(9);
  expect(n("control_")).toBe(11);
  expect(n("sensing_")).toBe(18);
  expect(n("operator_")).toBe(18);
  expect(n("pen_")).toBe(9);
  expect(n("music_")).toBe(7);
  // data_ = variables (4: set/change/show/hide) + lists (11) = 15 BlockDefs (the 2 data reporters are parser-implicit)
  expect(n("data_")).toBe(15);
});
```

(Total: 18+21+9+9+11+18+18+15+9+7 = 135. `event_` counts `event_whenflagclicked` etc.; `control_if_else` is `synthetic` but still in `byOpcode`.)

- [ ] **Step 2: Run the parity test**

Run: `npx vitest run tests/compiler/palette-parity.test.ts`
Expected: PASS. A FAIL means a category under/over-delivered — reconcile against spec Appendix A before proceeding.

- [ ] **Step 3: All-category integration fixture**

Create `tests/fixtures/palette-src/project.yaml` (starts at `name:` — no `#` lines):

```yaml
name: Palette
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 0
    y: 0
variables:
  global: { v: 0, n: 0 }
lists:
  global: { inventory: [] }
```

Create `tests/fixtures/palette-src/cat.sprite.scratch` (starts at `when green flag clicked`) — a script touching at least one block from every category (extend as desired; keep it runnable):

```
when green flag clicked
move (10) steps
set x to (5)
say [hi] for (0) seconds
set size to (120) %
set [color v] effect to (25)
change volume by (-10)
set [pitch v] effect to (100)
switch costume to [costume1 v]
add [a] to [inventory v]
set [n v] to (item (1) of [inventory v])
set [v v] to ((3) + (4))
set pen size to (2)
erase all
rest for (0.1) beats
broadcast [go v]
if <(1) = (1)> then
change [v v] by (1)
end
when I receive [go v]
set [v v] to (timer)
```

- [ ] **Step 4: Integration test**

Add to `tests/compiler/palette-parity.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

test("the all-category palette fixture compiles and loads+runs in the VM", async () => {
  const dir = fileURLToPath(new URL("../fixtures/palette-src", import.meta.url));
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!);            // loads + steps without throwing
});
```

- [ ] **Step 5: Run integration + full suite + typecheck**

Run: `npx vitest run tests/compiler/palette-parity.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: clean.
Run: `npx vitest run tests/compiler/`
Expected: all green — every `cat-*.test.ts` floor passing means all 135 entries load in a real VM.
Run: `npx vitest run` (full suite); if only `tests/editor/launch.test.ts` fails under parallel load, re-run it alone to confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/palette-src tests/compiler/palette-parity.test.ts
git commit -m "test(compiler): full-palette parity audit + all-category VM integration (B)"
```

- [ ] **Step 7: Whole-branch review + merge**

Invoke **superpowers:requesting-code-review** for an opus whole-branch review (focus: every entry's encoding fidelity, the contract delta stayed additive, the skeleton guard covers the full set, the dual-standard floor is real). Triage findings, then invoke **superpowers:finishing-a-development-branch** to merge to `main` (local repo, no remote — `--no-ff` merge mirroring the prior sub-projects). Update `.superpowers/sdd/progress.md` with the `>>> MERGED + DONE` block.

---

## What this plan delivers

A compiler that parses and emits the **entire core Scratch-3 default palette** (137 blocks; 135 `BlockDef`s + 2 parser-implicit reporters), every block proven to load and step in a headless `scratch-vm`, behind a contract that grew by exactly one optional field (`dropdown.options?`).

## Follow-on (not in this document)

- **Custom blocks / procedures** (`define`, `procedures_*`, mutations, `warp`); **asset resolver** (real costumes/sounds/backdrops); **on-stage monitors** (`monitors[]`) — each its own spec → plan.
- Optional refinement: a specific `invalid option "<x>"` diagnostic (Task 2 currently surfaces the generic unknown-block error on an out-of-set dropdown value — fail-loud, but generic).

## Self-Review

- **Spec coverage:** spec §2 scope/parity → Tasks 3–13 + Task 14 parity test; §3 contract delta (`dropdown.options?`) → Task 1; §4.1 registry split → Task 1; §4.2 skeleton assertion → Task 1; §4.3 effect tiebreak → Task 2; §4.4 hardening minors (synthetic, `]`) → Task 2; §4.5 zero-arg reporters → Task 2; §5 dual standard + floor → Recipe (T1/T2/F) applied in every category task + Task 14 floor; §6 fan-out/worktrees/models → Global Constraints + Recipe; Appendix A entries → Tasks 3–13 (generated verbatim). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every entry is concrete code; every test shows assertions + the run command + expected result. The Recipe patterns are complete runnable code; each category task supplies the exact substitution data (entries + probes).
- **Type consistency:** `options?` declared on `dropdown` (Task 1) → read by `optionsOk` (Task 2) and `skeletonKey` (Task 1); `synthetic?` declared on `BlockDef` (Task 1) → set on `control_if_else` (Task 1) → filtered from `SIGS` and skipped by `assertUniqueSkeletons` (Task 2 / Task 1); `MOTION`/`LOOKS`/… exports (Task 1) → spread by `registry.ts` (Task 1) → appended by Tasks 3–13; `runHeadless().target/cloneCount/runtime` produced (Task 2) → consumed by the Recipe + category Tier-1 tests; the 5 anchors added in Task 2 are excluded from the Tasks 3–13 entry lists (Motion 14 not 15, Looks 19 not 21, Sound 7 not 9).
- **Encoding fidelity safety net:** every category's floor test (Pattern F) plus Task 14's integration fixture load+step the real VM; a wrong menu opcode/shadow throws on load and fails the gate — the Recipe instructs correcting the opcode, never weakening the test.
