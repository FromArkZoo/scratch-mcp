import type { BlockDef } from "./types.js";

export const SLICE: BlockDef[] = [
  { signature: "when green flag clicked", opcode: "event_whenflagclicked", shape: "hat" },
  {
    signature: "set [VARIABLE] to (VALUE)", opcode: "data_setvariableto", shape: "stack",
    inputs: { VALUE: { kind: "text", shadowType: 10 } }, fields: { VARIABLE: { kind: "variable" } },
  },
  {
    signature: "change [VARIABLE] by (VALUE)", opcode: "data_changevariableby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } }, fields: { VARIABLE: { kind: "variable" } },
  },
  {
    signature: "repeat (TIMES)", opcode: "control_repeat", shape: "c",
    inputs: { TIMES: { kind: "number", shadowType: 6 } }, substacks: ["SUBSTACK"],
  },
  {
    signature: "move (STEPS) steps", opcode: "motion_movesteps", shape: "stack",
    inputs: { STEPS: { kind: "number", shadowType: 4 } },
  },
  {
    signature: "turn right (DEGREES) degrees", opcode: "motion_turnright", shape: "stack",
    inputs: { DEGREES: { kind: "number", shadowType: 4 } },
  },
  // ---- operators ----
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
  // ---- control ----
  { signature: "if <CONDITION> then", opcode: "control_if", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "if <CONDITION> then else", opcode: "control_if_else", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK", "SUBSTACK2"] },
  { signature: "repeat until <CONDITION>", opcode: "control_repeat_until", shape: "c",
    inputs: { CONDITION: { kind: "boolean" } }, substacks: ["SUBSTACK"] },
  { signature: "forever", opcode: "control_forever", shape: "c", substacks: ["SUBSTACK"] },
  // ---- motion (menu example) ----
  { signature: "go to [TO v]", opcode: "motion_goto", shape: "stack",
    inputs: { TO: { kind: "menu", menuOpcode: "motion_goto_menu", field: "TO", default: "_random_" } } },
  // ---- extensions proving slice (full Pen/Music palettes are Sub-project B) ----
  { signature: "erase all", opcode: "pen_clear", shape: "stack" },
  { signature: "rest for (BEATS) beats", opcode: "music_restForBeats", shape: "stack",
    inputs: { BEATS: { kind: "number", shadowType: 4 } } },
  // ---- broadcasts (event) ----
  { signature: "broadcast [BROADCAST_INPUT v]", opcode: "event_broadcast", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "broadcast [BROADCAST_INPUT v] and wait", opcode: "event_broadcastandwait", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "when I receive [BROADCAST_OPTION v]", opcode: "event_whenbroadcastreceived", shape: "hat",
    fields: { BROADCAST_OPTION: { kind: "broadcast" } } },
];
