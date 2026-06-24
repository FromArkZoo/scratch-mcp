// src/mcp/compile.ts
import { compileProject } from "../compiler/index.js";
import { formatDiagnostics } from "./diagnostics.js";

export async function runCompile(dir: string): Promise<{ ok: boolean; sb3?: Buffer; text: string }> {
  const res = await compileProject(dir);
  const { text } = formatDiagnostics(res.diagnostics);
  if (!res.ok || !res.sb3) return { ok: false, text: text || "compile failed" };
  return { ok: true, sb3: res.sb3, text };
}
