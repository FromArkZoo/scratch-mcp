import { SLICE } from "./slice.js";
import type { BlockDef } from "./types.js";

export { SLICE };
export const byOpcode = new Map<string, BlockDef>(SLICE.map((d) => [d.opcode, d]));
export const bySignature = new Map<string, BlockDef>(SLICE.map((d) => [d.signature, d]));
