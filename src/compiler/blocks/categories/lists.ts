import type { BlockDef } from "../types.js";

export const LISTS: BlockDef[] = [
  { signature: "add [ITEM] to [LIST v]", opcode: "data_addtolist", shape: "stack",
    inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "item (INDEX) of [LIST v]", opcode: "data_itemoflist", shape: "reporter",
    inputs: { INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
  { signature: "delete (INDEX) of [LIST v]", opcode: "data_deleteoflist", shape: "stack", inputs: { INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
  { signature: "delete all of [LIST v]", opcode: "data_deletealloflist", shape: "stack", fields: { LIST: { kind: "list" } } },
  { signature: "insert [ITEM] at (INDEX) of [LIST v]", opcode: "data_insertatlist", shape: "stack", inputs: { ITEM: { kind: "text", shadowType: 10 }, INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
  { signature: "replace item (INDEX) of [LIST v] with [ITEM]", opcode: "data_replaceitemoflist", shape: "stack", inputs: { INDEX: { kind: "number", shadowType: 7 }, ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "item # of [ITEM] in [LIST v]", opcode: "data_itemnumoflist", shape: "reporter", inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "length of [LIST v]", opcode: "data_lengthoflist", shape: "reporter", fields: { LIST: { kind: "list" } } },
  { signature: "[LIST v] contains [ITEM]?", opcode: "data_listcontainsitem", shape: "boolean", inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "show list [LIST v]", opcode: "data_showlist", shape: "stack", fields: { LIST: { kind: "list" } } },
  { signature: "hide list [LIST v]", opcode: "data_hidelist", shape: "stack", fields: { LIST: { kind: "list" } } },
];
