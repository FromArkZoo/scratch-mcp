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
    "variables:", "  global: { v: 0, n: 0, s: 0 }",
    ...(yamlExtra ? [yamlExtra] : []),
  ].join("\n");
  await writeFile(join(dir, "project.yaml"), yaml);
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const script = (...lines: string[]) => ["when green flag clicked", ...lines].join("\n");

// Helpers ---------------------------------------------------------------------
const noErrors = (res: { diagnostics: { severity: string }[] }) =>
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

async function catBlocks(sb3: Buffer): Promise<any[]> {
  const pj = JSON.parse(await (await JSZip.loadAsync(sb3)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  return Object.values(cat.blocks) as any[];
}

// =============================================================================
// TIER 1 — runtime-asserted blocks
// =============================================================================

// sensing_setdragmode — draggable=true after 'set drag mode [draggable v]'
test("sensing_setdragmode: 'set drag mode [draggable v]' makes the target draggable", async () => {
  const res = await compileProject(await projectDir(script("set drag mode [draggable v]")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").draggable).toBe(true);
});

// sensing_setdragmode — draggable=false after 'set drag mode [not draggable v]'
test("sensing_setdragmode: 'set drag mode [not draggable v]' makes the target not draggable", async () => {
  const res = await compileProject(await projectDir(script("set drag mode [not draggable v]")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").draggable).toBe(false);
});

// sensing_timer — read into a var: a number >= 0
test("sensing_timer: reads a non-negative number", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (timer)")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  const t = Number(st.variable("v"));
  expect(Number.isNaN(t)).toBe(false);
  expect(t).toBeGreaterThanOrEqual(0);
});

// sensing_resettimer — after reset, an immediate timer read is ~0
test("sensing_resettimer: timer reads ~0 immediately after 'reset timer'", async () => {
  const res = await compileProject(await projectDir(script("reset timer", "set [v v] to (timer)")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  const t = Number(st.variable("v"));
  expect(Number.isNaN(t)).toBe(false);
  expect(t).toBeLessThan(0.5); // reset and read happen the same frame, microseconds apart
});

// sensing_of — '[x position v] of [Cat v]' equals the Cat's known x
test("sensing_of: '[x position v] of [Cat v]' reports the sprite's x position", async () => {
  const res = await compileProject(
    await projectDir(script("set x to (123)", "set [v v] to ([x position v] of [Cat v])")),
  );
  noErrors(res);
  // structural: PROPERTY is a fixed dropdown field; OBJECT is a menu-input shadow
  const blocks = await catBlocks(res.sb3!);
  const ofBlock = blocks.find((b) => b.opcode === "sensing_of");
  expect(ofBlock.fields.PROPERTY[0]).toBe("x position");
  const objShadow = blocks.find((b) => b.opcode === "sensing_of_object_menu" && b.shadow === true);
  expect(objShadow.fields.OBJECT[0]).toBe("Cat"); // menu value round-trips
  // runtime: the reporter resolves to the live x
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(123);
});

// =============================================================================
// TIER 2 — structural shape + loads-and-runs
// =============================================================================

// sensing_touchingobject — TOUCHINGOBJECTMENU menu input (round-trips into shadow field)
test("sensing_touchingobject: emits the touchingobject menu shadow and loads", async () => {
  const res = await compileProject(
    await projectDir(script("if <touching [_mouse_ v]?> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_touchingobject")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "sensing_touchingobjectmenu" && b.shadow === true);
  expect(shadow).toBeTruthy();
  expect(shadow.fields.TOUCHINGOBJECTMENU[0]).toBe("_mouse_"); // value round-trips
  await runHeadless(res.sb3!);
});

// sensing_touchingcolor — COLOR text/colour input, no menu/dropdown
test("sensing_touchingcolor: emits the block and a colour shadow, and loads", async () => {
  const res = await compileProject(
    await projectDir(script("if <touching color [#ff0000]?> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_touchingcolor")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_coloristouchingcolor — two colour inputs, no menu/dropdown
test("sensing_coloristouchingcolor: emits the block and loads", async () => {
  const res = await compileProject(
    await projectDir(
      script("if <color [#ff0000] is touching [#00ff00]?> then", "  set [v v] to (1)", "end"),
    ),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_coloristouchingcolor")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_distanceto — DISTANCETOMENU menu input (round-trips into shadow field)
test("sensing_distanceto: emits the distanceto menu shadow and loads", async () => {
  const res = await compileProject(
    await projectDir(script("set [v v] to (distance to [_mouse_ v])")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_distanceto")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "sensing_distancetomenu" && b.shadow === true);
  expect(shadow).toBeTruthy();
  expect(shadow.fields.DISTANCETOMENU[0]).toBe("_mouse_"); // value round-trips
  await runHeadless(res.sb3!);
});

// sensing_askandwait — QUESTION text input, no menu/dropdown
test("sensing_askandwait: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("ask [What's your name?] and wait")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_askandwait")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_answer — reporter, no menu/dropdown
test("sensing_answer: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (answer)")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_answer")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_keypressed — KEY_OPTION menu input (round-trips into shadow field)
test("sensing_keypressed: emits the keyoptions menu shadow and loads", async () => {
  const res = await compileProject(
    await projectDir(script("if <key [space v] pressed?> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_keypressed")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "sensing_keyoptions" && b.shadow === true);
  expect(shadow).toBeTruthy();
  expect(shadow.fields.KEY_OPTION[0]).toBe("space"); // value round-trips
  await runHeadless(res.sb3!);
});

// sensing_mousedown — boolean reporter, no menu/dropdown
test("sensing_mousedown: emits the block and loads", async () => {
  const res = await compileProject(
    await projectDir(script("if <mouse down?> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_mousedown")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_mousex — reporter, no menu/dropdown
test("sensing_mousex: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (mouse x)")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_mousex")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_mousey — reporter, no menu/dropdown
test("sensing_mousey: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (mouse y)")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_mousey")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_loudness — reporter, no menu/dropdown
test("sensing_loudness: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (loudness)")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_loudness")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_current — CURRENTMENU dropdown field (no shadow)
test("sensing_current: emits the block with its CURRENTMENU dropdown field and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (current [year v])")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  const cur = blocks.find((b) => b.opcode === "sensing_current");
  expect(cur).toBeTruthy();
  expect(cur.fields.CURRENTMENU).toEqual(["year", null]); // dropdown value round-trips
  await runHeadless(res.sb3!);
});

// sensing_dayssince2000 — reporter, no menu/dropdown
test("sensing_dayssince2000: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (days since 2000)")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_dayssince2000")).toBe(true);
  await runHeadless(res.sb3!);
});

// sensing_username — reporter, no menu/dropdown
test("sensing_username: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (username)")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "sensing_username")).toBe(true);
  await runHeadless(res.sb3!);
});

// =============================================================================
// FLOOR — exactly one test exercising EVERY sensing entry
// =============================================================================
test("sensing floor: every sensing block compiles and loads in a real VM", async () => {
  const res = await compileProject(
    await projectDir(
      script(
        // stack blocks
        "ask [hi?] and wait",
        "set drag mode [draggable v]",
        "reset timer",
        // boolean reporters captured in ifs
        "if <touching [_mouse_ v]?> then",
        "  set [v v] to (1)",
        "end",
        "if <touching color [#ff0000]?> then",
        "  set [v v] to (1)",
        "end",
        "if <color [#ff0000] is touching [#00ff00]?> then",
        "  set [v v] to (1)",
        "end",
        "if <key [space v] pressed?> then",
        "  set [v v] to (1)",
        "end",
        "if <mouse down?> then",
        "  set [v v] to (1)",
        "end",
        // value reporters captured in set
        "set [v v] to (distance to [_mouse_ v])",
        "set [v v] to (answer)",
        "set [v v] to (mouse x)",
        "set [v v] to (mouse y)",
        "set [v v] to (loudness)",
        "set [v v] to (timer)",
        "set [v v] to ([x position v] of [Cat v])",
        "set [v v] to (current [year v])",
        "set [v v] to (days since 2000)",
        "set [v v] to (username)",
      ),
    ),
  );
  noErrors(res);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps 120 frames without throwing
});
