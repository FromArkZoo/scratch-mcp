# Scratch Compiler — Parser + Schema Grammar-Extension Foundation — Design

**Date:** 2026-06-23
**Status:** Design — awaiting user review
**Project root:** `~/scratch-mcp` (sub-project of [Scratch MCP](2026-06-23-scratch-mcp-design.md); follows the merged [pipeline skeleton](../plans/2026-06-23-compiler-pipeline-skeleton.md))

## 1. Goal

Grow the compiler from the literal-only **skeleton** (6-block slice; inputs are literal numbers/text only; `[VARIABLE]` fields; single-substack c-blocks) to the **full scratchblocks grammar**, proven end-to-end on a small cross-shape slice that compiles to an `.sb3` and runs in a headless `scratch-vm@5.0.300`.

This plan is the **shared foundation** for the per-category block-dictionary build-out (the *next* plan, an ultracode fan-out — one agent per category). It exists so that fan-out has a stable parser, a stable extended `BlockDef`/`InputSpec`/`FieldSpec` schema, and a stable packager input-encoding to author against — so the category agents only **add dictionary entries + per-block tests**, never touch the parser or packager, and never collide.

It is deliberately the de-risk step for the build-out, mirroring how the skeleton proved the riskiest contract (a hand-assembled `project.json` actually running in the VM) before building outward.

## 2. What freezes vs. what grows

**Frozen (unchanged):**
- `compileProject(dir): Promise<CompileResult>` and `CompileResult { ok; sb3?; diagnostics }`.
- The *outer* shape of `ParsedBlock { opcode; inputs; fields; substacks }` and `ParsedScript { blocks }`.
- `Diagnostic`, `Project`/`TargetDecl`/`VariableDecl` (manifest model).
- Variable-id resolution rule (own ∪ global-Stage) and the `meta` envelope.

**Grows (the point of this plan):**
- **`InputValue`** — the skeleton tagged it `{ kind: "literal"; value: string }` with a `// skeleton: literal number/text only` note; the `kind` discriminant was put there for exactly this growth. New union (this is the anticipated extension, not a breaking change — `ParsedBlock.inputs` is still `Record<string, InputValue>`):
  ```ts
  type InputValue =
    | { kind: "literal"; value: string }            // (10) / [hello]
    | { kind: "variable"; name: string }            // (score) used as a reporter input
    | { kind: "block"; block: ParsedBlock }         // nested reporter ( ) or boolean < >
    | { kind: "menu"; value: string };              // [edge v] shadow-menu selection
  ```
- **`BlockDef` / `InputSpec` / `FieldSpec`** — see §4.
- **The parser** (`src/compiler/parser/`) — full rewrite, §3.
- **The packager input-encoding** (`src/compiler/packager.ts`) — recursive, §5.

## 3. Parser core (rewrite → `src/compiler/parser/`)

The skeleton's line-by-line signature matcher is replaced by a proper recursive-descent parser. Structure:

### 3.1 Tokenizer (`parser/lexer.ts`)
Statements remain line-oriented (one block per line); inputs nest within a line via brackets. The tokenizer turns a line into a bracket-aware token stream:
- structural tokens: `(` `)` `[` `]` `<` `>`;
- a `[ … v]` span (trailing ` v]`) → a **menu** token carrying the option text; a plain `[ … ]` → a **text-literal** token (the spec §10.2 disambiguation rule: dropdowns end with ` v]`);
- bare words → word tokens; numeric words inside a round slot → number literals.
- Script-level tokens: blank lines skipped; `end` and `else` are keyword tokens that bound c-block bodies; `define` reserved (custom blocks — deferred, §7).

### 3.2 Statement & input parsing (`parser/parse.ts`)
- A **statement** is matched against `BlockDef.signature`s (the dictionary stays the match table). A signature is pre-tokenized into literal words and typed holes: round `( )`, square `[ ]`, boolean `< >`, menu `[ v]`, substack.
- **Input holes recurse.** The content of a `( )` input is parsed as one of: a number/text **literal**; a **variable** reporter (a bare name matching a known variable → `{kind:"variable"}`); a nested **reporter block** (matches a `shape:"reporter"` signature → `{kind:"block"}`); or a **menu** selection (`{kind:"menu"}`). A `< >` boolean hole accepts a boolean block or `not`/`and`/`or`/comparison reporters → `{kind:"block"}`.
- **Operator reporters via bracketed signatures.** Canonical scratchblocks brackets every operand: `((3) + (4))`, `<(1) > (2)>`, `<<a> and <b>>`. So an operator block is matched by its ordinary bracketed signature — `() + ()`, `() > ()`, `<> and <>` — with each operand parsed recursively. **No precedence-climbing (Pratt) is needed for canonical input**, because the brackets are explicit. Accepting *unbracketed* infix (`(3 + 4)`) is a deferred leniency (§7) — if added later it is the only place precedence machinery would live.
- **C-blocks:** parse the boolean CONDITION input (for `if`/`repeat until`), then a substack body of statements until `else` or `end`. `if … else … end` yields two substacks (SUBSTACK + SUBSTACK2). `forever`/`repeat`/`repeat until`/`if … then` yield one. Nesting recurses.
- **Disambiguation rules** made explicit & tested (spec §10.2): `[x v]` menu vs `[hello]` text; a round-slot value that is purely numeric → number literal, a known-variable name → variable reporter, otherwise attempt a reporter-signature match (else an `unknown reporter` diagnostic).

### 3.3 Diagnostics
Same fail-loud/collect-all contract, now with real `file:line` on every node: unknown block, unknown reporter, unterminated c-block, stray `end`/`else`, boolean expected but value/reporter found (and vice-versa), unresolved variable. Never throws; never emits a silently-broken project.

## 4. Schema extensions (`src/compiler/blocks/types.ts`)

```ts
type BlockShape = "hat" | "stack" | "cap" | "c" | "reporter" | "boolean"; // already complete

type ShadowType = 4|5|6|7|8|9|10|11;  // number, +num, +int, int, angle, color, string, broadcast (widen as the slice needs)

type InputSpec =
  | { kind: "number" | "text"; shadowType: ShadowType }     // accepts a literal OR a nested reporter/variable
  | { kind: "boolean" }                                      // < > slot; no shadow
  | { kind: "menu"; menuOpcode: string; field: string; default: string; shadowType?: ShadowType }
  | { kind: "substack" };

type FieldSpec =
  | { kind: "variable" }                                     // resolves to [name, id]
  | { kind: "dropdown" };                                    // option string stored directly on the block

interface BlockDef {
  signature: string;
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substacks?: string[];   // [] | ["SUBSTACK"] | ["SUBSTACK","SUBSTACK2"]  (replaces the skeleton's single `substack?`)
}
```
A `kind:"menu"` input means the dropdown is a **shadow menu block** (the value lives on a generated child block's field). A `kind:"dropdown"` field means the dropdown is stored **directly on the block** (`operator_mathop` OPERATOR, `looks_changeeffectby` EFFECT, etc.). Both flavors are proven in the slice, because the fan-out needs both patterns.

## 5. Packager input-encoding (`src/compiler/packager.ts`)

Inputs are emitted recursively into Scratch 3 forms:
- **literal in number/text slot:** `[1, [shadowType, value]]` (unchanged).
- **nested reporter obscuring a shadow:** emit the child block; parent input `[3, childId, [shadowType, ""]]`.
- **boolean slot with a block:** `[2, childId]`; an empty boolean condition → omit the input (matches the VM, same pattern the skeleton uses for empty substacks).
- **variable as reporter input:** `[3, [12, name, id], [shadowType, ""]]` (the `[12,…]` variable primitive; id resolved own ∪ global-Stage, reusing the skeleton's resolver). Unresolved → error diagnostic.
- **menu input:** generate a shadow block `{ opcode: menuOpcode, fields: { [field]: [value, null] }, shadow: true, topLevel: false, parent: parentId, next: null, inputs: {} }`; parent input `[1, menuShadowId]`.
- **dropdown field:** `fields[NAME] = [value, null]`; **variable field:** `[name, id]` (unchanged).
- Block-ID generation, `parent`/`next` linking, and top-level hat layout extend unchanged to nested children.

`extensions[]` population (Pen/Music) is **not** in this plan — those category agents add it in the fan-out (§7).

## 6. Proving slice + testing

A handful of blocks that together exercise **every** new grammar feature, each with a per-block semantic test (the §7-of-the-compiler-spec discipline: compile a minimal snippet → load in headless `scratch-vm` → greenFlag → step → assert a runtime effect):

| Feature proven | Example snippet | Assertion |
|---|---|---|
| infix reporter, nested literals, reporter-as-number-input, var-set-from-reporter | `set [r v] to ((3) + (4))` | `r == 7` |
| boolean infix, `if/else` two substacks (SUBSTACK + SUBSTACK2) | `if <(1) > (2)> then … else set [b v] to (9) end` | `b == 9` |
| `repeat until` + boolean + variable reporter operand | `repeat until <(c) = (5)> change [c v] by (1) end` | `c == 5` |
| dropdown **field** + nested number input | `set [m v] to ([abs v] of (-5))` | `m == 5` |
| `and`/`or`/`not` boolean composition | `if <<(1) < (2)> and <not <(3) < (1)>>> then set [k v] to (1) end` | `k == 1` |

**Dual standard for menus:** where a shadow-**menu** input cannot show a deterministic headless effect (most need a renderer/sensing — `touching [edge v]?`, `go to [random position v]`), prove it **structurally** (the generated `project.json` contains the correct shadow-menu block + parent `[1, id]` input) **and** that the `.sb3` loads and runs in the VM without error. Runtime-assert wherever headless-deterministic; structural-assert the rest. This dual standard is stated so the fan-out applies it consistently.

Parser unit tests cover the new grammar (nesting, if/else, repeat-until, menu-vs-text, variable-vs-literal, each error case). A whole-project fixture exercises a multi-shape script end-to-end (text → `.sb3` → run).

## 7. Deferred (explicitly out of this plan)

Each is additive — the foundation's shapes don't change to add them:
- **Custom blocks / procedures** — two-pass parsing, `procedures_*`, mutations, `warp`. Spec phase 4; its own plan. (`define` is reserved in the lexer but not parsed here.)
- **`extensions[]` Pen/Music wiring** — the fan-out's `pen.ts`/`music.ts` agents add the small packager `extensions:["pen"]`/`["music"]` population + a test.
- **Asset resolver** — separate plan (skeleton's placeholder costume remains the fallback).
- **Broadcasts** — collected from `broadcast […]` / `when I receive […]`; added when Events lands in the fan-out (or here only if trivial). Deferred.
- **Lists as reporter inputs** (`[13,…]` primitive) — added with the Lists category.
- **Unbracketed infix leniency** (`(3 + 4)`) — only this would need precedence-climbing; canonical bracketed input is required in v1.
- **On-stage monitors, raw-block escape hatch, Claude-authored SVG costumes** — recorded deferrals from the compiler design §11.

## 8. Error handling

Unchanged contract: **fail loud, collect all.** Every malformed construct is a `Diagnostic { file, line, message, severity }`; `compileProject` returns `{ ok:false, diagnostics }` and no `.sb3` if any `error` fires; warnings don't block. Never a silently-broken project.

## 9. Testing & tech stack

TypeScript (strict, ESM), Node ≥25, Vitest, headless `scratch-vm@5.0.300` (must match the editor's bundled VM). No new runtime deps. The per-block semantic test (compile → headless VM → assert runtime effect) is the core discipline, supplemented by parser unit tests and a whole-project fixture.

## 10. Open questions / risks

1. **Menu catalogue.** Each menu block needs its `menuOpcode`/`field`/`default` in its `BlockDef`. The foundation proves the mechanism on 1–2 menus; the fan-out fills the rest per category. Risk: a menu whose shadow shape differs from the common pattern — surface as a per-category finding.
2. **Variable-vs-reporter-vs-literal disambiguation** in a round slot — the rule (numeric → literal; known var → variable; else reporter-signature match; else diagnostic) must be unit-tested against ambiguous names (e.g. a variable literally named `10` is rejected/flagged).
3. **Boolean value coercion** — storing a boolean reporter into a variable (`set [t v] to <…>`) — confirm the VM's value form so any such test asserts the right thing; prefer numeric/branch-effect assertions in the slice to avoid boolean-stringification ambiguity.
4. **`substacks?: string[]` migration** — replacing the skeleton's `substack?: string` touches the existing 6-block slice (`control_repeat`) and the packager's substack loop; a small, contained refactor the foundation owns.
5. **This still feeds the MCP server** — keep variable scope explicit in the model (already true) so later `read_state` namespacing stays natural.

## 11. What this plan delivers

A compiler that parses the **full core scratchblocks grammar** — nested reporters, booleans, infix operators, dropdown menus (shadow-input and direct-field), `if/else`/`repeat until`/`forever` — and compiles a multi-shape program to an `.sb3` that **runs correctly in a headless `scratch-vm`**, with the `BlockDef`/`InputSpec`/`FieldSpec` schema and the recursive-descent parser **frozen for the per-category ultracode fan-out to extend by adding entries only**.
