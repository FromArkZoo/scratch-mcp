import type { BlockDef } from "../types.js";

export const EVENTS: BlockDef[] = [
  { signature: "when green flag clicked", opcode: "event_whenflagclicked", shape: "hat" },
  { signature: "broadcast [BROADCAST_INPUT v]", opcode: "event_broadcast", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "broadcast [BROADCAST_INPUT v] and wait", opcode: "event_broadcastandwait", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "when I receive [BROADCAST_OPTION v]", opcode: "event_whenbroadcastreceived", shape: "hat",
    fields: { BROADCAST_OPTION: { kind: "broadcast" } } },
  { signature: "when [KEY_OPTION v] key pressed", opcode: "event_whenkeypressed", shape: "hat", fields: { KEY_OPTION: { kind: "dropdown" } } },
  { signature: "when this sprite clicked", opcode: "event_whenthisspriteclicked", shape: "hat" },
  { signature: "when stage clicked", opcode: "event_whenstageclicked", shape: "hat" },
  { signature: "when backdrop switches to [BACKDROP v]", opcode: "event_whenbackdropswitchesto", shape: "hat", fields: { BACKDROP: { kind: "dropdown" } } },
  { signature: "when [WHENGREATERTHANMENU v] > (VALUE)", opcode: "event_whengreaterthan", shape: "hat", inputs: { VALUE: { kind: "number", shadowType: 4 } }, fields: { WHENGREATERTHANMENU: { kind: "dropdown" } } },
];
