// src/compiler/index.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseManifest } from "./manifest.js";
import { parseScripts } from "./parser.js";
import { packageProject } from "./packager.js";
import type { CompileResult, Diagnostic, ParsedScript } from "./types.js";

export type { CompileResult, Diagnostic } from "./types.js";

export async function compileProject(dir: string): Promise<CompileResult> {
  const diagnostics: Diagnostic[] = [];
  let manifestText: string;
  try { manifestText = await readFile(join(dir, "project.yaml"), "utf8"); }
  catch { return { ok: false, diagnostics: [{ file: "project.yaml", line: 0, severity: "error", message: "project.yaml not found" }] }; }

  const { project, diagnostics: md } = parseManifest(manifestText, "project.yaml");
  diagnostics.push(...md);

  const scriptsByTarget = new Map<string, ParsedScript[]>();
  for (const t of project.targets) {
    if (!t.sourceFile) continue;
    let src: string;
    try { src = await readFile(join(dir, t.sourceFile), "utf8"); }
    catch { diagnostics.push({ file: t.sourceFile, line: 0, severity: "error", message: `source file not found: ${t.sourceFile}` }); continue; }
    const { scripts, diagnostics: pd } = parseScripts(src, t.sourceFile);
    diagnostics.push(...pd);
    scriptsByTarget.set(t.name, scripts);
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) return { ok: false, diagnostics };

  const { sb3, diagnostics: gd } = await packageProject(project, scriptsByTarget);
  diagnostics.push(...gd);
  if (diagnostics.some((d) => d.severity === "error")) return { ok: false, diagnostics };
  return { ok: true, sb3, diagnostics };
}
