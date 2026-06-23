export type BlockShape = "hat" | "stack" | "cap" | "c" | "reporter" | "boolean";

/** shadowType: Scratch input shadow opcode — 4 math_number, 6 math_whole_number, 10 text. */
export interface InputSpec { kind: "number" | "text" | "substack"; shadowType?: 4 | 6 | 10; }
export interface FieldSpec { kind: "variable"; }

export interface BlockDef {
  signature: string;                       // e.g. "move (STEPS) steps", "repeat (TIMES)"
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substack?: string;                       // c-blocks: the substack input name (e.g. "SUBSTACK")
}
