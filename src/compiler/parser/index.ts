// src/compiler/parser/index.ts
import { tokenizeLine, type Tok } from "./lexer.js";
import { SLICE } from "../blocks/registry.js";
import type { BlockDef } from "../blocks/types.js";
import type { Diagnostic, InputValue, ParsedBlock, ParsedScript } from "../types.js";

// ---- signature tokenization ----
type SigTok =
  | { lit: string }
  | { hole: "round" | "square" | "boolean" | "menu"; name: string };

function sigTokens(sig: string): SigTok[] {
  const out: SigTok[] = [];
  // ( NAME )  [ NAME v ]  [ NAME ]  < NAME >  bare-word
  const re = /\(([A-Z0-9]*)\)|\[([A-Z0-9]+) v\]|\[([A-Z0-9]*)\]|<([A-Z0-9]*)>|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sig))) {
    if (m[1] !== undefined && sig[m.index] === "(") out.push({ hole: "round", name: m[1] });
    else if (m[2] !== undefined) out.push({ hole: "menu", name: m[2] });
    else if (m[3] !== undefined && sig[m.index] === "[") out.push({ hole: "square", name: m[3] });
    else if (m[4] !== undefined && sig[m.index] === "<") out.push({ hole: "boolean", name: m[4] });
    else out.push({ lit: m[5] });
  }
  return out;
}
const SIGS: { def: BlockDef; toks: SigTok[] }[] = SLICE.map((def) => ({ def, toks: sigTokens(def.signature) }));

// A parsed signature hole's captured value: a token sub-stream.
type Group = { kind: "round" | "boolean"; toks: Tok[] } | { kind: "menu"; v: string } | { kind: "text"; v: string } | { kind: "word"; v: string };

/** Split a flat token stream into top-level groups: round (..), boolean <..>, menu, text, words. */
function groups(toks: Tok[]): Group[] {
  const out: Group[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === "(" || t.t === "<") {
      const open = t.t, close = t.t === "(" ? ")" : ">";
      let depth = 1, j = i + 1; const inner: Tok[] = [];
      while (j < toks.length && depth > 0) {
        if (toks[j].t === open) depth++;
        else if (toks[j].t === close) { depth--; if (depth === 0) break; }
        inner.push(toks[j]); j++;
      }
      out.push({ kind: open === "(" ? "round" : "boolean", toks: inner });
      i = j + 1;
    } else if (t.t === "menu") { out.push({ kind: "menu", v: t.v }); i++; }
    else if (t.t === "text") { out.push({ kind: "text", v: t.v }); i++; }
    else { out.push({ kind: "word", v: (t as any).v }); i++; }
  }
  return out;
}

export interface ParseCtx { file: string; knownVars: Set<string>; diagnostics: Diagnostic[]; }

const isNumeric = (s: string) => s.trim() !== "" && !Number.isNaN(Number(s));

/** Parse the content of a round ( ) input slot into an InputValue. */
function parseRound(g: Group, line: number, ctx: ParseCtx): InputValue {
  if (g.kind === "round") {
    const gs = groups(g.toks);
    // a single bare word → literal number/var; otherwise a nested reporter
    if (gs.length === 1 && gs[0].kind === "word") {
      const w = (gs[0] as any).v as string;
      if (isNumeric(w)) return { kind: "literal", value: w };
      if (ctx.knownVars.has(w)) return { kind: "variable", name: w };
      // a bare unknown word in a round slot: treat as a (string) literal — lenient
      return { kind: "literal", value: w };
    }
    const blk = matchGroups(gs, line, ctx, "reporter");
    if (blk) return { kind: "block", block: blk };
    ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `cannot parse reporter "(${render(g.toks)})"` });
    return { kind: "literal", value: "" };
  }
  if (g.kind === "text") return { kind: "literal", value: g.v };
  if (g.kind === "menu") return { kind: "menu", value: g.v };
  // a bare numeric/word handed in without parens
  if (g.kind === "word") return isNumeric((g as any).v) ? { kind: "literal", value: (g as any).v } : { kind: "literal", value: (g as any).v };
  ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `expected a value` });
  return { kind: "literal", value: "" };
}

/** Parse a boolean < > slot into a block InputValue (or report a type error). */
function parseBoolean(g: Group, line: number, ctx: ParseCtx): InputValue | undefined {
  if (g.kind !== "boolean") {
    ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `expected a boolean < >` });
    return undefined;
  }
  const gs = groups(g.toks);
  if (gs.length === 0) return undefined; // empty boolean
  const blk = matchGroups(gs, line, ctx, "boolean");
  if (!blk) { ctx.diagnostics.push({ file: ctx.file, line, severity: "error", message: `cannot parse boolean "<${render(g.toks)}>"` }); return undefined; }
  return { kind: "block", block: blk };
}

/** Match a top-level group list against the dictionary, returning a ParsedBlock (reporters/booleans). */
function matchGroups(gs: Group[], line: number, ctx: ParseCtx, want: "reporter" | "boolean" | "any"): ParsedBlock | null {
  outer: for (const { def, toks } of SIGS) {
    if (want !== "any" && def.shape !== want) continue;
    if (toks.length !== gs.length) continue;
    const block: ParsedBlock = { opcode: def.opcode, inputs: {}, fields: {}, substacks: {} };
    for (let i = 0; i < toks.length; i++) {
      const st = toks[i], g = gs[i];
      if ("lit" in st) { if (g.kind !== "word" || (g as any).v !== st.lit) continue outer; continue; }
      if (st.hole === "round") { if (g.kind !== "round" && g.kind !== "word" && g.kind !== "text") continue outer; block.inputs[st.name] = parseRound(g, line, ctx); }
      else if (st.hole === "boolean") { if (g.kind !== "boolean") continue outer; const bv = parseBoolean(g, line, ctx); if (bv) block.inputs[st.name] = bv; }
      else if (st.hole === "menu") { if (g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "menu", value: g.v }; }
      else if (st.hole === "square") { if (g.kind !== "text" && g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "literal", value: g.v }; }  // a [VARIABLE] field accepts [x] or [x v]
    }
    return block;
  }
  return null;
}

function render(toks: Tok[]): string {
  return toks.map((t) => t.t === "word" ? (t as any).v : t.t === "text" ? `[${(t as any).v}]` : t.t === "menu" ? `[${(t as any).v} v]` : t.t).join(" ");
}

/** Match one statement line (hat/stack) against the dictionary. */
function matchStatement(line: string, lineNo: number, ctx: ParseCtx): { def: BlockDef; block: ParsedBlock } | null {
  const gs = groups(tokenizeLine(line));
  outer: for (const { def, toks } of SIGS) {
    if (def.shape === "reporter" || def.shape === "boolean") continue; // statements only
    if (toks.length !== gs.length) continue;
    const block: ParsedBlock = { opcode: def.opcode, inputs: {}, fields: {}, substacks: {} };
    for (let i = 0; i < toks.length; i++) {
      const st = toks[i], g = gs[i];
      if ("lit" in st) { if (g.kind !== "word" || (g as any).v !== st.lit) continue outer; continue; }
      if (st.hole === "round") { if (g.kind !== "round" && g.kind !== "word" && g.kind !== "text") continue outer; block.inputs[st.name] = parseRound(g, lineNo, ctx); }
      else if (st.hole === "boolean") { if (g.kind !== "boolean") continue outer; const bv = parseBoolean(g, lineNo, ctx); if (bv) block.inputs[st.name] = bv; }
      else if (st.hole === "menu") { if (g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "menu", value: g.v }; }
      else if (st.hole === "square") { if (g.kind !== "text" && g.kind !== "menu") continue outer; if (def.fields?.[st.name]) block.fields[st.name] = g.v; else block.inputs[st.name] = { kind: "literal", value: g.v }; }  // a [VARIABLE] field accepts [x] or [x v]
    }
    return { def, block };
  }
  return null;
}

export function parseScripts(source: string, file: string, knownVars: Set<string>): { scripts: ParsedScript[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ctx: ParseCtx = { file, knownVars, diagnostics };
  const lines = source.split("\n").map((raw, i) => ({ raw: raw.trim(), line: i + 1 })).filter((l) => l.raw.length > 0);
  let pos = 0;

  // Collect statements until `end` (consumed) or EOF/new-hat (not consumed).
  // Single-substack c-blocks (repeat/forever/if/repeat until) recurse here via `end`.
  // Task 6 extends this to handle `else` (two substacks) + the unterminated-c-block diagnostic.
  function parseStack(): ParsedBlock[] {
    const out: ParsedBlock[] = [];
    while (pos < lines.length) {
      const { raw, line } = lines[pos];
      if (raw === "end") { pos++; return out; }
      const m = matchStatement(raw, line, ctx);
      if (!m) { diagnostics.push({ file, line, severity: "error", message: `unknown block "${raw}"` }); pos++; continue; }
      if (m.def.shape === "hat") return out;                 // new hat: stop, do not consume
      pos++;
      if (m.def.shape === "c") {
        const sub = m.def.substacks?.[0] ?? "SUBSTACK";
        m.block.substacks[sub] = parseStack();
      }
      out.push(m.block);
    }
    return out;
  }

  const scripts: ParsedScript[] = [];
  while (pos < lines.length) {
    const { raw, line } = lines[pos];
    const m = matchStatement(raw, line, ctx);
    if (!m || m.def.shape !== "hat") { diagnostics.push({ file, line, severity: "error", message: `script must start with a hat block, got "${raw}"` }); pos++; continue; }
    pos++;
    scripts.push({ blocks: [m.block, ...parseStack()] });
  }
  return { scripts, diagnostics };
}
