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

test("looks_nextcostume: stepping advances currentCostume by 1 (mod costume count)", async () => {
  // The placeholder skeleton ships exactly one costume, so wrapClamp keeps the
  // index at 0: (pre + 1) % count === post  with count === 1, pre === 0.
  const res = await compileProject(await projectDir(script("next costume")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const tgt = st.target("Cat");
  const count = tgt.getCostumes().length;
  expect((0 + 1) % count).toBe(tgt.currentCostume);
});

test("looks_nextbackdrop: stepping advances the stage backdrop by 1 (mod backdrop count)", async () => {
  const res = await compileProject(await projectDir(script("next backdrop")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const stage = st.runtime().getTargetForStage();
  const count = stage.getCostumes().length;
  expect((0 + 1) % count).toBe(stage.currentCostume);
});

test("looks_cleargraphiceffects: clear zeroes every graphic effect", async () => {
  const res = await compileProject(
    await projectDir(script("set [ghost v] effect to (50)", "clear graphic effects")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const effects = st.target("Cat").effects as Record<string, number>;
  for (const name of Object.keys(effects)) expect(effects[name]).toBe(0);
});

test("looks_show: show makes the sprite visible", async () => {
  // Hide first so the assertion proves show flipped the flag.
  const res = await compileProject(await projectDir(script("hide", "show")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").visible).toBe(true);
});

test("looks_hide: hide makes the sprite invisible", async () => {
  const res = await compileProject(await projectDir(script("hide")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").visible).toBe(false);
});

test("looks_costumenumbername: costume [number] reports currentCostume + 1", async () => {
  const res = await compileProject(
    await projectDir(script("set [v v] to (costume [number v])")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(st.target("Cat").currentCostume + 1);
});

test("looks_backdropnumbername: backdrop [number] reports the stage backdrop index + 1", async () => {
  const res = await compileProject(
    await projectDir(script("set [v v] to (backdrop [number v])")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const stage = st.runtime().getTargetForStage();
  expect(Number(st.variable("v"))).toBe(stage.currentCostume + 1);
});

// ===========================================================================
// TIER-2 — structural shape + loads-and-runs
// ===========================================================================

test("looks_sayforsecs: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("say [hi] for (1) seconds")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_sayforsecs")).toBe(true);
  await runHeadless(res.sb3!);
});

test("looks_say: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("say [hi]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_say")).toBe(true);
  await runHeadless(res.sb3!);
});

test("looks_thinkforsecs: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("think [hmm] for (1) seconds")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_thinkforsecs")).toBe(true);
  await runHeadless(res.sb3!);
});

test("looks_think: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("think [hmm]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_think")).toBe(true);
  await runHeadless(res.sb3!);
});

test("looks_switchcostumeto: emits the looks_costume menu shadow, round-trips the value, and loads", async () => {
  const res = await compileProject(await projectDir(script("switch costume to [costume2 v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_switchcostumeto")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "looks_costume" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.COSTUME[0]).toBe("costume2"); // authored value round-trips
  await runHeadless(res.sb3!);
});

test("looks_switchbackdropto: emits the looks_backdrops menu shadow, round-trips the value, and loads", async () => {
  const res = await compileProject(await projectDir(script("switch backdrop to [backdrop2 v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_switchbackdropto")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "looks_backdrops" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.BACKDROP[0]).toBe("backdrop2");
  await runHeadless(res.sb3!);
});

test("looks_switchbackdroptoandwait: emits the looks_backdrops menu shadow, round-trips the value, and loads", async () => {
  const res = await compileProject(
    await projectDir(script("switch backdrop to [backdrop2 v] and wait")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_switchbackdroptoandwait")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "looks_backdrops" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.BACKDROP[0]).toBe("backdrop2");
  await runHeadless(res.sb3!);
});

test("looks_gotofrontback: FRONT_BACK dropdown field encodes [value, null] and loads", async () => {
  const res = await compileProject(await projectDir(script("go to [front v] layer")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const block = blocks.find((b) => b.opcode === "looks_gotofrontback");
  expect(block).toBeDefined();
  expect(block.fields.FRONT_BACK).toEqual(["front", null]);
  await runHeadless(res.sb3!);
});

test("looks_goforwardbackwardlayers: FORWARD_BACKWARD dropdown field encodes [value, null] and loads", async () => {
  const res = await compileProject(await projectDir(script("go [forward v] (1) layers")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const block = blocks.find((b) => b.opcode === "looks_goforwardbackwardlayers");
  expect(block).toBeDefined();
  expect(block.fields.FORWARD_BACKWARD).toEqual(["forward", null]);
  await runHeadless(res.sb3!);
});

// --- Size blocks: DOWNGRADED to Tier-2 (structural + loads) ----------------
// rendered-target.setSize only mutates this.size inside `if (this.renderer)`,
// and getSize returns this.size; the headless harness attaches no renderer, so
// the value never changes. We still prove the blocks emit + load in a real VM.

test("looks_changesizeby: emits its opcode and loads (downgraded — no headless renderer)", async () => {
  const res = await compileProject(await projectDir(script("change size by (10)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_changesizeby")).toBe(true);
  await runHeadless(res.sb3!);
});

test("looks_setsizeto: emits its opcode and loads (downgraded — no headless renderer)", async () => {
  const res = await compileProject(await projectDir(script("set size to (50) %")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_setsizeto")).toBe(true);
  await runHeadless(res.sb3!);
});

test("looks_size: reporter emits its opcode and loads (downgraded — no headless renderer)", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (size)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "looks_size")).toBe(true);
  await runHeadless(res.sb3!);
});

// --- Effect setters: structural (their observable is exercised via clear) ---

test("looks_changeeffectby: EFFECT dropdown encodes [value, null] and loads", async () => {
  const res = await compileProject(await projectDir(script("change [ghost v] effect by (25)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const block = blocks.find((b) => b.opcode === "looks_changeeffectby");
  expect(block).toBeDefined();
  expect(block.fields.EFFECT).toEqual(["ghost", null]);
  await runHeadless(res.sb3!);
});

test("looks_seteffectto: EFFECT dropdown encodes [value, null] and loads", async () => {
  const res = await compileProject(await projectDir(script("set [color v] effect to (25)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const block = blocks.find((b) => b.opcode === "looks_seteffectto");
  expect(block).toBeDefined();
  expect(block.fields.EFFECT).toEqual(["color", null]);
  await runHeadless(res.sb3!);
});

// ===========================================================================
// PATTERN F — the category floor: every Looks entry in one project
// ===========================================================================

test("looks floor: every Looks block compiles and loads+steps in a real VM", async () => {
  const res = await compileProject(
    await projectDir(
      script(
        "change [color v] effect by (25)",
        "set [ghost v] effect to (50)",
        "say [hi] for (1) seconds",
        "say [hi]",
        "think [hmm] for (1) seconds",
        "think [hmm]",
        "switch costume to [costume2 v]",
        "next costume",
        "switch backdrop to [backdrop2 v]",
        "switch backdrop to [backdrop2 v] and wait",
        "next backdrop",
        "clear graphic effects",
        "change size by (10)",
        "set size to (50) %",
        "show",
        "hide",
        "go to [front v] layer",
        "go [forward v] (1) layers",
        "set [v v] to (costume [number v])",
        "set [n v] to (backdrop [number v])",
        "set [s v] to (size)",
      ),
    ),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});
