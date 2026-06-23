import { bySignature, SLICE } from "./blocks/registry.js";
import type { BlockDef } from "./blocks/types.js";
import type { Diagnostic, ParsedBlock, ParsedScript } from "./types.js";

type Token = { lit: string } | { hole: "round" | "square" | "curly"; name: string };

function sigTokens(sig: string): Token[] {
  const out: Token[] = [];
  const re = /\(([A-Z]+)\)|\[([A-Z]+)\]|\{([A-Z]+)\}|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sig))) {
    if (m[1]) out.push({ hole: "round", name: m[1] });
    else if (m[2]) out.push({ hole: "square", name: m[2] });
    else if (m[3]) out.push({ hole: "curly", name: m[3] });
    else out.push({ lit: m[4] });
  }
  return out;
}

// pre-tokenize all signatures once
const SIGS: { def: BlockDef; toks: Token[] }[] = SLICE.map((def) => ({ def, toks: sigTokens(def.signature) }));

/** Split a source line into bracket-aware tokens: words, (..), [..]. */
function lineTokens(line: string): { lit: string }[] | { val: string; kind: "round" | "square" }[] | any[] {
  const out: any[] = [];
  const re = /\(([^)]*)\)|\[([^\]]*)\]|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined && m[3] === undefined && line[m.index] === "(") out.push({ val: m[1].trim(), kind: "round" });
    else if (m[2] !== undefined && line[m.index] === "[") out.push({ val: m[2].trim(), kind: "square" });
    else out.push({ lit: m[3] });
  }
  return out;
}

function matchLine(line: string): { def: BlockDef; inputs: Record<string, { kind: "literal"; value: string }>; fields: Record<string, string> } | null {
  const lt = lineTokens(line);
  outer: for (const { def, toks } of SIGS) {
    if (toks.length !== lt.length) continue;
    const inputs: Record<string, { kind: "literal"; value: string }> = {};
    const fields: Record<string, string> = {};
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as any; const v = lt[i] as any;
      if ("lit" in t) { if (!("lit" in v) || v.lit !== t.lit) continue outer; }
      else if (t.hole === "round") { if (v.kind !== "round") continue outer; inputs[t.name] = { kind: "literal", value: v.val }; }
      else if (t.hole === "square") {
        if (v.kind !== "square") continue outer;
        if (def.fields?.[t.name]) fields[t.name] = v.val; else inputs[t.name] = { kind: "literal", value: v.val };
      } else continue outer; // curly holes don't appear in source lines
    }
    return { def, inputs, fields };
  }
  return null;
}

export function parseScripts(source: string, file: string): { scripts: ParsedScript[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split("\n").map((l, i) => ({ raw: l, line: i + 1 }))
    .filter((l) => l.raw.trim().length > 0);

  let pos = 0;
  // parse a run of blocks at >= baseIndent until 'end' (for c-blocks) or EOF
  function parseStack(stopOnEnd: boolean): ParsedBlock[] {
    const out: ParsedBlock[] = [];
    while (pos < lines.length) {
      const { raw, line } = lines[pos];
      const text = raw.trim();
      if (text === "end") { if (stopOnEnd) { pos++; return out; } diagnostics.push({ file, line, severity: "error", message: `unexpected "end"` }); pos++; continue; }
      const matched = matchLine(text);
      if (!matched) { diagnostics.push({ file, line, severity: "error", message: `unknown block "${text}"` }); pos++; continue; }
      pos++;
      const block: ParsedBlock = { opcode: matched.def.opcode, inputs: matched.inputs, fields: matched.fields, substacks: {} };
      if (matched.def.shape === "c" && matched.def.substack) {
        block.substacks[matched.def.substack] = parseStack(true);
      }
      out.push(block);
    }
    return out;
  }

  const scripts: ParsedScript[] = [];
  while (pos < lines.length) {
    const start = pos;
    const text = lines[pos].raw.trim();
    const head = matchLine(text);
    if (!head || head.def.shape !== "hat") {
      diagnostics.push({ file, line: lines[pos].line, severity: "error", message: `script must start with a hat block, got "${text}"` });
      pos++; continue;
    }
    pos++;
    const hat: ParsedBlock = { opcode: head.def.opcode, inputs: head.inputs, fields: head.fields, substacks: {} };
    const body = parseStack(false);
    scripts.push({ blocks: [hat, ...body] });
    if (pos === start) pos++; // safety: never stall
  }
  return { scripts, diagnostics };
}
