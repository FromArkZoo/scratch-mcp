import type { BlockDef } from "../types.js";

export const PEN: BlockDef[] = [
  { signature: "erase all", opcode: "pen_clear", shape: "stack" },
  { signature: "stamp", opcode: "pen_stamp", shape: "stack" },
  { signature: "pen down", opcode: "pen_penDown", shape: "stack" },
  { signature: "pen up", opcode: "pen_penUp", shape: "stack" },
  { signature: "set pen color to [COLOR]", opcode: "pen_setPenColorToColor", shape: "stack", inputs: { COLOR: { kind: "text", shadowType: 9 } } },
  { signature: "change pen [COLOR_PARAM v] by (VALUE)", opcode: "pen_changePenColorParamBy", shape: "stack", inputs: { COLOR_PARAM: { kind: "menu", menuOpcode: "pen_menu_colorParam", field: "colorParam", default: "color" }, VALUE: { kind: "number", shadowType: 4 } } },
  { signature: "set pen [COLOR_PARAM v] to (VALUE)", opcode: "pen_setPenColorParamTo", shape: "stack", inputs: { COLOR_PARAM: { kind: "menu", menuOpcode: "pen_menu_colorParam", field: "colorParam", default: "color" }, VALUE: { kind: "number", shadowType: 4 } } },
  { signature: "change pen size by (SIZE)", opcode: "pen_changePenSizeBy", shape: "stack", inputs: { SIZE: { kind: "number", shadowType: 4 } } },
  { signature: "set pen size to (SIZE)", opcode: "pen_setPenSizeTo", shape: "stack", inputs: { SIZE: { kind: "number", shadowType: 4 } } },
];
