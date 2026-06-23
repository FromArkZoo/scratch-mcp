import { expect, test } from "vitest";
import { byOpcode, bySignature, SLICE } from "../../src/compiler/blocks/registry.js";

test("slice covers the expected opcodes", () => {
  const opcodes = SLICE.map((d) => d.opcode).sort();
  expect(opcodes).toEqual([
    "control_forever", "control_if", "control_if_else", "control_repeat", "control_repeat_until",
    "data_changevariableby", "data_setvariableto", "event_whenflagclicked",
    "motion_goto", "motion_movesteps", "motion_turnright",
    "operator_add", "operator_and", "operator_equals", "operator_gt", "operator_lt",
    "operator_mathop", "operator_not", "operator_or", "operator_subtract",
  ]);
});

test("repeat is a c-block with a SUBSTACK and a whole-number TIMES input", () => {
  const def = byOpcode.get("control_repeat")!;
  expect(def.shape).toBe("c");
  expect(def.substacks).toEqual(["SUBSTACK"]);
  const timesSpec = def.inputs!.TIMES;
  expect(timesSpec.kind === "number" || timesSpec.kind === "text" ? timesSpec.shadowType : undefined).toBe(6);
});

test("set variable resolves by signature and has a variable field", () => {
  const def = bySignature.get("set [VARIABLE] to (VALUE)")!;
  expect(def.opcode).toBe("data_setvariableto");
  expect(def.fields!.VARIABLE.kind).toBe("variable");
  const valueSpec = def.inputs!.VALUE;
  expect(valueSpec.kind === "number" || valueSpec.kind === "text" ? valueSpec.shadowType : undefined).toBe(10);
});

test("operator_add is a reporter with two number inputs", () => {
  const def = byOpcode.get("operator_add")!;
  expect(def.shape).toBe("reporter");
  expect(def.inputs!.NUM1.kind).toBe("number");
  expect(def.inputs!.NUM2.kind).toBe("number");
});

test("operator_gt is a boolean reporter", () => {
  expect(byOpcode.get("operator_gt")!.shape).toBe("boolean");
});

test("operator_and takes two boolean inputs", () => {
  const def = byOpcode.get("operator_and")!;
  expect(def.shape).toBe("boolean");
  expect(def.inputs!.OPERAND1.kind).toBe("boolean");
  expect(def.inputs!.OPERAND2.kind).toBe("boolean");
});

test("operator_not takes one boolean input", () => {
  expect(byOpcode.get("operator_not")!.inputs!.OPERAND.kind).toBe("boolean");
});

test("operator_mathop has a dropdown OPERATOR field and a number input", () => {
  const def = byOpcode.get("operator_mathop")!;
  expect(def.shape).toBe("reporter");
  expect(def.fields!.OPERATOR.kind).toBe("dropdown");
  expect(def.inputs!.NUM.kind).toBe("number");
});

test("control_if_else is a c-block with two substacks and a boolean condition", () => {
  const def = byOpcode.get("control_if_else")!;
  expect(def.shape).toBe("c");
  expect(def.substacks).toEqual(["SUBSTACK", "SUBSTACK2"]);
  expect(def.inputs!.CONDITION.kind).toBe("boolean");
});

test("control_repeat_until is a c-block with a boolean condition", () => {
  const def = byOpcode.get("control_repeat_until")!;
  expect(def.inputs!.CONDITION.kind).toBe("boolean");
  expect(def.substacks).toEqual(["SUBSTACK"]);
});

test("control_forever is a c-block with one substack and no condition", () => {
  const def = byOpcode.get("control_forever")!;
  expect(def.substacks).toEqual(["SUBSTACK"]);
  expect(def.inputs).toBeUndefined();
});

test("motion_goto resolves a menu input by signature", () => {
  const def = bySignature.get("go to [TO v]")!;
  expect(def.opcode).toBe("motion_goto");
  const spec = def.inputs!.TO;
  expect(spec.kind).toBe("menu");
  if (spec.kind === "menu") {
    expect(spec.menuOpcode).toBe("motion_goto_menu");
    expect(spec.field).toBe("TO");
    expect(spec.default).toBe("_random_");
  }
});
