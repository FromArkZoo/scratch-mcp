// tests/compiler/cat-events.test.ts
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

// Helper: load project.json + the Cat target's blocks array from a compiled sb3.
async function catBlocks(sb3: Buffer): Promise<any[]> {
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  return Object.values(cat.blocks) as any[];
}

// ── Tier-1 (runtime-assert) ──────────────────────────────────────────────────
// event_broadcast / event_whenbroadcastreceived have a directly observable
// runtime effect: a broadcast received by an I-receive hat runs its body. This
// exercises the two broadcast stack blocks + the receive hat + their menu shadow
// all at once through a real VM, with an asserted variable side-effect.
test("event_broadcast: broadcast wakes a when-I-receive hat that sets a var", async () => {
  const src = [
    "when green flag clicked",
    "broadcast [go v]",
    "when I receive [go v]",
    "set [v v] to (1)",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

test("event_broadcastandwait: broadcast-and-wait wakes a receiver before continuing", async () => {
  const src = [
    "when green flag clicked",
    "broadcast [boot v] and wait",
    "set [n v] to (2)",
    "when I receive [boot v]",
    "set [v v] to (1)",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  // receiver ran (v=1) AND the main script continued after the wait (n=2)
  expect(Number(st.variable("v"))).toBe(1);
  expect(Number(st.variable("n"))).toBe(2);
});

// ── Tier-2 (structural shape + loads-and-runs) ───────────────────────────────
test("event_whenkeypressed emits the hat with a KEY_OPTION dropdown field and loads", async () => {
  const res = await compileProject(await projectDir("when [space v] key pressed\nset [v v] to (1)"));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const hat = blocks.find((b) => b.opcode === "event_whenkeypressed");
  expect(hat).toBeTruthy();
  expect(hat.fields.KEY_OPTION).toEqual(["space", null]); // dropdown round-trips
  await runHeadless(res.sb3!); // loads + steps without throwing
});

test("event_whenthisspriteclicked emits the bare hat and loads", async () => {
  const res = await compileProject(await projectDir("when this sprite clicked\nset [v v] to (1)"));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const hat = blocks.find((b) => b.opcode === "event_whenthisspriteclicked");
  expect(hat).toBeTruthy();
  expect(hat.fields).toEqual({}); // no menu/dropdown
  await runHeadless(res.sb3!);
});

test("event_whenstageclicked emits the bare hat and loads", async () => {
  const res = await compileProject(await projectDir("when stage clicked\nset [v v] to (1)"));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const hat = blocks.find((b) => b.opcode === "event_whenstageclicked");
  expect(hat).toBeTruthy();
  expect(hat.fields).toEqual({}); // no menu/dropdown
  await runHeadless(res.sb3!);
});

test("event_whenbackdropswitchesto emits the hat with a BACKDROP dropdown field and loads", async () => {
  const res = await compileProject(await projectDir("when backdrop switches to [backdrop1 v]\nset [v v] to (1)"));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const hat = blocks.find((b) => b.opcode === "event_whenbackdropswitchesto");
  expect(hat).toBeTruthy();
  expect(hat.fields.BACKDROP).toEqual(["backdrop1", null]); // dropdown round-trips
  await runHeadless(res.sb3!);
});

test("event_whengreaterthan emits the hat with a WHENGREATERTHANMENU field + VALUE shadow and loads", async () => {
  const res = await compileProject(await projectDir("when [loudness v] > (10)\nset [v v] to (1)"));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const hat = blocks.find((b) => b.opcode === "event_whengreaterthan");
  expect(hat).toBeTruthy();
  expect(hat.fields.WHENGREATERTHANMENU).toEqual(["loudness", null]); // dropdown round-trips
  // VALUE is an inline math_number shadow (shadowType 4); literal "10" round-trips
  expect(hat.inputs.VALUE).toEqual([1, [4, "10"]]);
  await runHeadless(res.sb3!);
});

// ── Floor (Pattern F) — every entry compiles + loads in a real VM ────────────
test("events floor: every Events block compiles and loads in the VM", async () => {
  const src = [
    // hats (each its own top-level script)
    "when green flag clicked",
    "broadcast [go v]",
    "broadcast [go v] and wait",
    "",
    "when I receive [go v]",
    "set [v v] to (1)",
    "",
    "when [space v] key pressed",
    "set [n v] to (1)",
    "",
    "when this sprite clicked",
    "set [s v] to (1)",
    "",
    "when stage clicked",
    "set [v v] to (2)",
    "",
    "when backdrop switches to [backdrop1 v]",
    "set [n v] to (2)",
    "",
    "when [loudness v] > (10)",
    "set [s v] to (2)",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});