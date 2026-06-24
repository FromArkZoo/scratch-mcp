import type { BlockDef } from "./types.js";
import { assertUniqueSkeletons } from "./skeleton.js";
import { MOTION } from "./categories/motion.js";
import { LOOKS } from "./categories/looks.js";
import { SOUND } from "./categories/sound.js";
import { EVENTS } from "./categories/events.js";
import { CONTROL } from "./categories/control.js";
import { SENSING } from "./categories/sensing.js";
import { OPERATORS } from "./categories/operators.js";
import { VARIABLES } from "./categories/variables.js";
import { LISTS } from "./categories/lists.js";
import { PEN } from "./categories/pen.js";
import { MUSIC } from "./categories/music.js";

export const SLICE: BlockDef[] = [
  ...MOTION, ...LOOKS, ...SOUND, ...EVENTS, ...CONTROL, ...SENSING,
  ...OPERATORS, ...VARIABLES, ...LISTS, ...PEN, ...MUSIC,
];

// Order-independence guard: throws at import if any two non-synthetic signatures share a skeleton.
assertUniqueSkeletons(SLICE);

export const byOpcode = new Map<string, BlockDef>(SLICE.map((d) => [d.opcode, d]));
export const bySignature = new Map<string, BlockDef>(SLICE.map((d) => [d.signature, d]));
