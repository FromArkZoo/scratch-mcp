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

// music_setInstrument: the music extension stores currentInstrument in the
// target's custom state ('Scratch.music'). Instruments are 1-indexed in the
// block, so menu '1' (Piano) → currentInstrument === 0 after _setInstrument
// subtracts 1 and wrapClamps to 0..INSTRUMENT_INFO.length-1.
test("music_setInstrument: set instrument to [1 v] (Piano) → currentInstrument 0", async () => {
  const res = await compileProject(await projectDir(script("set instrument to [1 v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  const music = st.target("Cat").getCustomState("Scratch.music");
  expect(music.currentInstrument).toBe(0);
});

// music_setTempo: writes the clamped tempo onto the Stage target
// (runtime.getTargetForStage().tempo). 120 is within [20, 500] → stays 120.
test("music_setTempo: set tempo to 120 → stage.tempo === 120", async () => {
  const res = await compileProject(await projectDir(script("set tempo to (120)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.runtime().getTargetForStage().tempo).toBe(120);
});

// music_setTempo: clamps above the max of 500.
test("music_setTempo: set tempo to 999 clamps to 500", async () => {
  const res = await compileProject(await projectDir(script("set tempo to (999)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.runtime().getTargetForStage().tempo).toBe(500);
});

// music_changeTempo: default stage tempo is 60; change by 20 → 80 (clamped to [20,500]).
test("music_changeTempo: change tempo by 20 from default 60 → 80", async () => {
  const res = await compileProject(await projectDir(script("change tempo by (20)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.runtime().getTargetForStage().tempo).toBe(80);
});

// music_changeTempo: clamps below the min of 20 (60 + (-100) = -40 → 20).
test("music_changeTempo: change tempo by -100 clamps to 20 floor", async () => {
  const res = await compileProject(await projectDir(script("change tempo by (-100)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.runtime().getTargetForStage().tempo).toBe(20);
});

// music_getTempo: after set tempo to 120, the (tempo) reporter reads 120.
test("music_getTempo: reporter reads the current tempo after setTempo", async () => {
  const res = await compileProject(await projectDir(script(
    "set tempo to (120)",
    "set [v v] to (tempo)",
  )));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(120);
  expect(st.runtime().getTargetForStage().tempo).toBe(120);
});

// music_getTempo: with no prior setTempo, the reporter reads the default 60.
test("music_getTempo: reporter reads the default tempo of 60", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (tempo)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(60);
});

// ── Tier-2 (structural + loads-and-runs) ─────────────────────────────────────

// music_playDrumForBeats: emits the music_menu_DRUM shadow, DRUM value
// round-trips into the shadow's field, and the project loads + steps.
test("music_playDrumForBeats: emits the DRUM menu shadow and loads", async () => {
  const res = await compileProject(await projectDir(script("play drum [1 v] for (0.25) beats")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "music_playDrumForBeats")).toBe(true);
  const shadow = blocks.find((b) => b.opcode === "music_menu_DRUM" && b.shadow === true);
  expect(shadow).toBeDefined();
  expect(shadow.fields.DRUM[0]).toBe("1"); // authored value round-trips
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// music_playNoteForBeats: no menu/dropdown — both inputs are plain numbers.
// [conf:low] structural shape + loads-and-runs only.
test("music_playNoteForBeats: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("play note (60) for (0.5) beats")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "music_playNoteForBeats")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// music_restForBeats: plain stack block with a single number input, loads.
test("music_restForBeats: emits the block and loads", async () => {
  const res = await compileProject(await projectDir(script("rest for (0.25) beats")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  expect(blocks.some((b) => b.opcode === "music_restForBeats")).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// ── Floor: every entry compiles + loads + steps in a real VM ─────────────────
test("music floor: every entry compiles, loads, and steps", async () => {
  const res = await compileProject(await projectDir(script(
    "rest for (0.25) beats",
    "play drum [1 v] for (0.25) beats",
    "play note (60) for (0.5) beats",
    "set instrument to [1 v]",
    "set tempo to (120)",
    "change tempo by (20)",
    "set [v v] to (tempo)",
  )));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});
