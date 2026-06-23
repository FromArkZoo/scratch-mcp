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
    inputs: { TIMES: { kind: "number", shadowType: 6 } }, substack: "SUBSTACK",
  },
  {
    signature: "move (STEPS) steps", opcode: "motion_movesteps", shape: "stack",
    inputs: { STEPS: { kind: "number", shadowType: 4 } },
  },
  {
    signature: "turn right (DEGREES) degrees", opcode: "motion_turnright", shape: "stack",
    inputs: { DEGREES: { kind: "number", shadowType: 4 } },
  },
];
