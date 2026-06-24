import { expect, test } from "vitest";
import { assertUniqueSkeletons, skeletonKey } from "../../src/compiler/blocks/skeleton.js";
import type { BlockDef } from "../../src/compiler/blocks/types.js";

test("two identical-skeleton statement defs collide", () => {
  const a: BlockDef = { signature: "set [E v] effect to (V)", opcode: "a", shape: "stack", fields: { E: { kind: "dropdown" } } };
  const b: BlockDef = { signature: "set [E v] effect to (V)", opcode: "b", shape: "stack", fields: { E: { kind: "dropdown" } } };
  expect(() => assertUniqueSkeletons([a, b])).toThrow(/collision/);
});

test("options-distinguished dropdowns do NOT collide", () => {
  const a: BlockDef = { signature: "set [E v] effect to (V)", opcode: "a", shape: "stack", fields: { E: { kind: "dropdown", options: ["color", "ghost"] } } };
  const b: BlockDef = { signature: "set [E v] effect to (V)", opcode: "b", shape: "stack", fields: { E: { kind: "dropdown", options: ["pitch", "pan"] } } };
  expect(() => assertUniqueSkeletons([a, b])).not.toThrow();
  expect(skeletonKey(a)).not.toBe(skeletonKey(b));
});

test("same text in different pools does not collide (reporter vs statement)", () => {
  const a: BlockDef = { signature: "size", opcode: "looks_size", shape: "reporter" };
  const b: BlockDef = { signature: "size", opcode: "x_size", shape: "stack" };
  expect(() => assertUniqueSkeletons([a, b])).not.toThrow();
});

test("synthetic defs are skipped by the guard", () => {
  const a: BlockDef = { signature: "if <C> then else", opcode: "control_if_else", shape: "c", synthetic: true };
  const b: BlockDef = { signature: "if <C> then else", opcode: "dup", shape: "c", synthetic: true };
  expect(() => assertUniqueSkeletons([a, b])).not.toThrow();
});
