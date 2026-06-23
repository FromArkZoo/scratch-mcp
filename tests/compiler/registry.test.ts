import { expect, test } from "vitest";
import { byOpcode, bySignature, SLICE } from "../../src/compiler/blocks/registry.js";

test("slice covers the six expected opcodes", () => {
  const opcodes = SLICE.map((d) => d.opcode).sort();
  expect(opcodes).toEqual([
    "control_repeat", "data_changevariableby", "data_setvariableto",
    "event_whenflagclicked", "motion_movesteps", "motion_turnright",
  ]);
});

test("repeat is a c-block with a SUBSTACK and a whole-number TIMES input", () => {
  const def = byOpcode.get("control_repeat")!;
  expect(def.shape).toBe("c");
  expect(def.substack).toBe("SUBSTACK");
  expect(def.inputs!.TIMES.shadowType).toBe(6);
});

test("set variable resolves by signature and has a variable field", () => {
  const def = bySignature.get("set [VARIABLE] to (VALUE)")!;
  expect(def.opcode).toBe("data_setvariableto");
  expect(def.fields!.VARIABLE.kind).toBe("variable");
  expect(def.inputs!.VALUE.shadowType).toBe(10);
});
