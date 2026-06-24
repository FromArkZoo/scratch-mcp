import type { BlockDef } from "../types.js";

export const VARIABLES: BlockDef[] = [
  { signature: "set [VARIABLE] to (VALUE)", opcode: "data_setvariableto", shape: "stack",
    inputs: { VALUE: { kind: "text", shadowType: 10 } }, fields: { VARIABLE: { kind: "variable" } } },
  { signature: "change [VARIABLE] by (VALUE)", opcode: "data_changevariableby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } }, fields: { VARIABLE: { kind: "variable" } } },
];
