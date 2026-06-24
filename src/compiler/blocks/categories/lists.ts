import type { BlockDef } from "../types.js";

export const LISTS: BlockDef[] = [
  { signature: "add [ITEM] to [LIST v]", opcode: "data_addtolist", shape: "stack",
    inputs: { ITEM: { kind: "text", shadowType: 10 } }, fields: { LIST: { kind: "list" } } },
  { signature: "item (INDEX) of [LIST v]", opcode: "data_itemoflist", shape: "reporter",
    inputs: { INDEX: { kind: "number", shadowType: 7 } }, fields: { LIST: { kind: "list" } } },
];
