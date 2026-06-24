# Scratch Compiler — Infrastructure Extensions (broadcasts · lists · extensions[]) — Design

**Date:** 2026-06-24
**Status:** Design — awaiting user review
**Project root:** `~/scratch-mcp` (builds on the merged [parser-grammar foundation](2026-06-23-parser-grammar-foundation-design.md))

## 1. Goal

Add the shared compiler machinery the **full core block palette** needs but the parser-grammar foundation deliberately deferred: `project.json` **`extensions[]`** population (Pen/Music), **broadcasts** (`broadcast` / `when I receive` / `broadcast and wait`), and **lists** (the `data_*list*` blocks + the `[13,…]` list-reporter primitive). Each is proven on **hand-built IR** through a headless `scratch-vm@5.0.300` before any category entries are authored, then the extended contract is **re-frozen**.

This is **Sub-project A** of the block-dictionary build-out. **Sub-project B** (the per-category palette fan-out — one agent per category adding entries + per-block tests only) gets its own spec → plan, authored against the contract this plan freezes. A exists so that B never has to touch the parser, packager, manifest model, or schema — only add `BlockDef` entries.

It is deliberately the de-risk step, mirroring how the foundation proved its riskiest contract (extended input encoding actually running in the VM) on hand-built IR before the parser existed.

## 2. What freezes vs. what grows

**Frozen (unchanged by this plan):**
- `compileProject(dir): Promise<CompileResult>` and `CompileResult { ok; sb3?; diagnostics }`.
- The *outer* shape of `ParsedBlock { opcode; inputs; fields; substacks }` and `ParsedScript { blocks }`.
- `Diagnostic`; the variable-id resolution rule (own ∪ global-Stage) and the `meta` envelope.
- The recursive-descent parser core and the existing input-encoding paths (literal / variable-primitive / nested-reporter / boolean / menu / two-substacks) — extended additively, never rewritten.

**Grows (the point of this plan), all additive:**
- **`ShadowType`** — widen from `4|6|8|9|10` to add `7` (math_integer), needed by list-index inputs. (Foundation note: "widen only as a block needs.")
- **`FieldSpec`** — add `{ kind: "broadcast" }` and `{ kind: "list" }` (both resolve to `[name, id]`, against the broadcast and list registries respectively).
- **`InputValue`** — add `{ kind: "list"; name: string }` (a list used as a reporter input → the `[13,…]` primitive), via the existing `kind` discriminant (same growth pattern the foundation used).
- **Manifest model** — `TargetDecl` gains `lists?: ListDecl[]` and a `ListDecl { name; value: (string|number)[] }`; `parseManifest` reads a `lists:` block (`global` / per-sprite) mirroring `variables:`. Additive — existing manifests without `lists:` are unaffected.
- **The packager** — `extensions[]` auto-population; broadcast registry → Stage `broadcasts[]` + broadcast field/menu encoding; list registry → target `lists[]` + list field encoding + the `[13,…]` list-reporter primitive.
- **The parser** — a `knownLists: Set<string>` parameter (threaded by the orchestrator, mirroring `knownVars`) so a bare `(mylist)` round-slot classifies as a list reporter and `[mylist v]` binds a `list`/`broadcast` field; broadcast names are collected from the source as they are parsed.

## 3. §1 — `extensions[]` auto-population

After all targets' blocks are emitted, the packager scans every block's `opcode` and builds the `extensions` array:
- any `pen_*` opcode → include `"pen"`;
- any `music_*` opcode → include `"music"`;
- deduplicated, stable order (`["pen","music"]` order if both present).

No schema/parser change. This is a pure post-pass over the emitted block set (a small `collectExtensions(blocks): string[]` helper), replacing the current hard-coded `extensions: []` in the `project.json` envelope.

**Proving slice:** one `pen_*` BlockDef (e.g. `pen_clear`, `signature:"erase all"`, shape `stack`, no inputs) and one `music_*` BlockDef (e.g. `music_restForBeats`, `signature:"rest for (BEATS) beats"`, shape `stack`, one number input). Tests: a project using the pen block has `extensions:["pen"]`; using both yields `["pen","music"]`; a project using neither keeps `extensions:[]`; and each `.sb3` loads + runs in the VM without error. (These two BlockDefs are the proving slice only; the full Pen/Music palettes are Sub-project B.)

## 4. §2 — Broadcast machinery

**Model — auto-collected from source.** Broadcasts are not manifest-declared; using a message creates it (matches Scratch's UX). A packager-scope `resolveBroadcast(name): id` registry assigns a stable id on first sight and accumulates `{ id → name }`, which is written to the **Stage** target's `broadcasts` map (`broadcasts: { "<id>": "<name>" }`). Broadcasts are global in Scratch 3 and always live on the Stage regardless of which sprite uses them.

**Schema.** `FieldSpec` gains `{ kind: "broadcast" }`. A broadcast *input* (the `broadcast`/`broadcast and wait` argument) is modelled as a menu whose shadow block's field is a broadcast reference rather than a plain dropdown value — encoded by the packager when the menu's field kind is `broadcast` (no new `InputSpec` kind needed beyond the existing `menu`, which already carries `menuOpcode`/`field`; the field's *value form* `[name,id]` vs `[value,null]` is selected by a `broadcast` flag on the menu spec).

**Encoding (Scratch 3 forms):**
- `when I receive [m v]` → `event_whenbroadcastreceived`, `fields: { BROADCAST_OPTION: [name, id] }` (hat).
- `broadcast [m v]` → `event_broadcast`, `inputs: { BROADCAST_INPUT: [1, menuId] }`; menu block `event_broadcast_menu`, `fields: { BROADCAST_OPTION: [name, id] }`, `shadow:true, topLevel:false`.
- `broadcast [m v] and wait` → `event_broadcastandwait`, same `BROADCAST_INPUT` menu shape.

**Parser.** Reuses the existing `[x v]` menu/field tokenization. The new behaviour: a `broadcast`-kind field/menu records its name in the broadcast registry; the registry is shared across all targets so the Stage collects every message.

**Proving slice (VM gate):**
```
when green flag clicked        |  when I receive [go v]
broadcast [go v]               |  set [x v] to (1)
```
⇒ assert **x == 1** after green-flag + step. Plus a structural assert that the Stage `broadcasts` map contains `go` and the `BROADCAST_OPTION` fields on both blocks reference the same id.

## 5. §3 — List machinery

**Model — manifest-declared (like variables).** `project.yaml` gains a `lists:` block parallel to `variables:`:
```yaml
variables:
  global: { score: 0 }
lists:
  global: { inventory: [] }      # global lists live on the Stage
```
`parseManifest` reads it into `TargetDecl.lists: ListDecl[]` (`ListDecl { name; value: (string|number)[] }`). Global lists attach to the Stage; per-sprite lists attach to that sprite — identical scoping to variables. A `resolveList(name)` registry (own ∪ global-Stage) assigns ids, mirroring `resolveVar`.

**knownLists.** The orchestrator builds `knownLists = own list names ∪ global Stage list names` per target and threads it to the parser alongside `knownVars`, so a bare `(inventory)` in a round slot classifies as a list reporter and `[inventory v]` binds a `list` field.

**Schema.** `FieldSpec` gains `{ kind: "list" }` (resolves to `[name,id]`). `InputValue` gains `{ kind: "list"; name }` for a list used as a reporter input.

**Encoding (Scratch 3 forms):**
- target `lists: { "<id>": ["<name>", [ …initial contents… ]] }` (a `[name, contents[]]` pair, unlike variables' `[name, value]`).
- list **field**: `fields: { LIST: [name, id] }` (e.g. `data_addtolist`, `data_deleteoflist`, `data_itemoflist`, `data_lengthoflist`).
- list value inputs: literal/number as usual; an index input uses shadow type `7` (math_integer): `[1, [7, "1"]]`.
- list as a **reporter input**: the `[13, name, id]` primitive, wrapped like the variable primitive when obscuring a shadow.

**Proving slice (VM gate):**
```
when green flag clicked
add [a] to [inventory v]
add [b] to [inventory v]
set [n v] to (item (2) of [inventory v])
```
⇒ assert **n == "b"** (proves the `LIST` field `[name,id]`, list registration in `lists[]`, the integer index input, and the `data_itemoflist` reporter all round-trip through the VM). Plus a structural assert of the `lists` map shape.

## 6. §4 — Proving slice, test strategy, re-freeze

A handful of blocks exercising **every** new mechanism, each with a per-block semantic test (compile a minimal snippet → load in headless VM → greenFlag → step → assert a runtime effect), following the foundation's discipline:

| Mechanism | Snippet | Assertion |
|---|---|---|
| `extensions[]` from pen/music opcodes | a script using `erase all` (+ a music block) | `extensions` contains `"pen"` (and `"music"`); `.sb3` runs |
| broadcast round-trip | `broadcast [go]` ↔ `when I receive [go] → set [x] to (1)` | `x == 1` |
| list ops + index reporter | `add`×2 + `item (2) of` | `n == "b"` |

**Dual standard (from the foundation):** runtime-assert wherever headless-deterministic (all three slices are); for any future mechanism that needs a renderer/sensing, structural-assert the `project.json` + assert the `.sb3` loads and runs. Stated here so Sub-project B applies it consistently.

**Re-freeze.** On completion, the extended contract — `ShadowType+7`, `FieldSpec` `{broadcast}`/`{list}`, `InputValue` `{list}`, `TargetDecl.lists`/`ListDecl`, `knownLists`, the broadcast/list/extensions packager paths — is frozen. Sub-project B adds `BlockDef` entries + tests only, against it.

## 7. Deferred (explicitly out of this plan)

- **The full per-category palette** — every Motion/Looks/Sound/Events/Control/Sensing/Operators/Variables/Lists/Pen/Music block. That is **Sub-project B** (its own spec → plan → fan-out). This plan ships only the tiny proving slice per mechanism.
- **Custom blocks / procedures** (`define`, `procedures_*`, mutations, `warp`) — still deferred to their own plan, as in the foundation.
- **Asset resolver** — separate plan; the placeholder costume remains the fallback.
- **Unbracketed-infix leniency**, **on-stage monitors**, **raw-block escape hatch** — recorded foundation deferrals, unchanged.

## 8. Error handling

Unchanged contract: **fail loud, collect all.** An unresolved list reference is an `error` `Diagnostic` (mirroring the unresolved-variable rule). A `broadcast`-input or list-field on a malformed block follows the existing fail-loud paths. `compileProject` returns `{ ok:false, diagnostics }` and no `.sb3` if any `error` fires. Never a silently-broken project.

## 9. Testing & tech stack

TypeScript (strict, ESM), Node ≥25, Vitest, headless `scratch-vm@5.0.300`. No new runtime deps. Per-mechanism semantic tests (compile → headless VM → assert runtime effect) plus structural assertions on the new `project.json` shapes (Stage `broadcasts`, target `lists`, `extensions`).

## 10. Open questions / risks

1. **Broadcast id form.** Scratch uses readable broadcast ids in some exports and uuid-like ids in others; any stable, unique string works as long as the hat field and the menu field share it. The VM gate validates round-trip regardless of id format. Risk: low.
2. **List initial contents typing.** `ListDecl.value` is `(string|number)[]`; the VM stores list items as strings. The slice asserts a string result (`n == "b"`) to avoid coercion ambiguity.
3. **`broadcast` as a menu-with-ref vs. a distinct InputSpec kind.** Chosen: a flag on the existing `menu` spec selecting the `[name,id]` field-value form. If that proves awkward in implementation, a dedicated `{kind:"broadcast-input"}` InputSpec is the fallback — surface as an implementation finding, not a silent divergence.
4. **`TargetDecl.lists` touches the "frozen" manifest model.** It is additive (new optional field) — the same controlled growth `InputValue` underwent — and the foundation explicitly anticipated lists landing here.

## 11. What this plan delivers

A compiler whose shared machinery supports the **entire remaining core grammar** — Pen/Music `extensions[]`, broadcasts, and lists — each **proven to run in a headless `scratch-vm`** on hand-built IR, with the extended `FieldSpec`/`InputValue`/`ShadowType`/manifest/parser/packager contract **frozen for the Sub-project B per-category fan-out to extend by adding entries only**.
