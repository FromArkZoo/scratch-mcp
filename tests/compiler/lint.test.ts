import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { lintScripts } from "../../src/compiler/lint.js";
import { compileProject } from "../../src/compiler/index.js";
import type { ParsedBlock, ParsedScript } from "../../src/compiler/types.js";

async function dirWith(scratch: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lint-"));
  await writeFile(join(dir, "project.yaml"),
    ["name: L", "sprites:", "  - name: Cat", "    source: cat.sprite.scratch",
     "variables:", "  global: { s: 0 }"].join("\n"));
  await writeFile(join(dir, "cat.sprite.scratch"), scratch);
  return dir;
}
const script = (...lines: string[]) => ["when green flag clicked", ...lines].join("\n");

const blk = (opcode: string, substacks: Record<string, ParsedBlock[]> = {}): ParsedBlock =>
  ({ opcode, inputs: {}, fields: {}, substacks });
const hat = (...body: ParsedBlock[]): ParsedScript =>
  ({ blocks: [blk("event_whenflagclicked"), ...body] });
const forever = (...body: ParsedBlock[]) => blk("control_forever", { SUBSTACK: body });
const ifThen = (...body: ParsedBlock[]) => blk("control_if", { SUBSTACK: body });
const ifElse = (a: ParsedBlock[], b: ParsedBlock[]) =>
  blk("control_if_else", { SUBSTACK: a, SUBSTACK2: b });
const repeat = (...body: ParsedBlock[]) => blk("control_repeat", { SUBSTACK: body });

// the anti-pattern: a visual say/think runs every frame, forcing a screen
// refresh every frame, which starves other sprites' non-warp loops.
test("warns when say runs unconditionally inside a forever loop", () => {
  const d = lintScripts([hat(forever(blk("looks_say")))], "hud.sprite.scratch");
  expect(d.length).toBe(1);
  expect(d[0].severity).toBe("warning");
  expect(d[0].file).toBe("hud.sprite.scratch");
  expect(d[0].message).toMatch(/say/i);
  expect(d[0].message).toMatch(/forever|frame|refresh/i);
});

test("warns for think as well", () => {
  const d = lintScripts([hat(forever(blk("looks_think")))], "x.sprite.scratch");
  expect(d.length).toBe(1);
});

test("no warning when the say is guarded by an if inside the forever", () => {
  const d = lintScripts([hat(forever(ifThen(blk("looks_say"))))], "hud.sprite.scratch");
  expect(d).toEqual([]);
});

test("no warning when the say is in an if/else branch inside the forever", () => {
  const d = lintScripts([hat(forever(ifElse([blk("looks_say")], [blk("looks_think")])))], "x.sprite.scratch");
  expect(d).toEqual([]);
});

test("does not flag the pen renderer (pen + motion every frame is the intended pattern)", () => {
  const d = lintScripts([hat(forever(blk("pen_clear"), blk("motion_gotoxy"), blk("pen_penDown")))], "engine.sprite.scratch");
  expect(d).toEqual([]);
});

test("no warning for a one-shot say not inside any forever", () => {
  const d = lintScripts([hat(repeat(blk("looks_say")))], "x.sprite.scratch");
  expect(d).toEqual([]);
});

test("warns when say sits in a finite repeat nested inside a forever", () => {
  const d = lintScripts([hat(forever(repeat(blk("looks_say"))))], "x.sprite.scratch");
  expect(d.length).toBe(1);
});

test("clean script produces no warnings", () => {
  const d = lintScripts([hat(forever(blk("data_setvariableto"), ifThen(blk("looks_say"))))], "x.sprite.scratch");
  expect(d).toEqual([]);
});

// ---- integration: the lint runs as part of compileProject ----
test("compileProject surfaces the per-frame say warning but still compiles ok", async () => {
  const dir = await dirWith(script("forever", "say (s)", "end"));
  const res = await compileProject(dir);
  expect(res.ok).toBe(true); // warnings never fail the compile
  const warns = res.diagnostics.filter((d) => d.severity === "warning");
  expect(warns.length).toBe(1);
  expect(warns[0].file).toBe("cat.sprite.scratch");
  expect(warns[0].message).toMatch(/say/i);
});

test("compileProject: a guarded say emits no warning", async () => {
  const dir = await dirWith(script("forever", "if <not <(s) = (1)>> then", "say (s)", "end", "end"));
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "warning").length).toBe(0);
});
