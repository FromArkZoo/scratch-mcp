import type { BlockDef } from "../types.js";

export const MUSIC: BlockDef[] = [
  { signature: "rest for (BEATS) beats", opcode: "music_restForBeats", shape: "stack",
    inputs: { BEATS: { kind: "number", shadowType: 4 } } },
];
