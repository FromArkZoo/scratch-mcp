// tests/compiler/packager-grammar.test.ts
import JSZip from "jszip";
import { expect, test } from "vitest";
import { packageProject } from "../../src/compiler/packager.js";
import type { Project, ParsedScript, ParsedBlock } from "../../src/compiler/types.js";
import { runHeadless } from "./vm-harness.js";

const lit = (value: string): any => ({ kind: "literal", value });
const v = (name: string): any => ({ kind: "variable", name });
const blk = (block: ParsedBlock): any => ({ kind: "block", block });
const B = (opcode: string, inputs: any = {}, fields: any = {}, substacks: any = {}): ParsedBlock =>
  ({ opcode, inputs, fields, substacks });

const project: Project = {
  name: "G",
  targets: [
    { name: "Stage", isStage: true, variables: [
      { name: "r", value: 0 }, { name: "b", value: 0 }, { name: "c", value: 0 }, { name: "m", value: 0 },
    ] },
    { name: "Cat", isStage: false, x: 0, y: 0, variables: [] },
  ],
};

// set [r] to ((3) + (4))  => r = 7
const addScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("data_setvariableto",
    { VALUE: blk(B("operator_add", { NUM1: lit("3"), NUM2: lit("4") })) },
    { VARIABLE: "r" }),
] };

// if <(1) > (2)> then {} else { set [b] to (9) }  => b = 9
const ifElseScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("control_if_else",
    { CONDITION: blk(B("operator_gt", { OPERAND1: lit("1"), OPERAND2: lit("2") })) },
    {},
    { SUBSTACK: [], SUBSTACK2: [ B("data_setvariableto", { VALUE: lit("9") }, { VARIABLE: "b" }) ] }),
] };

// repeat until <(c) = (5)> { change [c] by (1) }  => c = 5
const repeatUntilScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("control_repeat_until",
    { CONDITION: blk(B("operator_equals", { OPERAND1: v("c"), OPERAND2: lit("5") })) },
    {},
    { SUBSTACK: [ B("data_changevariableby", { VALUE: lit("1") }, { VARIABLE: "c" }) ] }),
] };

// set [m] to ([abs v] of (-5))  => m = 5
const mathopScript: ParsedScript = { blocks: [
  B("event_whenflagclicked"),
  B("data_setvariableto",
    { VALUE: blk(B("operator_mathop", { NUM: lit("-5") }, { OPERATOR: "abs" })) },
    { VARIABLE: "m" }),
] };

test("hand-built grammar IR runs in the VM: r=7, b=9, c=5, m=5", async () => {
  const { sb3, diagnostics } = await packageProject(project,
    new Map([["Cat", [addScript, ifElseScript, repeatUntilScript, mathopScript]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const state = await runHeadless(sb3);
  expect(Number(state.variable("r"))).toBe(7);
  expect(Number(state.variable("b"))).toBe(9);
  expect(Number(state.variable("c"))).toBe(5);
  expect(Number(state.variable("m"))).toBe(5);
});

test("nested reporter is encoded as [3, childId, shadow] and the child block exists", async () => {
  const { sb3 } = await packageProject(project, new Map([["Cat", [addScript]]]));
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const setBlock = Object.values(cat.blocks).find((x: any) => x.opcode === "data_setvariableto") as any;
  const inp = setBlock.inputs.VALUE;
  expect(inp[0]).toBe(3);                         // block obscuring a shadow
  expect(typeof inp[1]).toBe("string");           // child block id
  expect(cat.blocks[inp[1]].opcode).toBe("operator_add");
});

test("a menu input generates a shadow menu block and a [1, id] input", async () => {
  const gotoScript: ParsedScript = { blocks: [
    B("event_whenflagclicked"),
    B("motion_goto", { TO: { kind: "menu", value: "_random_" } as any }),
  ] };
  const { sb3, diagnostics } = await packageProject(project, new Map([["Cat", [gotoScript]]]));
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const gotoBlock = Object.values(cat.blocks).find((x: any) => x.opcode === "motion_goto") as any;
  const menuId = gotoBlock.inputs.TO[1];
  expect(gotoBlock.inputs.TO[0]).toBe(1);
  const menu = cat.blocks[menuId];
  expect(menu.opcode).toBe("motion_goto_menu");
  expect(menu.shadow).toBe(true);
  expect(menu.fields.TO).toEqual(["_random_", null]);
  // and it still loads + runs without error
  await runHeadless(sb3);
});

test("a variable used as a reporter input encodes the [12,name,id] primitive", async () => {
  const { sb3 } = await packageProject(project, new Map([["Cat", [repeatUntilScript]]]));
  const zip = await JSZip.loadAsync(sb3);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  const cat = pj.targets.find((t: any) => t.name === "Cat");
  const eq = Object.values(cat.blocks).find((x: any) => x.opcode === "operator_equals") as any;
  // OPERAND1 is the variable c: [3, [12, "c", <id>], [10, ""]]
  expect(eq.inputs.OPERAND1[0]).toBe(3);
  expect(eq.inputs.OPERAND1[1][0]).toBe(12);
  expect(eq.inputs.OPERAND1[1][1]).toBe("c");
});

test("unresolved variable in a reporter input is a fail-loud error", async () => {
  const bad: ParsedScript = { blocks: [
    B("event_whenflagclicked"),
    B("data_setvariableto", { VALUE: v("ghost") }, { VARIABLE: "r" }),
  ] };
  const { diagnostics } = await packageProject(project, new Map([["Cat", [bad]]]));
  expect(diagnostics.some((d) => d.severity === "error" && /ghost/.test(d.message))).toBe(true);
});
