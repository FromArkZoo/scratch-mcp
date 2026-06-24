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

// Every Lists test needs a global list. The harness reads list contents the same
// way it reads variables: lists are Variable objects (LIST_TYPE) in target.variables,
// so state.variable("inventory") returns the list's .value array directly.
const LISTS_YAML = "lists:\n  global: { inventory: [] }";

// ---------------------------------------------------------------------------
// Tier-1 — data_addtolist
// Observable: the list array grows with the appended item (read via state.variable).
// ---------------------------------------------------------------------------
test("data_addtolist: add [a]/[b] appends in order -> inventory === ['a','b']", async () => {
  const res = await compileProject(await projectDir(
    script("add [a] to [inventory v]", "add [b] to [inventory v]"),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.variable("inventory")).toEqual(["a", "b"]);
});

// ---------------------------------------------------------------------------
// Tier-1 — data_itemoflist
// Observable: item (2) of the list reports 'b' (capture the reporter into a var).
// ---------------------------------------------------------------------------
test("data_itemoflist: item (2) of inventory reports 'b'", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "set [v v] to (item (2) of [inventory v])",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(String(st.variable("v"))).toBe("b");
});

// ---------------------------------------------------------------------------
// Tier-1 — data_deleteoflist
// Observable: delete (2) removes the 2nd element and decrements length;
// delete (all) clears the list to [].
// ---------------------------------------------------------------------------
test("data_deleteoflist: delete (2) removes the 2nd item; delete (all) clears the list", async () => {
  const resOne = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "add [c] to [inventory v]",
      "delete (2) of [inventory v]",
    ),
    LISTS_YAML,
  ));
  expect(resOne.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pjOne = JSON.parse(await (await JSZip.loadAsync(resOne.sb3!)).file("project.json")!.async("string"));
  const opsOne = Object.values(pjOne.targets.find((t: any) => t.name === "Cat").blocks).map((b: any) => b.opcode);
  expect(opsOne).toContain("data_deleteoflist"); // the round-hole index path
  const stOne = await runHeadless(resOne.sb3!);
  expect(stOne.variable("inventory")).toEqual(["a", "c"]); // 2nd element removed, length 3 -> 2

  const resAll = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "delete (all) of [inventory v]",
    ),
    LISTS_YAML,
  ));
  expect(resAll.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const stAll = await runHeadless(resAll.sb3!);
  expect(stAll.variable("inventory")).toEqual([]); // "all" clears the list
});

// ---------------------------------------------------------------------------
// Tier-1 — data_deletealloflist
// Observable: a non-empty list is cleared to length 0.
// ---------------------------------------------------------------------------
test("data_deletealloflist: clears a non-empty list -> length 0", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "delete all of [inventory v]",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  // Lock the OPCODE: "delete all of" must emit data_deletealloflist, not be shadowed by the
  // round-hole "delete (N) of" (data_deleteoflist). Without this the test is tautological,
  // because the VM clears the list for INDEX="all" under data_deleteoflist too.
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const ops = Object.values(cat.blocks).map((b: any) => b.opcode);
  expect(ops).toContain("data_deletealloflist");
  expect(ops).not.toContain("data_deleteoflist");
  const st = await runHeadless(res.sb3!);
  expect((st.variable("inventory") as unknown[]).length).toBe(0);
});

// ---------------------------------------------------------------------------
// Tier-1 — data_insertatlist
// Observable: insert [x] at (1) of ['a','b'] -> ['x','a','b'].
// ---------------------------------------------------------------------------
test("data_insertatlist: insert [x] at (1) -> ['x','a','b']", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "insert [x] at (1) of [inventory v]",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.variable("inventory")).toEqual(["x", "a", "b"]);
});

// ---------------------------------------------------------------------------
// Tier-1 — data_replaceitemoflist
// Observable: replace item (2) of ['a','b'] with [z] -> ['a','z'].
// ---------------------------------------------------------------------------
test("data_replaceitemoflist: replace item (2) with [z] -> ['a','z']", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "replace item (2) of [inventory v] with [z]",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.variable("inventory")).toEqual(["a", "z"]);
});

// ---------------------------------------------------------------------------
// Tier-1 — data_itemnumoflist
// Observable: item # of [b] in ['a','b'] -> 2; an absent item yields 0.
// ---------------------------------------------------------------------------
test("data_itemnumoflist: item # of [b] is 2; an absent item is 0", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "set [v v] to (item # of [b] in [inventory v])",
      "set [n v] to (item # of [zzz] in [inventory v])",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(2); // 'b' is the 2nd item
  expect(Number(st.variable("n"))).toBe(0); // absent -> 0
});

// ---------------------------------------------------------------------------
// Tier-1 — data_lengthoflist
// Observable: length of a 3-item list -> 3.
// ---------------------------------------------------------------------------
test("data_lengthoflist: length of a 3-item list is 3", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "add [c] to [inventory v]",
      "set [v v] to (length of [inventory v])",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(3);
});

// ---------------------------------------------------------------------------
// Tier-1 — data_listcontainsitem (boolean)
// Observable: capture the boolean into a var via an if. Present -> branch taken
// (v==1); absent -> branch skipped (n stays 0).
// ---------------------------------------------------------------------------
test("data_listcontainsitem: contains [a] takes the branch (v==1); contains [zzz] does not (n==0)", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",
      "add [b] to [inventory v]",
      "if <[inventory v] contains [a]?> then",
      "  set [v v] to (1)",
      "end",
      "if <[inventory v] contains [zzz]?> then",
      "  set [n v] to (1)",
      "end",
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1); // 'a' present -> branch taken
  expect(Number(st.variable("n"))).toBe(0); // 'zzz' absent -> branch skipped
});

// ---------------------------------------------------------------------------
// Tier-2 — data_showlist (DOWNGRADED from Tier-1; see notes)
// The compiler emits monitors: [] (packager.ts), so there is no monitor block
// for the list; data's changeMonitorVisibility -> monitorBlocks.changeBlock has
// no monitor to flip, leaving runtime.getMonitorState() empty. The renderer-tier
// visibility flag is therefore not observable headless, so this degrades to the
// documented Tier-2 fallback: assert the opcode + LIST field, then load+step.
// ---------------------------------------------------------------------------
test("data_showlist: emits the opcode with the LIST field and loads+steps", async () => {
  const res = await compileProject(await projectDir(
    script("show list [inventory v]"),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  const show = blocks.find((b) => b.opcode === "data_showlist");
  expect(show).toBeDefined();
  expect(show.fields.LIST[0]).toBe("inventory"); // LIST field round-trips [name, id]
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// ---------------------------------------------------------------------------
// Tier-2 — data_hidelist (DOWNGRADED from Tier-1; same monitor-tier caveat)
// ---------------------------------------------------------------------------
test("data_hidelist: emits the opcode with the LIST field and loads+steps", async () => {
  const res = await compileProject(await projectDir(
    script("hide list [inventory v]"),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  const hide = blocks.find((b) => b.opcode === "data_hidelist");
  expect(hide).toBeDefined();
  expect(hide.fields.LIST[0]).toBe("inventory"); // LIST field round-trips [name, id]
  await runHeadless(res.sb3!); // loads + steps without throwing
});

// ---------------------------------------------------------------------------
// Pattern F — category floor: EVERY Lists entry in one script, compiles + runs.
// This is the hard floor: every entry proves it loads and steps in a real VM.
// ---------------------------------------------------------------------------
test("lists floor: every Lists block compiles and runs in the VM", async () => {
  const res = await compileProject(await projectDir(
    script(
      "add [a] to [inventory v]",                            // data_addtolist
      "add [b] to [inventory v]",
      "insert [x] at (1) of [inventory v]",                 // data_insertatlist
      "replace item (1) of [inventory v] with [y]",         // data_replaceitemoflist
      "set [v v] to (item (1) of [inventory v])",           // data_itemoflist
      "set [n v] to (item # of [b] in [inventory v])",      // data_itemnumoflist
      "set [s v] to (length of [inventory v])",             // data_lengthoflist
      "if <[inventory v] contains [b]?> then",              // data_listcontainsitem
      "  show list [inventory v]",                          // data_showlist
      "  hide list [inventory v]",                          // data_hidelist
      "end",
      "delete (1) of [inventory v]",                        // data_deleteoflist
      "delete all of [inventory v]",                        // data_deletealloflist
    ),
    LISTS_YAML,
  ));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});
