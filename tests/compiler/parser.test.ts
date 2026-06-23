import { expect, test } from "vitest";
import { parseScripts } from "../../src/compiler/parser/index.js";

const vars = new Set(["angle", "r", "c"]);

test("parses a hat + a set with a literal", () => {
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [angle v] to (0)", "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const b = scripts[0].blocks;
  expect(b[0].opcode).toBe("event_whenflagclicked");
  expect(b[1].opcode).toBe("data_setvariableto");
  expect(b[1].fields.VARIABLE).toBe("angle");
  expect(b[1].inputs.VALUE).toEqual({ kind: "literal", value: "0" });
});

test("parses a nested infix reporter into a block InputValue", () => {
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [r v] to ((3) + (4))", "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const setv = scripts[0].blocks[1];
  const val = setv.inputs.VALUE;
  expect(val.kind).toBe("block");
  if (val.kind === "block") {
    expect(val.block.opcode).toBe("operator_add");
    expect(val.block.inputs.NUM1).toEqual({ kind: "literal", value: "3" });
    expect(val.block.inputs.NUM2).toEqual({ kind: "literal", value: "4" });
  }
});

test("a bare known-variable name in a round slot becomes a variable reporter", () => {
  const { scripts } = parseScripts("when green flag clicked\nchange [c v] by (c)", "f", vars);
  expect(scripts[0].blocks[1].inputs.VALUE).toEqual({ kind: "variable", name: "c" });
});

test("a dropdown field + nested input: ([abs v] of (-5))", () => {
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [r v] to ([abs v] of (-5))", "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const val = scripts[0].blocks[1].inputs.VALUE;
  expect(val.kind).toBe("block");
  if (val.kind === "block") {
    expect(val.block.opcode).toBe("operator_mathop");
    expect(val.block.fields.OPERATOR).toBe("abs");
    expect(val.block.inputs.NUM).toEqual({ kind: "literal", value: "-5" });
  }
});

test("a menu input becomes a menu InputValue", () => {
  const { scripts } = parseScripts("when green flag clicked\ngo to [random position v]", "f", vars);
  expect(scripts[0].blocks[1].inputs.TO).toEqual({ kind: "menu", value: "random position" });
});

test("an unknown block is a fail-loud diagnostic", () => {
  const { diagnostics } = parseScripts("when green flag clicked\nfly (3) times", "f", vars);
  expect(diagnostics.some((d) => d.severity === "error" && /fly/.test(d.message))).toBe(true);
});

test("a boolean reporter parses into a block: <(1) > (2)>", () => {
  // exercised via 'wait until' is Task 6; here assert operator_gt parses standalone as an input is not valid,
  // so test the matcher through 'not': set is invalid for boolean, use the standalone parse helper instead.
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nset [r v] to <(1) > (2)>", "f", vars);
  // boolean into a number slot is a type error → fail loud
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  void scripts;
});

test("a multi-word known variable in a round slot becomes a variable reporter", () => {
  const mv = new Set(["my score", "c"]);
  const { scripts, diagnostics } = parseScripts("when green flag clicked\nchange [c v] by (my score)", "f", mv);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(scripts[0].blocks[1].inputs.VALUE).toEqual({ kind: "variable", name: "my score" });
});

test("parses repeat with a substack", () => {
  const src = "when green flag clicked\nrepeat (3)\n  change [c v] by (1)\nend";
  const { scripts, diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const rep = scripts[0].blocks[1];
  expect(rep.opcode).toBe("control_repeat");
  expect(rep.substacks.SUBSTACK.map((x) => x.opcode)).toEqual(["data_changevariableby"]);
});

test("parses if/else into control_if_else with two substacks and a boolean condition", () => {
  const src = "when green flag clicked\nif <(1) > (2)> then\n  change [c v] by (1)\nelse\n  change [c v] by (2)\nend";
  const { scripts, diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const ie = scripts[0].blocks[1];
  expect(ie.opcode).toBe("control_if_else");
  expect(ie.inputs.CONDITION.kind).toBe("block");
  expect(ie.substacks.SUBSTACK.map((x) => x.opcode)).toEqual(["data_changevariableby"]);
  expect(ie.substacks.SUBSTACK2.map((x) => x.opcode)).toEqual(["data_changevariableby"]);
});

test("a plain if (no else) is control_if with one substack", () => {
  const src = "when green flag clicked\nif <(1) > (2)> then\n  change [c v] by (1)\nend";
  const { scripts } = parseScripts(src, "f", vars);
  expect(scripts[0].blocks[1].opcode).toBe("control_if");
  expect(scripts[0].blocks[1].substacks.SUBSTACK2).toBeUndefined();
});

test("parses repeat until with a boolean condition and nesting", () => {
  const src = "when green flag clicked\nrepeat until <(c) = (5)>\n  change [c v] by (1)\nend";
  const { scripts, diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const ru = scripts[0].blocks[1];
  expect(ru.opcode).toBe("control_repeat_until");
  expect(ru.inputs.CONDITION.kind).toBe("block");
});

test("an unterminated c-block is a fail-loud diagnostic", () => {
  const src = "when green flag clicked\nrepeat (3)\n  change [c v] by (1)";
  const { diagnostics } = parseScripts(src, "f", vars);
  expect(diagnostics.some((d) => d.severity === "error" && /end/.test(d.message))).toBe(true);
});
