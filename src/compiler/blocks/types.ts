export type BlockShape = "hat" | "stack" | "cap" | "c" | "reporter" | "boolean";

/** Scratch input shadow opcode: 4 number, 6 positive integer, 7 integer, 8 angle, 9 color, 10 text. */
export type ShadowType = 4 | 6 | 7 | 8 | 9 | 10;

export type InputSpec =
  | { kind: "number" | "text"; shadowType: ShadowType }                       // accepts a literal OR a nested reporter/variable
  | { kind: "boolean" }                                                        // < > slot; no shadow
  | { kind: "menu"; menuOpcode: string; field: string; default: string; shadowType?: ShadowType; broadcast?: boolean }
  | { kind: "substack" };

export type FieldSpec =
  | { kind: "variable" }                                                      // resolves to [name, id]
  | { kind: "broadcast" }                                                     // resolves to [name, broadcastId]
  | { kind: "list" }                                                          // resolves to [name, listId]
  | { kind: "dropdown"; options?: string[] };                                 // option string stored on the block; options[] = disambiguation + fail-loud validation

export interface BlockDef {
  signature: string;                       // "move (STEPS) steps", "() + ()", "if <CONDITION> then"
  opcode: string;
  shape: BlockShape;
  inputs?: Record<string, InputSpec>;
  fields?: Record<string, FieldSpec>;
  substacks?: string[];                    // [] | ["SUBSTACK"] | ["SUBSTACK","SUBSTACK2"]
  synthetic?: boolean;                     // constructed dynamically (control_if_else); excluded from source-line matching
}
