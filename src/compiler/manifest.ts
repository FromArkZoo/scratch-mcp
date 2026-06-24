import yaml from "js-yaml";
import type { Diagnostic, ListDecl, Project, TargetDecl, VariableDecl } from "./types.js";

function toVarDecls(obj: unknown): VariableDecl[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, string | number>).map(([name, value]) => ({ name, value }));
}

function toListDecls(obj: unknown): ListDecl[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? (value as (string | number)[]) : [],
  }));
}

export function parseManifest(yamlText: string, file: string): { project: Project; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let doc: any;
  try { doc = yaml.load(yamlText); }
  catch (e) {
    diagnostics.push({ file, line: 0, severity: "error", message: `invalid YAML: ${(e as Error).message}` });
    return { project: { name: "", targets: [] }, diagnostics };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    diagnostics.push({ file, line: 0, severity: "error", message: "manifest must be a YAML mapping" });
    return { project: { name: "", targets: [] }, diagnostics };
  }
  const vars = doc?.variables ?? {};
  const lists = doc?.lists ?? {};
  const stage: TargetDecl = {
    name: "Stage", isStage: true,
    sourceFile: doc?.stage?.source,
    variables: toVarDecls(vars.global),
    lists: toListDecls(lists.global),
  };
  if (doc.sprites != null && !Array.isArray(doc.sprites)) {
    diagnostics.push({ file, line: 0, severity: "error", message: "sprites must be a list" });
  }
  const spriteList = Array.isArray(doc.sprites) ? doc.sprites : [];
  const sprites: TargetDecl[] = spriteList.map((s: any) => ({
    name: s.name, isStage: false, sourceFile: s.source,
    x: s.x, y: s.y, size: s.size, direction: s.direction, visible: s.visible,
    variables: toVarDecls(vars[s.name]),
    lists: toListDecls(lists[s.name]),
  }));
  return { project: { name: doc?.name ?? "", targets: [stage, ...sprites] }, diagnostics };
}
