import type { BlockDef } from "./types.js";

// Mirror parser/index.ts sigTokens: detect holes, erase hole NAMES, keep hole SHAPES + literal words.
const HOLE_RE = /\(([A-Z0-9_]*)\)|\[([A-Z0-9_]+) v\]|\[([A-Z0-9_]*)\]|<([A-Z0-9_]*)>|(\S+)/g;

function skeleton(sig: string): string {
  const toks: string[] = [];
  HOLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HOLE_RE.exec(sig))) {
    if (m[1] !== undefined && sig[m.index] === "(") toks.push("(R)");
    else if (m[2] !== undefined) toks.push("[M]");
    else if (m[3] !== undefined && sig[m.index] === "[") toks.push("[S]");
    else if (m[4] !== undefined && sig[m.index] === "<") toks.push("<B>");
    else toks.push("w:" + m[5]);
  }
  return toks.join(" ");
}

// matchStatement pools all non-reporter/boolean shapes together; matchGroups separates reporter vs boolean.
const pool = (shape: BlockDef["shape"]): string =>
  shape === "reporter" ? "REPORTER" : shape === "boolean" ? "BOOLEAN" : "STATEMENT";

// Sorted option-sets of dropdown fields — two otherwise-identical skeletons with disjoint option sets are NOT duplicates.
function optionsKey(def: BlockDef): string {
  const sets: string[] = [];
  for (const f of Object.values(def.fields ?? {}))
    if (f.kind === "dropdown" && f.options) sets.push([...f.options].sort().join(","));
  return sets.sort().join("|");
}

export function skeletonKey(def: BlockDef): string {
  return `${pool(def.shape)}::${skeleton(def.signature)}::${optionsKey(def)}`;
}

/** Throw if any two non-synthetic defs share a skeleton key (would make one unreachable under the positional matcher). */
export function assertUniqueSkeletons(defs: BlockDef[]): void {
  const seen = new Map<string, string>();
  for (const def of defs) {
    if (def.synthetic) continue;
    const k = skeletonKey(def);
    const prev = seen.get(k);
    if (prev) throw new Error(`block-dictionary skeleton collision: "${def.signature}" (${def.opcode}) collides with ${prev} — key=${k}`);
    seen.set(k, `"${def.signature}" (${def.opcode})`);
  }
}
