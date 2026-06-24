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

// Helper to pull blocks out of the compiled project.json for structural assertions.
async function catBlocks(sb3: Buffer): Promise<any[]> {
  const pj = JSON.parse(await (await JSZip.loadAsync(sb3)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  return Object.values(cat.blocks) as any[];
}

// ===========================================================================
// TIER-1 — runtime-asserted observable behaviour
// ===========================================================================
// set/change write a real variable value, which the headless harness exposes
// via state.variable(). These are the firmest runtime probes the category has.

test("data_setvariableto: set [v] to (42) writes the variable in the VM", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (42)")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(42);
});

test("data_changevariableby: change [v] by (5) adds to the variable in the VM", async () => {
  // set to a known base first so the assertion proves change applied the delta.
  const res = await compileProject(
    await projectDir(script("set [v v] to (10)", "change [v v] by (5)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(15);
});

// ===========================================================================
// TIER-2 — structural shape + loads-and-runs
// ===========================================================================
// show variable / hide variable are DOWNGRADED from Tier-1 (see notes): the
// packager emits `monitors: []`, so no monitor block is deserialized into
// runtime.monitorBlocks. data_show/hidevariable's changeMonitorVisibility does
// `block = this._blocks[args.id]` -> undefined -> early return, leaving
// runtime.getMonitorState() empty. The monitor `visible` flag therefore never
// flips headlessly. We still prove these emit their opcode, that the VARIABLE
// field round-trips as [name, id] (so a mis-resolved variable id is caught),
// and that they load + step in a real VM.

test("data_showvariable: emits its opcode, the VARIABLE field round-trips [name, id], and loads", async () => {
  const res = await compileProject(await projectDir(script("show variable [v v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const block = blocks.find((b) => b.opcode === "data_showvariable");
  expect(block).toBeDefined();
  expect(block.fields.VARIABLE[0]).toBe("v"); // authored variable name round-trips
  expect(typeof block.fields.VARIABLE[1]).toBe("string"); // resolved to a real id
  expect(block.fields.VARIABLE[1].length).toBeGreaterThan(0);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

test("data_hidevariable: emits its opcode, the VARIABLE field round-trips [name, id], and loads", async () => {
  const res = await compileProject(await projectDir(script("hide variable [v v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const blocks = await catBlocks(res.sb3!);
  const block = blocks.find((b) => b.opcode === "data_hidevariable");
  expect(block).toBeDefined();
  expect(block.fields.VARIABLE[0]).toBe("v"); // authored variable name round-trips
  expect(typeof block.fields.VARIABLE[1]).toBe("string"); // resolved to a real id
  expect(block.fields.VARIABLE[1].length).toBeGreaterThan(0);
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// ===========================================================================
// PATTERN F — the category floor: every Variables entry in one project
// ===========================================================================

test("variables floor: every Variables block compiles and loads+steps in a real VM", async () => {
  const res = await compileProject(
    await projectDir(
      script(
        "set [v v] to (42)",
        "change [v v] by (5)",
        "show variable [v v]",
        "hide variable [v v]",
      ),
    ),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});