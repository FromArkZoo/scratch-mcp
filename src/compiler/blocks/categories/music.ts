import type { BlockDef } from "../types.js";

export const MUSIC: BlockDef[] = [
  { signature: "rest for (BEATS) beats", opcode: "music_restForBeats", shape: "stack",
    inputs: { BEATS: { kind: "number", shadowType: 4 } } },
  { signature: "play drum [DRUM v] for (BEATS) beats", opcode: "music_playDrumForBeats", shape: "stack", inputs: { DRUM: { kind: "menu", menuOpcode: "music_menu_DRUM", field: "DRUM", default: "1" }, BEATS: { kind: "number", shadowType: 4 } } },
  { signature: "play note (NOTE) for (BEATS) beats", opcode: "music_playNoteForBeats", shape: "stack", inputs: { NOTE: { kind: "number", shadowType: 4 }, BEATS: { kind: "number", shadowType: 4 } } },
  { signature: "set instrument to [INSTRUMENT v]", opcode: "music_setInstrument", shape: "stack", inputs: { INSTRUMENT: { kind: "menu", menuOpcode: "music_menu_INSTRUMENT", field: "INSTRUMENT", default: "1" } } },
  { signature: "set tempo to (TEMPO)", opcode: "music_setTempo", shape: "stack", inputs: { TEMPO: { kind: "number", shadowType: 4 } } },
  { signature: "change tempo by (TEMPO)", opcode: "music_changeTempo", shape: "stack", inputs: { TEMPO: { kind: "number", shadowType: 4 } } },
  { signature: "tempo", opcode: "music_getTempo", shape: "reporter" },
];
