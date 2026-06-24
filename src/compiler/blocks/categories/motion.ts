import type { BlockDef } from "../types.js";

export const MOTION: BlockDef[] = [
  { signature: "move (STEPS) steps", opcode: "motion_movesteps", shape: "stack",
    inputs: { STEPS: { kind: "number", shadowType: 4 } } },
  { signature: "turn right (DEGREES) degrees", opcode: "motion_turnright", shape: "stack",
    inputs: { DEGREES: { kind: "number", shadowType: 4 } } },
  { signature: "go to [TO v]", opcode: "motion_goto", shape: "stack",
    inputs: { TO: { kind: "menu", menuOpcode: "motion_goto_menu", field: "TO", default: "_random_" } } },
];
