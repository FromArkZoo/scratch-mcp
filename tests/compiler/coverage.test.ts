import { expect, test } from "vitest";
import { SLICE } from "../../src/compiler/blocks/registry.js";
import { parseScripts } from "../../src/compiler/parser/index.js";
import type { BlockDef } from "../../src/compiler/blocks/types.js";
import type { InputValue, ParsedBlock } from "../../src/compiler/types.js";

// Render a registry signature into a minimal, parseable source string by filling each hole:
//   (NAME) -> (1)   [NAME v] -> [<valid option> v]   [NAME] -> [x]   <NAME> -> <(1) = (1)>
function renderSig(def: BlockDef): string {
  return def.signature
    .replace(/\(([A-Z0-9_]*)\)/g, "(1)")
    .replace(/\[([A-Z0-9_]+) v\]/g, (_m, name: string) => {
      const f = def.fields?.[name];
      const opt = f?.kind === "dropdown" && f.options ? f.options[0] : "x";
      return `[${opt} v]`;
    })
    .replace(/\[([A-Z0-9_]*)\]/g, "[x]")
    .replace(/<([A-Z0-9_]*)>/g, "<(1) = (1)>");
}

// Parse the rendered signature in the right context and return the opcode the matcher actually produced.
function roundTripOpcode(def: BlockDef): string | undefined {
  const sig = renderSig(def);
  const vars = new Set(["v"]);
  const none = new Set<string>();
  if (def.shape === "reporter") {
    const r = parseScripts(`when green flag clicked\nset [v v] to (${sig})`, "f", vars, none);
    const val = r.scripts[0]?.blocks[1]?.inputs.VALUE as InputValue | undefined;
    return val?.kind === "block" ? val.block.opcode : `<${val?.kind}>`;
  }
  if (def.shape === "boolean") {
    const r = parseScripts(`when green flag clicked\nif <${sig}> then\nset [v v] to (1)\nend`, "f", vars, none);
    const cond = r.scripts[0]?.blocks[1]?.inputs.CONDITION as InputValue | undefined;
    return cond?.kind === "block" ? cond.block.opcode : `<${cond?.kind}>`;
  }
  if (def.shape === "hat") {
    const r = parseScripts(sig, "f", none, none);
    return r.scripts[0]?.blocks[0]?.opcode;
  }
  // stack / cap / c
  const src = def.shape === "c" ? `when green flag clicked\n${sig}\nend` : `when green flag clicked\n${sig}`;
  const r = parseScripts(src, "f", none, none);
  return (r.scripts[0]?.blocks[1] as ParsedBlock | undefined)?.opcode;
}

test("every non-synthetic registry signature round-trips to its OWN opcode (no shadowing, full reachability)", () => {
  const failures: string[] = [];
  for (const def of SLICE) {
    if (def.synthetic) continue;
    const got = roundTripOpcode(def);
    if (got !== def.opcode) failures.push(`${def.opcode}  "${def.signature}"  ->  ${got}`);
  }
  expect(failures).toEqual([]);
});

test("the coverage check actually exercises all 135 reachable opcodes", () => {
  expect(SLICE.filter((d) => !d.synthetic).length).toBe(134); // 135 BlockDefs − control_if_else (synthetic)
});
