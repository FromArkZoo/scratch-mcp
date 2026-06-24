import type { BlockDef } from "../types.js";

export const CONTROL: BlockDef[] = [
  { signature: "repeat (TIMES)", opcode: "control_repeat", shape: "c",
    inputs: { TIMES: { kind: "number", shadowType: 6 } }, substacks: ["SUBSTACK"] },
  { signature: "if <CONDITION> then", opcode: "control_if", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "if <CONDITION> then else", opcode: "control_if_else", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK", "SUBSTACK2"], synthetic: true },
  { signature: "repeat until <CONDITION>", opcode: "control_repeat_until", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "forever", opcode: "control_forever", shape: "c", substacks: ["SUBSTACK"] },
];
