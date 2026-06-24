import type { BlockDef } from "../types.js";

export const LOOKS: BlockDef[] = [
  { signature: "change [EFFECT v] effect by (CHANGE)", opcode: "looks_changeeffectby", shape: "stack",
    inputs: { CHANGE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"] } } },
  { signature: "set [EFFECT v] effect to (VALUE)", opcode: "looks_seteffectto", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"] } } },
];
