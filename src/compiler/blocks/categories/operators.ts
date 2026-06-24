import type { BlockDef } from "../types.js";

export const OPERATORS: BlockDef[] = [
  { signature: "(NUM1) + (NUM2)", opcode: "operator_add", shape: "reporter",
    inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "(NUM1) - (NUM2)", opcode: "operator_subtract", shape: "reporter",
    inputs: { NUM1: { kind: "number", shadowType: 4 }, NUM2: { kind: "number", shadowType: 4 } } },
  { signature: "(OPERAND1) < (OPERAND2)", opcode: "operator_lt", shape: "boolean",
    inputs: { OPERAND1: { kind: "text", shadowType: 10 }, OPERAND2: { kind: "text", shadowType: 10 } } },
  { signature: "(OPERAND1) = (OPERAND2)", opcode: "operator_equals", shape: "boolean",
    inputs: { OPERAND1: { kind: "text", shadowType: 10 }, OPERAND2: { kind: "text", shadowType: 10 } } },
  { signature: "(OPERAND1) > (OPERAND2)", opcode: "operator_gt", shape: "boolean",
    inputs: { OPERAND1: { kind: "text", shadowType: 10 }, OPERAND2: { kind: "text", shadowType: 10 } } },
  { signature: "<OPERAND1> and <OPERAND2>", opcode: "operator_and", shape: "boolean",
    inputs: { OPERAND1: { kind: "boolean" }, OPERAND2: { kind: "boolean" } } },
  { signature: "<OPERAND1> or <OPERAND2>", opcode: "operator_or", shape: "boolean",
    inputs: { OPERAND1: { kind: "boolean" }, OPERAND2: { kind: "boolean" } } },
  { signature: "not <OPERAND>", opcode: "operator_not", shape: "boolean",
    inputs: { OPERAND: { kind: "boolean" } } },
  { signature: "[OPERATOR v] of (NUM)", opcode: "operator_mathop", shape: "reporter",
    inputs: { NUM: { kind: "number", shadowType: 4 } }, fields: { OPERATOR: { kind: "dropdown" } } },
];
