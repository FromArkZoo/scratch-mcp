import type { BlockDef } from "../types.js";

export const SENSING: BlockDef[] = [
  { signature: "touching [TOUCHINGOBJECTMENU v]?", opcode: "sensing_touchingobject", shape: "boolean", inputs: { TOUCHINGOBJECTMENU: { kind: "menu", menuOpcode: "sensing_touchingobjectmenu", field: "TOUCHINGOBJECTMENU", default: "_mouse_" } } },
  { signature: "touching color (COLOR)?", opcode: "sensing_touchingcolor", shape: "boolean", inputs: { COLOR: { kind: "text", shadowType: 9 } } },
  { signature: "color (COLOR) is touching (COLOR2)?", opcode: "sensing_coloristouchingcolor", shape: "boolean", inputs: { COLOR: { kind: "text", shadowType: 9 }, COLOR2: { kind: "text", shadowType: 9 } } },
  { signature: "distance to [DISTANCETOMENU v]", opcode: "sensing_distanceto", shape: "reporter", inputs: { DISTANCETOMENU: { kind: "menu", menuOpcode: "sensing_distancetomenu", field: "DISTANCETOMENU", default: "_mouse_" } } },
  { signature: "ask (QUESTION) and wait", opcode: "sensing_askandwait", shape: "stack", inputs: { QUESTION: { kind: "text", shadowType: 10 } } },
  { signature: "answer", opcode: "sensing_answer", shape: "reporter" },
  { signature: "key [KEY_OPTION v] pressed?", opcode: "sensing_keypressed", shape: "boolean", inputs: { KEY_OPTION: { kind: "menu", menuOpcode: "sensing_keyoptions", field: "KEY_OPTION", default: "space" } } },
  { signature: "mouse down?", opcode: "sensing_mousedown", shape: "boolean" },
  { signature: "mouse x", opcode: "sensing_mousex", shape: "reporter" },
  { signature: "mouse y", opcode: "sensing_mousey", shape: "reporter" },
  { signature: "set drag mode [DRAG_MODE v]", opcode: "sensing_setdragmode", shape: "stack", fields: { DRAG_MODE: { kind: "dropdown" } } },
  { signature: "loudness", opcode: "sensing_loudness", shape: "reporter" },
  { signature: "timer", opcode: "sensing_timer", shape: "reporter" },
  { signature: "reset timer", opcode: "sensing_resettimer", shape: "stack" },
  { signature: "[PROPERTY v] of [OBJECT v]", opcode: "sensing_of", shape: "reporter", inputs: { OBJECT: { kind: "menu", menuOpcode: "sensing_of_object_menu", field: "OBJECT", default: "_stage_" } }, fields: { PROPERTY: { kind: "dropdown" } } },
  { signature: "current [CURRENTMENU v]", opcode: "sensing_current", shape: "reporter", fields: { CURRENTMENU: { kind: "dropdown" } } },
  { signature: "days since 2000", opcode: "sensing_dayssince2000", shape: "reporter" },
  { signature: "username", opcode: "sensing_username", shape: "reporter" },
];
