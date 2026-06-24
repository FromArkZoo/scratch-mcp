# Block-Dictionary Build-Out — Sub-project B: Per-Category Palette Fan-Out — Design

**Date:** 2026-06-24
**Status:** Design — awaiting user review
**Project root:** `~/scratch-mcp` (builds on the merged [infra-extensions](2026-06-24-infra-extensions-design.md), itself on the merged [parser-grammar foundation](2026-06-23-parser-grammar-foundation-design.md))

## 1. Goal

Fill out the **entire core Scratch-3 block palette** as `BlockDef` entries against the now-frozen `BlockDef`/`InputSpec`/`FieldSpec`/`ShadowType` contract, so the compiler parses and emits every default-palette block. Sub-project A built the shared machinery (broadcasts, lists, `extensions[]`) and re-froze the contract specifically so B is **entries + per-block tests only**.

The authoritative block set was derived by reading scratch-vm@5.0.300's own `getPrimitives()`/`getHats()` and the pen/music `getInfo()` definitions (not from memory), cross-checked against the bundled sb2 specmap, and audited by a completeness critic: **137 default-palette blocks across 11 categories, 0 missing / 0 extra.** 27 already exist as A's proving slice → **110 net-new entries.**

| Motion 18 · Looks 21 · Sound 9 · Events 9 · Control 11 · Sensing 18 · Operators 18 · Variables 5 · Lists 12 · Pen 9 · Music 7 |

## 2. Scope — the completeness bar

**Full default-palette parity, minus custom blocks.** A block is in scope iff a user sees it in the default editor palette (Motion / Looks / Sound / Events / Control / Sensing / Operators / Variables / Lists + the Pen and Music extensions). This **includes**:
- asset-referencing blocks (`switch costume/backdrop to`, `play sound`) — the name resolves to the placeholder asset; the block emits valid JSON and loads+runs (the switch/play is a runtime no-op until the asset resolver lands);
- renderer/sensing/IO blocks (say, touching?, mouse x, ask & wait) — tested under the dual standard (§5);
- cloning (`when I start as a clone`, `create clone of`, `delete this clone`).

**Excluded** (deferred to their own plans, unchanged from the foundation/infra spec §7): custom blocks / procedures (`define`, `procedures_*`, mutations, `warp`); the asset resolver; on-stage monitors (the persistent `monitors[]` objects — the `show/hide variable/list` *blocks* are in scope); unbracketed-infix leniency; raw-block escape hatch.

The two variable/list **reporters** (`data_variable`, `data_listcontents`) are **parser-implicit** — a bare `(name)` resolves via `knownVars`/`knownLists`; they need no `BlockDef`. They count toward palette parity but author no entry.

## 3. What freezes vs. what grows

**Frozen (B must not touch):** `compileProject` / `CompileResult`; the outer shapes of `ParsedBlock`/`ParsedScript`/`Diagnostic`; the variable/list/broadcast resolution rules and the `meta` envelope; the manifest model; the existing input-encoding paths in the packager; `ShadowType` (already `4|6|7|8|9|10` — **B needs no new shadow type**: number 4, positive-int 6, integer 7, angle 8, color 9, text 10 cover the whole palette).

**Grows — exactly one additive contract delta, landed in Task 0 (§4), then re-frozen:**
- **`FieldSpec` `dropdown` gains an optional `options?: string[]`** — the fixed inline option set for a dropdown field. Required only where two signatures would otherwise be indistinguishable (the effect-block collision, §4.3); encouraged elsewhere because it also enables fail-loud validation of dropdown values. Purely additive (optional field); existing `{kind:"dropdown"}` entries are unaffected.

No new `InputSpec`/`FieldSpec` *kinds*, no mutations, no packager-shape changes. Every one of the 137 blocks is expressible as a pure entry against the contract once Task 0 lands.

## 4. Task 0 — shared prep (serial, before the fan-out)

The taxonomy is entries-only at the *contract* level, but the parser/matcher need hardening before 110 entries pile in, and the fan-out needs a conflict-free file layout. Task 0 is a single serial task with its own TDD + review, landed first. **After Task 0 the contract (incl. the `options` delta) is re-frozen and the parallel fan-out begins.**

### 4.1 Registry split into per-category modules
Move the 27 slice entries into `src/compiler/blocks/categories/<category>.ts` (each exports `const <CATEGORY>: BlockDef[]`); `registry.ts` concatenates them into `SLICE = [...motion, ...looks, …]` and keeps `byOpcode`/`bySignature` exactly as today. This makes the 11-way fan-out **conflict-free** — each category agent owns one module + one test file. The suite stays green (a pure move; `SLICE` membership unchanged).

### 4.2 Skeleton-uniqueness assertion (the durable guard)
At registry build (module load), compute for every non-synthetic `BlockDef` a key = **pool** (`reporter`→REPORTER, `boolean`→BOOLEAN, `{hat,stack,cap,c}`→STATEMENT — mirroring how `matchStatement` pools all non-reporter/boolean shapes) + **literal words** + **hole shapes** (round/boolean/menu/square; hole *names* erased, exactly as `sigTokens` does) + **the sorted `options` set of each dropdown field** (so option-distinguished defs are not "duplicates"). **Throw on any duplicate key.** This runs as a module-load invariant *and* a unit test — it is the load-bearing safety net that makes the registry order-independent and would have caught the effect collisions. With it, SLICE order no longer affects correctness.

### 4.3 Effect-collision fix (`options[]` + matcher tiebreak)
`looks_seteffectto`/`sound_seteffectto` and `looks_changeeffectby`/`sound_changeeffectby` have byte-identical signatures (`set [EFFECT v] effect to (VALUE)` etc.); the dropdown value is the only discriminator (pitch/pan = sound; color/fisheye/whirl/pixelate/mosaic/brightness/ghost = looks). Fix:
- the four effect entries declare `options` (looks: the 7 graphic effects; sound: `["pitch","pan"]`);
- the matcher, on a skeleton match whose def has a dropdown with `options`, **accepts the def only if the authored dropdown value ∈ `options`**, else continues scanning the remaining skeleton-matching defs;
- if the value matches **no** colliding def's options → a fail-loud `error` diagnostic (`unknown effect "<x>"`), per the global fail-loud constraint.

This keeps **standard scratchblocks** (`set [pitch v] effect to (100)`) parsing to the correct opcode and adds dropdown-value validation. The matcher change is small and only affects defs that declare `options` (backward-compatible).

### 4.4 Carried hardening minors (from the foundation/infra ledgers)
- Exclude the `control_if_else` sentinel from `matchStatement` (a `synthetic: true` flag on the `BlockDef`, filtered out when building `SIGS`) so a single-line `if <x> then else` can't match it directly and mis-structure its body; the two-line `if/else/end` idiom still works (`control_if` is matched and flipped on the `else` line, unchanged).
- Add `]` to the lexer bare-word stop-set (`!" \t()<>[]".includes(...)`), so a stray `]` is its own boundary instead of gluing onto the adjacent word (asymmetric-bracket mis-tokenization).
- Tighten the two broad test regexes flagged in the foundation review (the over-permissive locking-test matchers) so they don't mask the new behavior.

### 4.5 Zero-arg reporter reachability fix
Bare single-word zero-arg reporters written in a round slot — `(direction)`, `(size)`, `(volume)`, `(tempo)`, `(answer)`, `(timer)`, `(loudness)`, `(username)` — currently early-return as string literals in `parseRound` (`gs.length === 1`) and are unreachable as reporters. Generic fix: after the `knownVars`/`knownLists` checks and **before** the single-word literal fallback, match a registered 1-token, no-hole `reporter` signature. Precedence stays `numeric → knownVars → knownLists → zero-arg reporter → literal` (a user variable named `timer` still wins — documented). Generic over `SLICE`, so the reporters light up as their categories add them; Task 0 anchors the mechanism with at least one zero-arg reporter present + a locking test.

## 5. Testing — dual standard with a loads-and-runs floor

Every entry is tested in its category's `tests/compiler/<category>.test.ts`, following the foundation's discipline (compile a minimal snippet → load in headless `scratch-vm` → greenFlag → step → assert).

- **Tier 1 — runtime-assert** (91 blocks): the effect surfaces in headless VM state — `target.x/y/direction/size/visible/currentCostume/volume/effects/draggable`, variables, list contents, `runtime.targets.length` (clone count), broadcast→receiver side-effects, the timer. Assert the observable directly (each entry's `runtimeProbe` is recorded in Appendix A).
- **Tier 2 — structural + loads-and-runs** (46 blocks): renderer/audio/IO or non-deterministic (say/think, costume/backdrop switch, sound playback, all Pen draw, touching/distance/color, mouse/key/ask-answer/loudness, username, current-date). Assert the emitted `project.json` shape (opcode / inputs / fields / menu shadow) **and** that the `.sb3` loads + steps without throwing.
- **Hard floor:** *no* entry ships without at least Tier 2 — every one of the 137 blocks proves it loads and steps in a real VM.

Tier split: Motion 14/4 · Looks 12/9 · Sound 6/3 · Events 4/5 · Control 11/0 · Sensing 4/14 · Operators 18/0 · Variables 5/0 · Lists 12/0 · Pen 0/9 · Music 5/2.

**Documented cosmetic-fidelity compromises** (all emit valid, runnable sb3; recorded as known minors, never silent):
- `control_stop` — `STOP_OPTION` dropdown only; the editor `hasnext` mutation is omitted (verified: the runtime `stop()` reads only `args.STOP_OPTION`). Modeled `shape:"stack"` so "other scripts in sprite" can carry a following block.
- music `NOTE` → number shadow (type 4); the piano-picker `note` shadow is editor-only (VM does `Cast.toNumber(args.NOTE)`).
- `switch costume/backdrop to`, `play sound …` → reference the placeholder asset → runtime no-op (Tier 2).
- color inputs (`touching color [#…]?`, `set pen color to [#…]`) → `shadowType 9`, authored `#rrggbb` literal.

## 6. Fan-out structure (Workflow + worktrees)

Execution after the plan is written: a **Workflow** orchestrates the fan-out.
1. **Task 0** (serial) — §4, with TDD + review; re-freeze on completion.
2. **Tasks 1–11** — one agent per category, each in its own **git worktree**, each adding only `categories/<category>.ts` + `tests/compiler/<category>.test.ts` (conflict-free after the split). Each is TDD, VM-gated, and reviewed. The skeleton-uniqueness assertion guards every merge. Suggested models: **haiku** for transcription-heavy categories (Motion, Operators, Variables, Lists), **sonnet** for menu/encoding-trickier ones (Looks, Sound, Events, Control, Sensing, Pen, Music); **opus** for any VM-gate review escalation.
3. **Task 12** — completeness/parity audit (all 137 opcodes present, each appears in a loading `.sb3`, dual-standard floor met, skeleton assertion green, full suite + `tsc` clean) → **opus whole-branch review** → `finishing-a-development-branch` → merge to main (local repo, no remote).

Gate policy (carried): gate on `npx vitest run tests/compiler/` + `npx tsc --noEmit`; re-run any flaky editor test (`tests/editor/launch.test.ts`) in isolation rather than treating a parallel-load flake as failure.

## 7. Error handling

Unchanged contract: **fail loud, collect all.** Unresolved variable/list/broadcast references stay `error` diagnostics; an unknown dropdown value on an `options`-bearing field is a new fail-loud `error` (§4.3). `compileProject` returns `{ ok:false, diagnostics }` and no `.sb3` if any `error` fires. Never a silently-broken project.

## 8. Testing & tech stack

TypeScript (strict, ESM), Node ≥25, Vitest, headless `scratch-vm@5.0.300`. No new runtime deps. Per-block semantic tests (compile → headless VM → assert) + structural assertions for Tier-2 blocks.

## 9. Open questions / risks

1. **Menu opcodes / defaults / field-vs-menu calls** carry per-block confidence (Appendix A). Every uncertain call (`looks_costume`/`looks_backdrops` defaults, `pen_menu_colorParam` field name, sensing menu opcodes, music drum/instrument menus) is **VM-gated** in its category test (the `.sb3` loads+runs, proving the shadow shape). Risk: low — a wrong menu opcode throws on VM load and is caught by the floor.
2. **`shadowType 9` empty default.** A color input with no authored value would emit `[9,""]`; valid source always supplies a `#rrggbb`, so this is unreachable, but Appendix-A color entries note the authored-literal expectation.
3. **`options` matcher tiebreak ordering.** The tiebreak must run inside both `matchStatement` and the reporter/boolean matcher path (shared option-check), and the skeleton assertion must key on the sorted option-set; both are Task-0 unit-tested so the two effect pairs are simultaneously reachable.
4. **Worktree merge order.** The skeleton assertion makes registry order irrelevant, so category modules merge in any order; only Task 0 must precede all of them.

## 10. What this delivers

A compiler that parses and emits the **entire core Scratch-3 default palette** (137 blocks, full parity minus custom blocks), every block proven to load and step in a headless `scratch-vm`, behind a contract that grew by exactly one optional field — re-frozen for any later plan (custom blocks, asset resolver) to extend.

---

## Appendix A — Authoritative per-category block catalog

Derived from scratch-vm@5.0.300 source, completeness-audited. `enc` summarizes inputs (`NAME:shadowType`, `NAME→menu(opcode)`, `NAME<bool>`, `SUB⎵substack`) and fields (`NAME:dropdown[opts]/variable/list/broadcast`). `slice` = already an A entry. Tier per §5.

### Motion (18 — 3 in slice, 15 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `move (STEPS) steps` | motion_movesteps | stack | STEPS:4 | 1 | *slice*; probe: After move with direction=90, assert target.x increased by STEPS (e.g. from 0 to STEPS); generally assert target.x/target.y changed deterministically. |
| `turn right (DEGREES) degrees` | motion_turnright | stack | DEGREES:4 | 1 | *slice*; probe: From direction 90, turn right 90 -> assert target.direction === 180 (Scratch direction wrap). |
| `turn left (DEGREES) degrees` | motion_turnleft | stack | DEGREES:4 | 1 | probe: From direction 90, turn left 90 -> assert target.direction === 0 wraps to Scratch range (-90 == 0? actually 0); generally assert target.direction decreased by DEGREES modulo Scratch wrap. |
| `point in direction (DIRECTION)` | motion_pointindirection | stack | DIRECTION:8 | 1 | probe: point in direction 90 -> assert target.direction === 90. |
| `point towards [TOWARDS v]` | motion_pointtowards | stack | TOWARDS→menu(motion_pointtowards_menu) | 2 |  |
| `go to x: (X) y: (Y)` | motion_gotoxy | stack | X:4 Y:4 | 1 | probe: go to x:10 y:20 -> assert target.x === 10 && target.y === 20. |
| `go to [TO v]` | motion_goto | stack | TO→menu(motion_goto_menu) | 2 | *slice* |
| `glide (SECS) secs to x: (X) y: (Y)` | motion_glidesecstoxy | stack | SECS:4 X:4 Y:4 | 1 | probe: glide 0 secs to x:5 y:5 (duration<=0 snaps) -> assert target.x===5 && target.y===5; or step until thread done for SECS>0 then assert final position. |
| `glide (SECS) secs to [TO v]` | motion_glideto | stack | SECS:4 TO→menu(motion_glideto_menu) | 2 |  |
| `change x by (DX)` | motion_changexby | stack | DX:4 | 1 | probe: From x=0, change x by 10 -> assert target.x === 10 (and target.y unchanged). |
| `set x to (X)` | motion_setx | stack | X:4 | 1 | probe: set x to 42 -> assert target.x === 42. |
| `change y by (DY)` | motion_changeyby | stack | DY:4 | 1 | probe: From y=0, change y by 10 -> assert target.y === 10 (and target.x unchanged). |
| `set y to (Y)` | motion_sety | stack | Y:4 | 1 | probe: set y to 42 -> assert target.y === 42. |
| `if on edge, bounce` | motion_ifonedgebounce | stack | — | 2 |  |
| `set rotation style [STYLE v]` | motion_setrotationstyle | stack | STYLE:dropdown | 1 | probe: set rotation style [left-right] -> assert target.rotationStyle === 'left-right'. |
| `x position` | motion_xposition | reporter | — | 1 | probe: set sprite x to 7, then run 'set [v] to (x position)' -> assert variable v === 7. |
| `y position` | motion_yposition | reporter | — | 1 | probe: set sprite y to 7, then 'set [v] to (y position)' -> assert variable v === 7. |
| `direction` | motion_direction | reporter | — | 1 | probe: point in direction 90, then 'set [v] to (direction)' -> assert variable v === 90. |

### Looks (21 — 0 in slice, 21 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `say (MESSAGE) for (SECS) seconds` | looks_sayforsecs | stack | MESSAGE:10 SECS:4 | 2 |  |
| `say (MESSAGE)` | looks_say | stack | MESSAGE:10 | 2 |  |
| `think (MESSAGE) for (SECS) seconds` | looks_thinkforsecs | stack | MESSAGE:10 SECS:4 | 2 |  |
| `think (MESSAGE)` | looks_think | stack | MESSAGE:10 | 2 |  |
| `switch costume to [COSTUME v]` | looks_switchcostumeto | stack | COSTUME→menu(looks_costume) | 2 | conf:medium |
| `next costume` | looks_nextcostume | stack | — | 1 | probe: After stepping, assert target.currentCostume incremented by 1 (mod costume count) vs its pre-step value (target.setCostume wraps the index). |
| `switch backdrop to [BACKDROP v]` | looks_switchbackdropto | stack | BACKDROP→menu(looks_backdrops) | 2 | conf:medium |
| `switch backdrop to [BACKDROP v] and wait` | looks_switchbackdroptoandwait | stack | BACKDROP→menu(looks_backdrops) | 2 | conf:medium |
| `next backdrop` | looks_nextbackdrop | stack | — | 1 | probe: Assert runtime.getTargetForStage().currentCostume incremented by 1 (mod backdrop count) after stepping. |
| `change [EFFECT v] effect by (CHANGE)` | looks_changeeffectby | stack | CHANGE:4 EFFECT:dropdown | 1 | probe: Assert target.effects[<effect>] changed by CHANGE (clamped) after stepping; e.g. effect 'color' goes from 0 to CHANGE. |
| `set [EFFECT v] effect to (VALUE)` | looks_seteffectto | stack | VALUE:4 EFFECT:dropdown | 1 | probe: Assert target.effects[<effect>] === VALUE (clamped) after stepping. |
| `clear graphic effects` | looks_cleargraphiceffects | stack | — | 1 | probe: Set an effect to nonzero, run clear, assert all values in target.effects are 0. |
| `change size by (CHANGE)` | looks_changesizeby | stack | CHANGE:4 | 1 | probe: Assert target.size increased by CHANGE after stepping (from default 100 to 100+CHANGE, subject to size clamp). |
| `set size to (SIZE) %` | looks_setsizeto | stack | SIZE:4 | 1 | probe: Assert target.size === SIZE after stepping (subject to renderer-independent size clamp). |
| `show` | looks_show | stack | — | 1 | probe: Hide first, then run show; assert target.visible === true. |
| `hide` | looks_hide | stack | — | 1 | probe: Run hide; assert target.visible === false. |
| `go to [FRONT_BACK v] layer` | looks_gotofrontback | stack | FRONT_BACK:dropdown | 2 |  |
| `go [FORWARD_BACKWARD v] (NUM) layers` | looks_goforwardbackwardlayers | stack | NUM:7 FORWARD_BACKWARD:dropdown | 2 |  |
| `costume [NUMBER_NAME v]` | looks_costumenumbername | reporter | NUMBER_NAME:dropdown | 1 | probe: Stack into a variable: set [v] to (costume [number v]); assert variable === target.currentCostume+1. Or [name v] returns target costume name. |
| `backdrop [NUMBER_NAME v]` | looks_backdropnumbername | reporter | NUMBER_NAME:dropdown | 1 | probe: set [v] to (backdrop [number v]); assert variable === stage.currentCostume+1. |
| `size` | looks_size | reporter | — | 1 | probe: set size to (50), then set [v] to (size); assert variable === 50. |

### Sound (9 — 0 in slice, 9 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `play sound [SOUND_MENU v] until done` | sound_playuntildone | stack | SOUND_MENU→menu(sound_sounds_menu) | 2 | conf:medium |
| `start sound [SOUND_MENU v]` | sound_play | stack | SOUND_MENU→menu(sound_sounds_menu) | 2 | conf:medium |
| `stop all sounds` | sound_stopallsounds | stack | — | 2 |  |
| `set [EFFECT v] effect to (VALUE)` | sound_seteffectto | stack | VALUE:4 EFFECT:dropdown | 1 | probe: After 'set [PITCH] effect to (100)', assert target.soundEffects.pitch === 100 (and pan unchanged at 0). Effect name is lowercased ('pitch'/'pan') and clamped to [-360,360] for pitch, [-100,100] for pan. |
| `change [EFFECT v] effect by (VALUE)` | sound_changeeffectby | stack | VALUE:4 EFFECT:dropdown | 1 | probe: From a fresh target (pitch=0), after 'change [PITCH] effect by (10)' assert target.soundEffects.pitch === 10; another change of 10 → 20; clamps at +/-360 (pitch) / +/-100 (pan). |
| `clear sound effects` | sound_cleareffects | stack | — | 1 | probe: After setting pitch=50 then 'clear sound effects', assert target.soundEffects.pitch === 0 && target.soundEffects.pan === 0. |
| `change volume by (VOLUME)` | sound_changevolumeby | stack | VOLUME:4 | 1 | probe: From default volume 100, after 'change volume by (-30)' assert target.volume === 70; clamps to 0 and 100 at the bounds. |
| `set volume to (VOLUME) %` | sound_setvolumeto | stack | VOLUME:4 | 1 | probe: After 'set volume to (40) %' assert target.volume === 40; 'set volume to (150)' clamps to 100; negative clamps to 0. |
| `volume` | sound_volume | reporter | — | 1 | probe: After 'set volume to (55) %', evaluate the (volume) reporter (e.g. nest in 'set [v] to (volume)') and assert it reports 55 / target.volume === 55. |

### Events (9 — 4 in slice, 5 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `when green flag clicked` | event_whenflagclicked | hat | — | 1 | *slice*; probe: runtime.greenFlag(); step; assert a body side-effect (e.g. a variable set by the script) changed. |
| `when [KEY_OPTION v] key pressed` | event_whenkeypressed | hat | KEY_OPTION:dropdown | 2 |  |
| `when this sprite clicked` | event_whenthisspriteclicked | hat | — | 2 |  |
| `when stage clicked` | event_whenstageclicked | hat | — | 2 | conf:medium |
| `when backdrop switches to [BACKDROP v]` | event_whenbackdropswitchesto | hat | BACKDROP:dropdown | 2 |  |
| `when [WHENGREATERTHANMENU v] > (VALUE)` | event_whengreaterthan | hat | VALUE:4 WHENGREATERTHANMENU:dropdown | 2 | conf:medium |
| `when I receive [BROADCAST_OPTION v]` | event_whenbroadcastreceived | hat | BROADCAST_OPTION:broadcast | 1 | *slice*; probe: Have a broadcaster set a variable in this hat's body; broadcast the message and step; assert the variable changed (broadcast→receiver side-effect). |
| `broadcast [BROADCAST_INPUT v]` | event_broadcast | stack | BROADCAST_INPUT→menu(event_broadcast_menu,bcast) | 1 | *slice*; probe: Broadcast a message whose receiver sets a variable/list; step; assert the receiver's side-effect (broadcast→receiver) is observed. |
| `broadcast [BROADCAST_INPUT v] and wait` | event_broadcastandwait | stack | BROADCAST_INPUT→menu(event_broadcast_menu,bcast) | 1 | *slice*; probe: Broadcast-and-wait to a receiver that sets var A, then have the caller set var B after; step; assert A set before B (caller blocked until receiver done). |

### Control (11 — 5 in slice, 6 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `wait (DURATION) seconds` | control_wait | stack | DURATION:4 | 1 | probe: Start a thread with 'wait (0.2) seconds' followed by 'set [done] to (1)'; step the VM and assert the variable is NOT set before ~0.2s of stepping has elapsed, then IS set after; or assert the thread remains in runtime.threads (status YIELD) immediately after the wait block runs. |
| `repeat (TIMES)` | control_repeat | c | TIMES:6 SUBSTACK⏫sub | 1 | *slice*; probe: 'repeat (3)' with body 'change [count] by (1)'; after run assert count == 3. |
| `forever` | control_forever | c | SUBSTACK⏫sub | 1 | *slice*; probe: 'forever' with body 'change [count] by (1)'; step N frames and assert count increased by N (one body iteration per frame) and the thread is still present/running. |
| `if <CONDITION> then` | control_if | c | CONDITION<bool> SUBSTACK⏫sub | 1 | *slice*; probe: 'if <(1) = (1)> then { set [hit] to (1) }'; assert hit==1; with a false condition assert hit unchanged. |
| `if <CONDITION> then else` | control_if_else | c | CONDITION<bool> SUBSTACK⏫sub SUBSTACK2⏫sub | 1 | *slice*; probe: false condition: assert SUBSTACK2 body ran (else var set) and SUBSTACK body did not. |
| `wait until <CONDITION>` | control_wait_until | stack | CONDITION<bool> | 1 | probe: Thread: 'wait until <(answer) = (1)>' then 'set [passed] to (1)'. Set a variable used in the condition to a true-making value mid-run; assert 'passed' is unset while condition false and set once it becomes true (thread stays in YIELD until then). |
| `repeat until <CONDITION>` | control_repeat_until | c | CONDITION<bool> SUBSTACK⏫sub | 1 | *slice*; probe: 'repeat until <(count) = (3)> { change [count] by (1) }'; assert count==3 after run. |
| `stop [STOP_OPTION v]` | control_stop | cap | STOP_OPTION:dropdown | 1 | conf:medium; probe: Thread A: 'forever { change [a] by (1) }'. Thread B: 'wait (0.05) secs; stop [all v]'. After B runs, step further and assert thread A is gone (runtime.threads no longer contains it) and 'a' stops increasing. For 'this script' assert the current thread terminates (the block after it never runs).; ⚠ control_stop carries a 'mutation' (hasnext: true/false) that toggles its shape: 'stop all' and 'stop this script' are CAP blocks (hasnext=false), but 'stop other scripts in sprite/stage' is a STACK block (hasnext=true) that allows blocks beneath it. The frozen BlockDef contract has no mutation field and one fixed shape per entry, so the shape varies with the chosen STOP_OPTION. Packager must emit the control_stop mutation in project.json (and pick stack vs cap shape per option). Modeled here as cap with the palette-default option 'all'; needs special packager handling. |
| `when I start as a clone` | control_start_as_clone | hat | — | 1 | probe: On a sprite, 'when I start as a clone { change [clones] by (1) }' plus a flag script 'create clone of [myself v]'; after run assert clones==1 and runtime.targets.length increased by 1 (the clone exists and its hat ran). |
| `create clone of [CLONE_OPTION v]` | control_create_clone_of | stack | CLONE_OPTION→menu(control_create_clone_of_menu) | 1 | probe: 'create clone of [myself v]' (CLONE_OPTION='_myself_'); after run assert runtime.targets.length increased by exactly 1 and the new target is a clone (isOriginal===false). |
| `delete this clone` | control_delete_this_clone | cap | — | 1 | probe: Create a clone, then on the clone run 'delete this clone'; assert runtime.targets.length returns to its pre-clone value and the disposed target is no longer in runtime.targets. |

### Sensing (18 — 0 in slice, 18 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `touching [TOUCHINGOBJECTMENU v]?` | sensing_touchingobject | boolean | TOUCHINGOBJECTMENU→menu(sensing_touchingobjectmenu) | 2 |  |
| `touching color (COLOR)?` | sensing_touchingcolor | boolean | COLOR:9 | 2 | conf:medium; ⚠ COLOR is a colour_picker shadow (shadowType 9). Expressible as kind:text/shadowType:9, BUT the packager emits an unfilled color as [1,[9,""]] rather than a hex literal like [9,"#rrggbb"]; VM Cast.toRgbColorList tolerates it so it loads, but a literal color default cannot be carried through the contract's empty-default path the way a real #rrggbb would. Verify the packager/parser supply a hex default for shadowType 9. |
| `color (COLOR) is touching (COLOR2)?` | sensing_coloristouchingcolor | boolean | COLOR:9 COLOR2:9 | 2 | conf:medium; ⚠ Two colour_picker shadows (shadowType 9), same hex-default caveat as sensing_touchingcolor. |
| `distance to [DISTANCETOMENU v]` | sensing_distanceto | reporter | DISTANCETOMENU→menu(sensing_distancetomenu) | 2 |  |
| `ask (QUESTION) and wait` | sensing_askandwait | stack | QUESTION:10 | 2 |  |
| `answer` | sensing_answer | reporter | — | 2 |  |
| `key [KEY_OPTION v] pressed?` | sensing_keypressed | boolean | KEY_OPTION→menu(sensing_keyoptions) | 2 |  |
| `mouse down?` | sensing_mousedown | boolean | — | 2 |  |
| `mouse x` | sensing_mousex | reporter | — | 2 |  |
| `mouse y` | sensing_mousey | reporter | — | 2 |  |
| `set drag mode [DRAG_MODE v]` | sensing_setdragmode | stack | DRAG_MODE:dropdown | 1 | probe: After 'set drag mode [draggable v]' assert target.draggable === true; after 'set drag mode [not draggable v]' assert target.draggable === false. |
| `loudness` | sensing_loudness | reporter | — | 2 |  |
| `timer` | sensing_timer | reporter | — | 1 | probe: Read sensing_timer (e.g. set a var to it): assert it is a number >= 0 and increases over successive steps; after a resettimer it is ~0. |
| `reset timer` | sensing_resettimer | stack | — | 1 | probe: After 'reset timer', read sensing_timer into a variable and assert it is ~0 (< a small epsilon). |
| `[PROPERTY v] of [OBJECT v]` | sensing_of | reporter | OBJECT→menu(sensing_of_object_menu) PROPERTY:dropdown | 1 | conf:medium; probe: Build '[x position v] of [SpriteName v]' where SpriteName.x is set to a known value; assert the reporter (captured into a variable) equals that x. PROPERTY field is a fixed dropdown; OBJECT is a menu-input shadow referencing project sprites/stage. |
| `current [CURRENTMENU v]` | sensing_current | reporter | CURRENTMENU:dropdown | 2 |  |
| `days since 2000` | sensing_dayssince2000 | reporter | — | 2 |  |
| `username` | sensing_username | reporter | — | 2 |  |

### Operators (18 — 9 in slice, 9 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `(NUM1) + (NUM2)` | operator_add | reporter | NUM1:4 NUM2:4 | 1 | *slice*; probe: Wrap in set [v] to ((4)+(5)); assert variable v === 9. |
| `(NUM1) - (NUM2)` | operator_subtract | reporter | NUM1:4 NUM2:4 | 1 | *slice*; probe: set [v] to ((10)-(3)); assert v === 7. |
| `(NUM1) * (NUM2)` | operator_multiply | reporter | NUM1:4 NUM2:4 | 1 | probe: set [v] to ((6)*(7)); assert v === 42. |
| `(NUM1) / (NUM2)` | operator_divide | reporter | NUM1:4 NUM2:4 | 1 | probe: set [v] to ((20)/(4)); assert v === 5. |
| `(OPERAND1) < (OPERAND2)` | operator_lt | boolean | OPERAND1:10 OPERAND2:10 | 1 | *slice*; probe: if <(1)<(2)> then set [v] to (1); assert v === 1. |
| `(OPERAND1) = (OPERAND2)` | operator_equals | boolean | OPERAND1:10 OPERAND2:10 | 1 | *slice*; probe: if <(5)=(5)> then set [v] to (1); assert v === 1. |
| `(OPERAND1) > (OPERAND2)` | operator_gt | boolean | OPERAND1:10 OPERAND2:10 | 1 | *slice*; probe: if <(3)>(2)> then set [v] to (1); assert v === 1. |
| `<OPERAND1> and <OPERAND2>` | operator_and | boolean | OPERAND1<bool> OPERAND2<bool> | 1 | *slice*; probe: if <<(1)=(1)> and <(2)=(2)>> then set [v] to (1); assert v === 1. |
| `<OPERAND1> or <OPERAND2>` | operator_or | boolean | OPERAND1<bool> OPERAND2<bool> | 1 | *slice*; probe: if <<(1)=(2)> or <(2)=(2)>> then set [v] to (1); assert v === 1. |
| `not <OPERAND>` | operator_not | boolean | OPERAND<bool> | 1 | *slice*; probe: if <not <(1)=(2)>> then set [v] to (1); assert v === 1. |
| `pick random (FROM) to (TO)` | operator_random | reporter | FROM:4 TO:4 | 1 | probe: set [v] to (pick random (5) to (5)); assert v === 5 (low===high short-circuit). Or assert v is an integer within [1,10] when picking 1 to 10. |
| `join (STRING1) (STRING2)` | operator_join | reporter | STRING1:10 STRING2:10 | 1 | probe: set [v] to (join [hello ] [world]); assert v === 'hello world'. |
| `letter (LETTER) of (STRING)` | operator_letter_of | reporter | LETTER:6 STRING:10 | 1 | conf:medium; probe: set [v] to (letter (1) of [apple]); assert v === 'a'. |
| `length of (STRING)` | operator_length | reporter | STRING:10 | 1 | probe: set [v] to (length of [apple]); assert v === 5. |
| `(STRING1) contains (STRING2)?` | operator_contains | boolean | STRING1:10 STRING2:10 | 1 | conf:medium; probe: if <[apple] contains [pp]?> then set [v] to (1); assert v === 1. |
| `(NUM1) mod (NUM2)` | operator_mod | reporter | NUM1:4 NUM2:4 | 1 | probe: set [v] to ((10) mod (3)); assert v === 1. |
| `round (NUM)` | operator_round | reporter | NUM:4 | 1 | probe: set [v] to (round (2.6)); assert v === 3. |
| `[OPERATOR v] of (NUM)` | operator_mathop | reporter | NUM:4 OPERATOR:dropdown | 1 | *slice*; probe: set [v] to (sqrt of (9)); assert v === 3. (OPERATOR field = 'sqrt') |

### Variables (5 — 2 in slice, 3 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `set [VARIABLE] to (VALUE)` | data_setvariableto | stack | VALUE:10 VARIABLE:variable | 1 | *slice*; probe: After running, read the target/stage variable's .value and assert it equals the set string. |
| `change [VARIABLE] by (VALUE)` | data_changevariableby | stack | VALUE:4 VARIABLE:variable | 1 | *slice*; probe: Set variable to a known number, run change-by, read variable.value and assert the new numeric sum. |
| `show variable [VARIABLE v]` | data_showvariable | stack | VARIABLE:variable | 1 | probe: Create a variable, run the block, then read the monitor record for that variable id from runtime monitor state (e.g. runtime._monitorState / getMonitorState) and assert visible === true. |
| `hide variable [VARIABLE v]` | data_hidevariable | stack | VARIABLE:variable | 1 | probe: Create a variable (default monitor visible or show it first), run the block, then read the monitor record for that variable id from runtime monitor state and assert visible === false. |
| `VARIABLE` | data_variable | reporter | — | 1 | probe: Not separately authored; covered implicitly when a variable name is used inside another block's input.; ⚠ implicit reporter, no BlockDef needed |

### Lists (12 — 2 in slice, 10 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `add [ITEM] to [LIST v]` | data_addtolist | stack | ITEM:10 LIST:list | 1 | *slice*; probe: After running, read target.lookupVariableById(listId).value (or target.lookupOrCreateList) and assert the pushed ITEM is the last element and length incremented. |
| `delete (INDEX) of [LIST v]` | data_deleteoflist | stack | INDEX:7 LIST:list | 1 | probe: Seed a known list, run delete (2) of [LIST]; assert list.value has the 2nd element removed and length decremented; delete (all) clears list.value to []. |
| `delete all of [LIST v]` | data_deletealloflist | stack | LIST:list | 1 | probe: Seed a non-empty list, run; assert target list.value.length === 0. |
| `insert [ITEM] at (INDEX) of [LIST v]` | data_insertatlist | stack | ITEM:10 INDEX:7 LIST:list | 1 | probe: Seed list ['a','b'], run insert [x] at (1) of [LIST]; assert list.value === ['x','a','b']. |
| `replace item (INDEX) of [LIST v] with [ITEM]` | data_replaceitemoflist | stack | INDEX:7 ITEM:10 LIST:list | 1 | probe: Seed list ['a','b'], run replace item (2) of [LIST] with [z]; assert list.value === ['a','z']. |
| `item (INDEX) of [LIST v]` | data_itemoflist | reporter | INDEX:7 LIST:list | 1 | *slice*; probe: Seed list ['a','b']; run set [v] to (item (2) of [LIST]); assert variable v === 'b'. |
| `item # of [ITEM] in [LIST v]` | data_itemnumoflist | reporter | ITEM:10 LIST:list | 1 | probe: Seed list ['a','b']; run set [v] to (item # of [b] in [LIST]); assert v === 2; absent item yields 0. |
| `length of [LIST v]` | data_lengthoflist | reporter | LIST:list | 1 | probe: Seed list of 3 items; run set [v] to (length of [LIST]); assert v === 3. |
| `[LIST v] contains [ITEM]?` | data_listcontainsitem | boolean | ITEM:10 LIST:list | 1 | probe: Seed list ['a','b']; run if <[LIST] contains [a]> set [v] to (1); assert branch taken / v set. Or capture the boolean into a variable. |
| `show list [LIST v]` | data_showlist | stack | LIST:list | 1 | conf:medium; probe: Run show list [LIST]; assert runtime.getMonitorState()/_monitorState entry for the list id has visible === true. (Lower-confidence Tier-1: some treat monitor display as renderer-tier; degrades cleanly to Tier-2 load+step if monitor state not asserted.) |
| `hide list [LIST v]` | data_hidelist | stack | LIST:list | 1 | conf:medium; probe: Run hide list [LIST]; assert the monitor state entry for the list id has visible === false. (Same Tier-1/Tier-2 caveat as show list.) |
| `[LIST v]` | data_listcontents | reporter | LIST:list | 1 | probe: Seed list ['a','b']; capture the list pill into a variable; assert joined contents. (Informational only — not added as a BlockDef.); ⚠ implicit reporter, no BlockDef needed (parser resolves a bare list pill via knownLists, same convention as variable reporters) |

### Pen (9 — 1 in slice, 8 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `erase all` | pen_clear | stack | — | 2 | *slice* |
| `stamp` | pen_stamp | stack | — | 2 |  |
| `pen down` | pen_penDown | stack | — | 2 |  |
| `pen up` | pen_penUp | stack | — | 2 |  |
| `set pen color to [COLOR]` | pen_setPenColorToColor | stack | COLOR:9 | 2 | conf:medium; ⚠ COLOR carries a color shadow (ShadowType 9); the contract allows shadowType 9 on a number\|text InputSpec, so this is expressible. Mapped as kind:text+shadowType:9 (a '#rrggbb' color literal). Flagging because color-square input is a distinct UI affordance from a plain text box; VM-gate the kind. |
| `change pen [COLOR_PARAM] by (VALUE)` | pen_changePenColorParamBy | stack | COLOR_PARAM→menu(pen_menu_colorParam) VALUE:4 | 2 | conf:low; ⚠ COLOR_PARAM is an extension menu with acceptReporters:true, so in sb3 it serializes as a shadow menu block (pen_menu_colorParam) referenced by an input — a MENU-INPUT, not a FIELD. Field id inside the shadow is the menu name 'colorParam'; default 'color'. menuOpcode/field naming should be VM-gated. |
| `set pen [COLOR_PARAM] to (VALUE)` | pen_setPenColorParamTo | stack | COLOR_PARAM→menu(pen_menu_colorParam) VALUE:4 | 2 | conf:low; ⚠ Same MENU-INPUT consideration as pen_changePenColorParamBy: COLOR_PARAM is a pen_menu_colorParam shadow menu (acceptReporters:true), not an inline dropdown FIELD. Field 'colorParam', default 'color'. VM-gate menuOpcode/field. |
| `change pen size by (SIZE)` | pen_changePenSizeBy | stack | SIZE:4 | 2 |  |
| `set pen size to (SIZE)` | pen_setPenSizeTo | stack | SIZE:4 | 2 |  |

### Music (7 — 1 in slice, 6 new)

| signature | opcode | shape | enc | T | notes |
|---|---|---|---|---|---|
| `play drum [DRUM v] for (BEATS) beats` | music_playDrumForBeats | stack | DRUM→menu(music_menu_DRUM) BEATS:4 | 2 |  |
| `play note (NOTE) for (BEATS) beats` | music_playNoteForBeats | stack | NOTE:4 BEATS:4 | 2 | conf:low; ⚠ NOTE arg is ArgumentType.NOTE. The real Scratch editor shadow for this input is opcode 'note' with field 'NOTE' (a piano-picker shadow block) — NOT one of the frozen ShadowType compact primitives (4/6/7/8/9/10) and NOT in sb3's primitiveOpcodeInfoMap, so it cannot be expressed faithfully as {kind:'number', shadowType:N}; a faithful entry needs a new 'note' shadow type + packager support to emit a child block of opcode 'note'. Functional workaround used above: emit a math_number (shadowType 4) shadow — the VM only does Cast.toNumber(args.NOTE) so it runs/loads fine, but the shadow opcode/picker differs from the editor's. Flag for VM-gating: decide whether to add a note shadow type or accept the number-shadow approximation. |
| `set instrument to [INSTRUMENT v]` | music_setInstrument | stack | INSTRUMENT→menu(music_menu_INSTRUMENT) | 1 | probe: After stepping, assert target.getCustomState('Scratch.music').currentInstrument === (chosen 1-indexed menu value minus 1, wrap-clamped to 0..INSTRUMENT_INFO.length-1). E.g. menu '1' (Piano) -> currentInstrument === 0. |
| `set tempo to (TEMPO)` | music_setTempo | stack | TEMPO:4 | 1 | probe: After stepping, assert runtime.getTargetForStage().tempo === MathUtil.clamp(TEMPO, 20, 500). E.g. set tempo to 120 -> stage.tempo === 120. |
| `change tempo by (TEMPO)` | music_changeTempo | stack | TEMPO:4 | 1 | probe: From a known starting tempo (default 60), after stepping assert runtime.getTargetForStage().tempo === MathUtil.clamp(60 + TEMPO, 20, 500). E.g. change tempo by 20 -> stage.tempo === 80. |
| `tempo` | music_getTempo | reporter | — | 1 | probe: Wrap in 'set [v] to (tempo)'; after a setTempo to 120 + step, assert the variable's value === 120 (or default 60 with no prior setTempo). |
| `rest for (BEATS) beats` | music_restForBeats | stack | BEATS:4 | 1 | *slice*; probe: Assert the thread yields for ~(60/tempo)*clampedBeats seconds before continuing (a following stack block does not run until the rest elapses). Already covered by the slice's existing handling. |

