import { expect, test } from "vitest";
import { parseScripts } from "../../src/compiler/parser/index.js";
import { tokenizeLine } from "../../src/compiler/parser/lexer.js";
import type { InputValue } from "../../src/compiler/types.js";

const parse = (lines: string[], vars: string[] = []) =>
  parseScripts(["when green flag clicked", ...lines].join("\n"), "f", new Set(vars), new Set());

test("effect block disambiguates by dropdown option: color→looks, pitch→sound", () => {
  const r = parse(["set [color v] effect to (25)", "set [pitch v] effect to (100)"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(r.scripts[0].blocks[1].opcode).toBe("looks_seteffectto");
  expect(r.scripts[0].blocks[2].opcode).toBe("sound_seteffectto");
});

test("change-effect disambiguates too (skeleton-identical, options differ)", () => {
  const r = parse(["change [ghost v] effect by (10)", "change [pan v] effect by (-5)"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(r.scripts[0].blocks[1].opcode).toBe("looks_changeeffectby");
  expect(r.scripts[0].blocks[2].opcode).toBe("sound_changeeffectby");
});

test("an unknown effect option fails loud (no silent match)", () => {
  const r = parse(["set [gloop v] effect to (5)"]);
  expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
});

test("a single-line 'if <c> then else' does not match the synthetic control_if_else", () => {
  const r = parse(["if <(1) = (1)> then else"]);
  expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
  expect(r.scripts[0].blocks.map((b) => b.opcode)).not.toContain("control_if_else");
});

test("the two-line if/else idiom still builds control_if_else", () => {
  const r = parse(["if <(1) = (1)> then", "set [x v] to (1)", "else", "set [x v] to (2)", "end"], ["x"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(r.scripts[0].blocks[1].opcode).toBe("control_if_else");
});

test("a stray ] is its own token, not glued onto the previous word", () => {
  expect(tokenizeLine("foo] bar").map((t) => (t.t === "word" ? t.v : t.t))).toEqual(["foo", "]", "bar"]);
});

test("a bare (direction) parses as the motion_direction reporter, not a literal", () => {
  const r = parse(["set [d v] to (direction)"], ["d"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const value = r.scripts[0].blocks[1].inputs.VALUE as InputValue;
  expect(value.kind).toBe("block");
  expect(value.kind === "block" && value.block.opcode).toBe("motion_direction");
});

test("a user variable named 'timer' beats the zero-arg sensing_timer reporter (precedence)", () => {
  const r = parse(["set [v v] to (timer)"], ["timer", "v"]);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const value = r.scripts[0].blocks[1].inputs.VALUE as InputValue;
  expect(value.kind === "variable" && value.name).toBe("timer");
});
