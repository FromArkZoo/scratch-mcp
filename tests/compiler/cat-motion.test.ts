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

// Helpers to pull blocks out of the compiled project.json for structural assertions.
async function catBlocks(sb3: Buffer): Promise<any[]> {
  const pj = JSON.parse(await (await JSZip.loadAsync(sb3)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  return Object.values(cat.blocks) as any[];
}

// ===========================================================================
// TIER-1 — runtime-asserted observable behaviour
// ===========================================================================

test("motion_turnleft: turn left 90 from default direction 90 leaves direction 0", async () => {
  // VM default direction is 90; turnLeft sets direction - degrees, then
  // setDirection wrapClamps to [-179, 180]. 90 - 90 = 0 -> 0.
  const res = await compileProject(await projectDir(script("turn left (90) degrees")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").direction).toBe(0);
});

test("motion_pointindirection: point in direction 90 sets direction to 90", async () => {
  // Point somewhere else first so the assertion proves the block set it.
  const res = await compileProject(
    await projectDir(script("point in direction (45)", "point in direction (90)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").direction).toBe(90);
});

test("motion_gotoxy: go to x:10 y:20 moves the sprite to (10, 20)", async () => {
  const res = await compileProject(await projectDir(script("go to x: (10) y: (20)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const tgt = st.target("Cat");
  expect(tgt.x).toBe(10);
  expect(tgt.y).toBe(20);
});

test("motion_glidesecstoxy: glide 0 secs to x:5 y:5 snaps to (5, 5)", async () => {
  // glide() short-circuits when duration <= 0, calling setXY(endX, endY)
  // immediately — no timers needed, fully deterministic headless.
  const res = await compileProject(await projectDir(script("glide (0) secs to x: (5) y: (5)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const tgt = st.target("Cat");
  expect(tgt.x).toBe(5);
  expect(tgt.y).toBe(5);
});

test("motion_changexby: from x=0, change x by 10 leaves x=10 (y unchanged)", async () => {
  const res = await compileProject(
    await projectDir(script("go to x: (0) y: (0)", "change x by (10)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const tgt = st.target("Cat");
  expect(tgt.x).toBe(10);
  expect(tgt.y).toBe(0);
});

test("motion_setx: set x to 42 moves the sprite", async () => {
  const res = await compileProject(await projectDir(script("set x to (42)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").x).toBe(42);
});

test("motion_changeyby: from y=0, change y by 10 leaves y=10 (x unchanged)", async () => {
  const res = await compileProject(
    await projectDir(script("go to x: (0) y: (0)", "change y by (10)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const tgt = st.target("Cat");
  expect(tgt.y).toBe(10);
  expect(tgt.x).toBe(0);
});

test("motion_sety: set y to 42 moves the sprite", async () => {
  const res = await compileProject(await projectDir(script("set y to (42)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").y).toBe(42);
});

test("motion_setrotationstyle: set rotation style [left-right] sets rotationStyle", async () => {
  const res = await compileProject(await projectDir(script("set rotation style [left-right v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").rotationStyle).toBe("left-right");
});

test("motion_xposition: reads the sprite x", async () => {
  const res = await compileProject(
    await projectDir(script("set x to (7)", "set [v v] to (x position)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(7);
});

test("motion_yposition: reads the sprite y", async () => {
  const res = await compileProject(
    await projectDir(script("set y to (7)", "set [v v] to (y position)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(7);
});

// ===========================================================================
// TIER-2 — structural shape + loads-and-runs
// ===========================================================================

test("motion_pointtowards: emits the motion_pointtowards_menu shadow, round-trips the value, and loads", async () => {
  const res = await compileProject(await projectDir(script("point towards [_mouse_ v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_pointtowards")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "motion_pointtowards_menu" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.TOWARDS[0]).toBe("_mouse_"); // authored value round-trips
  await runHeadless(res.sb3!);
});

test("motion_glideto: emits the motion_glideto_menu shadow, round-trips the value, and loads", async () => {
  const res = await compileProject(await projectDir(script("glide (1) secs to [_random_ v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_glideto")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "motion_glideto_menu" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.TO[0]).toBe("_random_"); // authored value round-trips
  await runHeadless(res.sb3!);
});

test("motion_ifonedgebounce: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("if on edge, bounce")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_ifonedgebounce")).toBe(true);
  await runHeadless(res.sb3!);
});

// --- Remaining entries: structural (covered observably or via the floor) ---

test("motion_movesteps: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("move (10) steps")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_movesteps")).toBe(true);
  await runHeadless(res.sb3!);
});

test("motion_turnright: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("turn right (15) degrees")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_turnright")).toBe(true);
  await runHeadless(res.sb3!);
});

test("motion_goto: emits the motion_goto_menu shadow, round-trips the value, and loads", async () => {
  const res = await compileProject(await projectDir(script("go to [_random_ v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_goto")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "motion_goto_menu" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.TO[0]).toBe("_random_"); // authored value round-trips
  await runHeadless(res.sb3!);
});

test("motion_direction: reporter emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (direction)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "motion_direction")).toBe(true);
  await runHeadless(res.sb3!);
});

// ===========================================================================
// PATTERN F — the category floor: every Motion entry in one project
// ===========================================================================

test("motion floor: every Motion block compiles and loads+steps in a real VM", async () => {
  const res = await compileProject(
    await projectDir(
      script(
        "move (10) steps",
        "turn right (15) degrees",
        "turn left (15) degrees",
        "point in direction (90)",
        "point towards [_mouse_ v]",
        "go to [_random_ v]",
        "go to x: (10) y: (20)",
        "glide (0) secs to x: (5) y: (5)",
        "glide (0) secs to [_random_ v]",
        "change x by (10)",
        "set x to (42)",
        "change y by (10)",
        "set y to (42)",
        "if on edge, bounce",
        "set rotation style [left-right v]",
        "set [v v] to (direction)",
        "set [n v] to (x position)",
        "set [s v] to (y position)",
      ),
    ),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});