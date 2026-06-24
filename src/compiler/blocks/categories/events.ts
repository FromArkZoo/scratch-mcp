import type { BlockDef } from "../types.js";

export const EVENTS: BlockDef[] = [
  { signature: "when green flag clicked", opcode: "event_whenflagclicked", shape: "hat" },
  { signature: "broadcast [BROADCAST_INPUT v]", opcode: "event_broadcast", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "broadcast [BROADCAST_INPUT v] and wait", opcode: "event_broadcastandwait", shape: "stack",
    inputs: { BROADCAST_INPUT: { kind: "menu", menuOpcode: "event_broadcast_menu", field: "BROADCAST_OPTION", default: "message1", broadcast: true } } },
  { signature: "when I receive [BROADCAST_OPTION v]", opcode: "event_whenbroadcastreceived", shape: "hat",
    fields: { BROADCAST_OPTION: { kind: "broadcast" } } },
];
