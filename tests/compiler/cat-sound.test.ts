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

// ── Tier-1 (runtime-assert) ──────────────────────────────────────────────────

// sound_seteffectto / sound_changeeffectby are Tier-1: _updateEffect writes the value BEFORE its
// audio-engine yield, so the effect persists on target.soundEffects even headless.
test("sound_seteffectto: set [pitch v] effect to (100) sets soundEffects.pitch", async () => {
  const res = await compileProject(await projectDir(script("set [pitch v] effect to (100)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").soundEffects.pitch).toBe(100);
  expect(st.target("Cat").soundEffects.pan).toBe(0);
});
test("sound_changeeffectby: change [pan v] effect by (50) from 0 sets soundEffects.pan", async () => {
  const res = await compileProject(await projectDir(script("change [pan v] effect by (50)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").soundEffects.pan).toBe(50);
});

// sound_cleareffects: Tier-2 — a preceding set-effect halts the headless thread BEFORE clear runs,
// so the cleared value isn't observable. Assert the block emits + the sb3 loads/runs.
test("sound_cleareffects: emits its opcode and loads", async () => {
  const res = await compileProject(await projectDir(script("clear sound effects")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  expect(Object.values(cat.blocks).some((b: any) => b.opcode === "sound_cleareffects")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// sound_changevolumeby: from default 100, change by -30 → 70.
test("sound_changevolumeby: change volume by -30 from 100 → 70", async () => {
  const res = await compileProject(await projectDir(script("change volume by (-30)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").volume).toBe(70);
});

// sound_changevolumeby: clamps at the bounds (0 floor and 100 ceiling).
test("sound_changevolumeby: clamps to 0 floor", async () => {
  const res = await compileProject(await projectDir(script("change volume by (-250)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").volume).toBe(0);
});
test("sound_changevolumeby: clamps to 100 ceiling", async () => {
  const res = await compileProject(await projectDir(script("change volume by (250)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").volume).toBe(100);
});

// sound_setvolumeto: set to 40 → 40; over 100 clamps to 100; negative clamps to 0.
test("sound_setvolumeto: set volume to 40% → 40", async () => {
  const res = await compileProject(await projectDir(script("set volume to (40) %")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").volume).toBe(40);
});
test("sound_setvolumeto: set volume to 150 clamps to 100", async () => {
  const res = await compileProject(await projectDir(script("set volume to (150) %")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").volume).toBe(100);
});
test("sound_setvolumeto: negative clamps to 0", async () => {
  const res = await compileProject(await projectDir(script("set volume to (-20) %")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.target("Cat").volume).toBe(0);
});

// sound_volume: the (volume) reporter reads target.volume. A preceding sound block halts the
// headless thread, so assert the default read (100) here; the set/change-volume Tier-1 tests
// above already prove target.volume itself changes.
test("sound_volume: reporter reads the volume (default 100)", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (volume)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(100);
});

// ── Tier-2 (structural + loads-and-runs) ─────────────────────────────────────

// sound_playuntildone: emits the sound_sounds_menu shadow, value round-trips, loads.
test("sound_playuntildone: emits the menu shadow and loads", async () => {
  const res = await compileProject(await projectDir(script("play sound [pop v] until done")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "sound_playuntildone")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "sound_sounds_menu" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.SOUND_MENU[0]).toBe("pop"); // authored value round-trips
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// sound_play: emits the sound_sounds_menu shadow, value round-trips, loads.
test("sound_play: emits the menu shadow and loads", async () => {
  const res = await compileProject(await projectDir(script("start sound [Meow v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "sound_play")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "sound_sounds_menu" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.SOUND_MENU[0]).toBe("Meow"); // authored value round-trips
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// sound_stopallsounds: plain stack block, no menu/dropdown, loads.
test("sound_stopallsounds: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("stop all sounds")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "sound_stopallsounds")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// ── Floor: every entry compiles + loads + steps in a real VM ─────────────────
test("sound floor: every entry compiles, loads, and steps", async () => {
  const res = await compileProject(await projectDir(script(
    "change [pitch v] effect by (10)",
    "set [pan v] effect to (25)",
    "play sound [pop v] until done",
    "start sound [Meow v]",
    "stop all sounds",
    "clear sound effects",
    "change volume by (-5)",
    "set volume to (80) %",
    "set [v v] to (volume)",
  )));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});
