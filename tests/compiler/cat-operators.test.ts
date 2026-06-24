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
// TIER 1 — runtime-asserted reporters/booleans (capture the result into [v v])
// Every operator below is pure & deterministic, so the headless VM can assert
// the exact computed value.
// =============================================================================

// operator_multiply — (6) * (7) === 42
test("operator_multiply: set [v v] to ((6) * (7)) computes 42", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to ((6) * (7))")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(42);
});

// operator_divide — (20) / (4) === 5
test("operator_divide: set [v v] to ((20) / (4)) computes 5", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to ((20) / (4))")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(5);
});

// operator_random — pick random (5) to (5) short-circuits to exactly 5
test("operator_random: pick random (5) to (5) returns exactly 5", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (pick random (5) to (5))")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(5);
});

// operator_join — the lexer trims text tokens, so join concatenates without an inter-word space.
test("operator_join: join [hello] [world] yields 'helloworld'", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (join [hello] [world])")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(String(st.variable("v"))).toBe("helloworld");
});

// operator_letter_of — letter (1) of [apple] === 'a'
test("operator_letter_of: letter (1) of [apple] yields 'a'", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (letter (1) of [apple])")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(String(st.variable("v"))).toBe("a");
});

// operator_length — length of [apple] === 5
test("operator_length: length of [apple] yields 5", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (length of [apple])")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(5);
});

// operator_contains — if <[apple] contains [pp]?> then set [v v] to (1)
test("operator_contains: <[apple] contains [pp]?> is true so the if-body runs", async () => {
  const res = await compileProject(
    await projectDir(script("if <[apple] contains [pp]?> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_mod — (10) mod (3) === 1
test("operator_mod: set [v v] to ((10) mod (3)) computes 1", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to ((10) mod (3))")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_round — round (2.6) === 3
test("operator_round: set [v v] to (round (2.6)) computes 3", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to (round (2.6))")));
  noErrors(res);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(3);
});

// =============================================================================
// TIER 2 — structural shape + loads-and-runs.
// These entries are not in the registered Tier-1 set, but they are pure &
// deterministic, so each test ALSO captures the result and runtime-asserts it
// (stronger than loads-only). operator_mathop additionally round-trips its
// OPERATOR dropdown field into the sb3 so a dropped-value bug is caught.
// =============================================================================

// operator_add — (3) + (4) === 7
test("operator_add: emits operator_add and computes 7", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to ((3) + (4))")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_add")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(7);
});

// operator_subtract — (10) - (4) === 6
test("operator_subtract: emits operator_subtract and computes 6", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to ((10) - (4))")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_subtract")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(6);
});

// operator_lt — <(1) < (2)> is true so the if-body runs (v==1)
test("operator_lt: emits operator_lt; <(1) < (2)> runs the if-body", async () => {
  const res = await compileProject(
    await projectDir(script("if <(1) < (2)> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_lt")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_equals — <(5) = (5)> is true so the if-body runs (v==1)
test("operator_equals: emits operator_equals; <(5) = (5)> runs the if-body", async () => {
  const res = await compileProject(
    await projectDir(script("if <(5) = (5)> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_equals")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_gt — <(2) > (1)> is true so the if-body runs (v==1)
test("operator_gt: emits operator_gt; <(2) > (1)> runs the if-body", async () => {
  const res = await compileProject(
    await projectDir(script("if <(2) > (1)> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_gt")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_and — <<(1) < (2)> and <(2) < (3)>> is true so the if-body runs
test("operator_and: emits operator_and; a true AND runs the if-body", async () => {
  const res = await compileProject(
    await projectDir(script("if <<(1) < (2)> and <(2) < (3)>> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_and")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_or — <<(1) > (2)> or <(2) < (3)>> is true so the if-body runs
test("operator_or: emits operator_or; a one-true OR runs the if-body", async () => {
  const res = await compileProject(
    await projectDir(script("if <<(1) > (2)> or <(2) < (3)>> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_or")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_not — not <(1) > (2)> is true (since 1>2 is false) so the if-body runs
test("operator_not: emits operator_not; not <false> runs the if-body", async () => {
  const res = await compileProject(
    await projectDir(script("if <not <(1) > (2)>> then", "  set [v v] to (1)", "end")),
  );
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  expect(blocks.some((b) => b.opcode === "operator_not")).toBe(true);
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(1);
});

// operator_mathop — [abs v] of (-5) === 5; OPERATOR is a dropdown FIELD (no shadow)
test("operator_mathop: [abs v] of (-5) round-trips OPERATOR and computes 5", async () => {
  const res = await compileProject(await projectDir(script("set [v v] to ([abs v] of (-5))")));
  noErrors(res);
  const blocks = await catBlocks(res.sb3!);
  const mathop = blocks.find((b) => b.opcode === "operator_mathop");
  expect(mathop).toBeTruthy();
  expect(mathop.fields.OPERATOR).toEqual(["abs", null]); // dropdown value round-trips
  const st = await runHeadless(res.sb3!);
  expect(Number(st.variable("v"))).toBe(5);
});

// =============================================================================
// FLOOR — exactly one test exercising EVERY operators entry (18 blocks)
// =============================================================================
test("operators floor: every operator block compiles and loads in a real VM", async () => {
  const res = await compileProject(
    await projectDir(
      script(
        // arithmetic + math reporters captured into a var
        "set [v v] to ((1) + (2))",
        "set [v v] to ((5) - (3))",
        "set [v v] to ((6) * (7))",
        "set [v v] to ((20) / (4))",
        "set [v v] to ((10) mod (3))",
        "set [v v] to (round (2.6))",
        "set [v v] to ([abs v] of (-5))",
        "set [v v] to (pick random (1) to (10))",
        // string reporters
        "set [v v] to (join [hello ] [world])",
        "set [v v] to (letter (1) of [apple])",
        "set [v v] to (length of [apple])",
        // boolean reporters captured in ifs
        "if <(1) < (2)> then",
        "  set [v v] to (1)",
        "end",
        "if <(5) = (5)> then",
        "  set [v v] to (1)",
        "end",
        "if <(2) > (1)> then",
        "  set [v v] to (1)",
        "end",
        "if <<(1) < (2)> and <(2) < (3)>> then",
        "  set [v v] to (1)",
        "end",
        "if <<(1) > (2)> or <(2) < (3)>> then",
        "  set [v v] to (1)",
        "end",
        "if <not <(1) > (2)>> then",
        "  set [v v] to (1)",
        "end",
        "if <[apple] contains [pp]?> then",
        "  set [v v] to (1)",
        "end",
      ),
    ),
  );
  noErrors(res);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps 120 frames without throwing
});
