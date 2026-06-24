export interface Diagnostic {
  file: string;
  line: number;
  col?: number;
  message: string;
  severity: "error" | "warning";
}

export interface VariableDecl { name: string; value: string | number; }
export interface ListDecl { name: string; value: (string | number)[]; }

export interface TargetDecl {
  name: string;
  isStage: boolean;
  sourceFile?: string;          // *.scratch path relative to project dir
  x?: number; y?: number; size?: number; direction?: number; visible?: boolean;
  variables: VariableDecl[];     // scoped to this target
  lists?: ListDecl[];            // scoped to this target (own ∪ global-Stage at resolution)
}

export interface Project { name: string; targets: TargetDecl[]; } // targets[0] is the Stage

// ---- parsed script IR (produced by the parser, consumed by the packager) ----
export type InputValue =
  | { kind: "literal"; value: string }       // (10) / [hello]
  | { kind: "variable"; name: string }       // (score) used as a reporter input
  | { kind: "block"; block: ParsedBlock }    // nested reporter ( ) or boolean < >
  | { kind: "menu"; value: string }          // [edge v] shadow-menu selection
  | { kind: "list"; name: string };          // (mylist) used as a reporter input → [13,name,id]

export interface ParsedBlock {
  opcode: string;
  inputs: Record<string, InputValue>;       // e.g. STEPS -> { kind:"literal", value:"10" }
  fields: Record<string, string>;           // e.g. VARIABLE -> "angle"
  substacks: Record<string, ParsedBlock[]>; // e.g. SUBSTACK -> [...]
}
export interface ParsedScript { blocks: ParsedBlock[]; } // blocks[0] is the hat

export interface CompileResult { ok: boolean; sb3?: Buffer; diagnostics: Diagnostic[]; }
