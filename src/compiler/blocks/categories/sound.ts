import type { BlockDef } from "../types.js";

export const SOUND: BlockDef[] = [
  { signature: "change [EFFECT v] effect by (VALUE)", opcode: "sound_changeeffectby", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["pitch", "pan"] } } },
  { signature: "set [EFFECT v] effect to (VALUE)", opcode: "sound_seteffectto", shape: "stack",
    inputs: { VALUE: { kind: "number", shadowType: 4 } },
    fields: { EFFECT: { kind: "dropdown", options: ["pitch", "pan"] } } },
  { signature: "play sound [SOUND_MENU v] until done", opcode: "sound_playuntildone", shape: "stack", inputs: { SOUND_MENU: { kind: "menu", menuOpcode: "sound_sounds_menu", field: "SOUND_MENU", default: "Meow" } } },
  { signature: "start sound [SOUND_MENU v]", opcode: "sound_play", shape: "stack", inputs: { SOUND_MENU: { kind: "menu", menuOpcode: "sound_sounds_menu", field: "SOUND_MENU", default: "Meow" } } },
  { signature: "stop all sounds", opcode: "sound_stopallsounds", shape: "stack" },
  { signature: "clear sound effects", opcode: "sound_cleareffects", shape: "stack" },
  { signature: "change volume by (VOLUME)", opcode: "sound_changevolumeby", shape: "stack", inputs: { VOLUME: { kind: "number", shadowType: 4 } } },
  { signature: "set volume to (VOLUME) %", opcode: "sound_setvolumeto", shape: "stack", inputs: { VOLUME: { kind: "number", shadowType: 4 } } },
  { signature: "volume", opcode: "sound_volume", shape: "reporter" },
];
