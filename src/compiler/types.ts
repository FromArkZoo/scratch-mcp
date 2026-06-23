export interface Diagnostic {
  file: string;
  line: number;
  col?: number;
  message: string;
  severity: "error" | "warning";
}

export interface VariableDecl { name: string; value: string | number; }

export interface TargetDecl {
  name: string;
  isStage: boolean;
  sourceFile?: string;          // *.scratch path relative to project dir
  x?: number; y?: number; size?: number; direction?: number; visible?: boolean;
  variables: VariableDecl[];     // scoped to this target
}

export interface Project { name: string; targets: TargetDecl[]; } // targets[0] is the Stage

// ---- parsed script IR (produced by the parser, consumed by the packager) ----
export interface InputValue { kind: "literal"; value: string; } // skeleton: literal number/text only
export interface ParsedBlock {
  opcode: string;
  inputs: Record<string, InputValue>;       // e.g. STEPS -> { kind:"literal", value:"10" }
  fields: Record<string, string>;           // e.g. VARIABLE -> "angle"
  substacks: Record<string, ParsedBlock[]>; // e.g. SUBSTACK -> [...]
}
export interface ParsedScript { blocks: ParsedBlock[]; } // blocks[0] is the hat

export interface CompileResult { ok: boolean; sb3?: Buffer; diagnostics: Diagnostic[]; }
