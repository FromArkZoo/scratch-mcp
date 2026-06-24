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
  { signature: "wait (DURATION) seconds", opcode: "control_wait", shape: "stack", inputs: { DURATION: { kind: "number", shadowType: 4 } } },
  { signature: "wait until <CONDITION>", opcode: "control_wait_until", shape: "stack", inputs: { CONDITION: { kind: "boolean" } } },
  { signature: "stop [STOP_OPTION v]", opcode: "control_stop", shape: "stack", fields: { STOP_OPTION: { kind: "dropdown" } } },
  { signature: "when I start as a clone", opcode: "control_start_as_clone", shape: "hat" },
  { signature: "create clone of [CLONE_OPTION v]", opcode: "control_create_clone_of", shape: "stack", inputs: { CLONE_OPTION: { kind: "menu", menuOpcode: "control_create_clone_of_menu", field: "CLONE_OPTION", default: "_myself_" } } },
  { signature: "delete this clone", opcode: "control_delete_this_clone", shape: "cap" },
];
