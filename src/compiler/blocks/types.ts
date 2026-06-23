export type BlockShape = "hat" | "stack" | "cap" | "c" | "reporter" | "boolean";

/** Scratch input shadow opcode: 4 number, 6 positive integer, 8 angle, 9 color, 10 text. */
export type ShadowType = 4 | 6 | 8 | 9 | 10;

export type InputSpec =
  | { kind: "number" | "text"; shadowType: ShadowType }                       // accepts a literal OR a nested reporter/variable
  | { kind: "boolean" }                                                        // < > slot; no shadow
  | { kind: "menu"; menuOpcode: string; field: string; default: string; shadowType?: ShadowType }
  | { kind: "substack" };

export type FieldSpec =
  | { kind: "variable" }                                                      // resolves to [name, id]
  | { kind: "dropdown" };                                                     // option string stored directly on the block

export interface BlockDef {
  signature: string;                       // "move (STEPS) steps", "() + ()", "if <CONDITION> then"
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substacks?: string[];                    // [] | ["SUBSTACK"] | ["SUBSTACK","SUBSTACK2"]
}
