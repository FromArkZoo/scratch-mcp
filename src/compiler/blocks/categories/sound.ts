import type { BlockDef } from "../types.js";

export const SOUND: BlockDef[] = [
  { signature: "change [EFFECT v] effect by (VALUE)", opcode: "sound_changeeffectby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["pitch", "pan"] } } },
  { signature: "set [EFFECT v] effect to (VALUE)", opcode: "sound_seteffectto", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["pitch", "pan"] } } },
];
