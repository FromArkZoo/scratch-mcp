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

// ---------------------------------------------------------------------------
// Tier-1 (runtime-assert) — control_wait
// The VM stack timer is backed by wall-clock Date.now(), so 120 synchronous
// _step() calls elapse in a few milliseconds of real time. Therefore:
//   - wait (0) seconds  yields once then resumes  -> the next block runs (v==1)
//   - wait (5) seconds  cannot finish in the wall-clock budget of 120 sync
//     steps -> the block after it never runs (n stays 0). This proves the
//     wait actually delays, deterministically and machine-speed-independently.
// ---------------------------------------------------------------------------
test("control_wait: a zero wait resumes (v==1) but a long wait blocks the next block (n==0)", async () => {
  const src = [
    script("wait (0) seconds", "set [v v] to (1)"),
    "when green flag clicked",
    "wait (5) seconds",
    "set [n v] to (1)",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1); // resumed after the wait yielded
  expect(Number(st.variable("n"))).toBe(0); // 5s wait never finished -> next block skipped
});

// ---------------------------------------------------------------------------
// Tier-1 — control_wait_until
// Deterministic without mid-run mutation:
//   - wait until <(n) = (0)>  is true on entry (n starts 0) -> resumes -> v==1
//   - wait until <(n) = (1)>  is never true (n stays 0)     -> next block skipped -> s==0
// ---------------------------------------------------------------------------
test("control_wait_until: a true condition resumes (v==1), a never-true condition blocks (s==0)", async () => {
  const src = [
    script("wait until <(n) = (0)>", "set [v v] to (1)"),
    "when green flag clicked",
    "wait until <(n) = (1)>",
    "set [s v] to (1)",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1); // condition true on entry -> resumed
  expect(Number(st.variable("s"))).toBe(0); // condition never true -> blocked forever, next block skipped
});

// ---------------------------------------------------------------------------
// Tier-1 — control_stop
// "this script" is the deterministic, machine-independent probe: the block
// AFTER the stop must never run. set v=1, stop this script, set v=99 -> v==1.
// Also assert the STOP_OPTION dropdown field round-trips into the block.
// ---------------------------------------------------------------------------
test("control_stop: 'stop this script' terminates the script so the following block never runs (v==1)", async () => {
  const res = await compileProject(
    await projectDir(script("set [v v] to (1)", "stop [this script v]", "set [v v] to (99)")),
  );
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  const stop = blocks.find((b) => b.opcode === "control_stop");
  expect(stop.fields.STOP_OPTION).toEqual(["this script", null]); // dropdown round-trips
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1); // the post-stop "set v to 99" never executed
});

// ---------------------------------------------------------------------------
// Tier-1 — control_start_as_clone
// A flag script clones the sprite; the clone's hat increments n.
// After run: the clone exists (cloneCount Stage+Cat+clone == 3) and its hat ran (n==1).
// ---------------------------------------------------------------------------
test("control_start_as_clone: the clone's hat runs (n==1) and a clone target exists", async () => {
  const src = [
    script("create clone of [_myself_ v]"),
    "when I start as a clone",
    "change [n v] by (1)",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("n"))).toBe(1); // the when-I-start-as-a-clone hat fired exactly once
  expect(st.cloneCount()).toBe(3); // Stage + Cat + 1 clone
  expect(st.runtime().targets.some((t: any) => t.isOriginal === false)).toBe(true);
});

// ---------------------------------------------------------------------------
// Tier-1 — control_create_clone_of  (CLONE_OPTION = _myself_)
// After run: exactly one new target, and it is a clone (isOriginal === false).
// Also assert the menu value round-trips into the shadow's CLONE_OPTION field.
// ---------------------------------------------------------------------------
test("control_create_clone_of: creates exactly one clone target and the menu value round-trips", async () => {
  const res = await compileProject(await projectDir(script("create clone of [_myself_ v]")));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const pj = JSON.parse(await (await JSZip.loadAsync(res.sb3!)).file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const blocks = Object.values(cat.blocks) as any[];
  const menu = blocks.find((b) => b.opcode === "control_create_clone_of_menu" && b.shadow === true);
  expect(menu).toBeTruthy();
  expect(menu.fields.CLONE_OPTION[0]).toBe("_myself_"); // authored value did not get dropped
  const st = await runHeadless(res.sb3!);
  expect(st.cloneCount()).toBe(3); // Stage + Cat + exactly one clone
  const clones = st.runtime().targets.filter((t: any) => t.isOriginal === false);
  expect(clones.length).toBe(1);
});

// ---------------------------------------------------------------------------
// Tier-1 — control_delete_this_clone
// A clone is made then deletes itself; the target count returns to baseline (2)
// and no non-original target remains.
// ---------------------------------------------------------------------------
test("control_delete_this_clone: a clone deletes itself, target count returns to baseline", async () => {
  const src = [
    script("create clone of [_myself_ v]"),
    "when I start as a clone",
    "delete this clone",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const st = await runHeadless(res.sb3!);
  expect(st.cloneCount()).toBe(2); // Stage + Cat — the clone created then disposed itself
  expect(st.runtime().targets.some((t: any) => t.isOriginal === false)).toBe(false);
});

// ---------------------------------------------------------------------------
// Category FLOOR — every CONTROL entry compiles into ONE project that loads
// and steps in a real VM without throwing. Includes: repeat, if/then,
// if/then/else (synthetic control_if_else), repeat until, forever, wait,
// wait until, stop, when-I-start-as-a-clone, create clone of, delete this clone.
// ---------------------------------------------------------------------------
test("control floor: every entry compiles into one project that loads and steps", async () => {
  const src = [
    "when green flag clicked",
    "repeat (3)",
    "  change [v v] by (1)",
    "end",
    "if <(v) = (3)> then",
    "  set [n v] to (1)",
    "end",
    "if <(v) > (99)> then",
    "  set [s v] to (1)",
    "else",
    "  set [s v] to (2)",
    "end",
    "repeat until <(n) = (1)>",
    "  change [n v] by (1)",
    "end",
    "wait (0) seconds",
    "wait until <(n) = (1)>",
    "create clone of [_myself_ v]",
    "forever",
    "  stop [this script v]",
    "end",
    "when I start as a clone",
    "delete this clone",
  ].join("\n");
  const res = await compileProject(await projectDir(src));
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps 120 frames without throwing
});
