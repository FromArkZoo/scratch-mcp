// src/mcp/tools-build.ts
import { Session } from "./session.js";
import { runCompile } from "./compile.js";
import { scaffoldProject, listProjects } from "./scaffold.js";
import { textResult, errorResult, type ToolResult } from "./result.js";

export async function handleNewProject(
  _session: Session, args: { name: string; path?: string },
): Promise<ToolResult> {
  try {
    const { dir } = await scaffoldProject(args.name, args.path);
    const compiled = await runCompile(dir);
    if (!compiled.ok) return errorResult(`scaffold did not compile:\n${compiled.text}`);
    return textResult(`Created project at ${dir}\n  project.yaml\n  cat.sprite.scratch`);
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleOpenProject(
  session: Session, args: { path: string },
): Promise<ToolResult> {
  try {
    const dir = await session.openProject(args.path);
    session.warmEditor(); // eager, non-blocking: overlap the editor cold-start with authoring
    return textResult(`Active project set to ${dir}`);
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleListProjects(
  _session: Session, args: { dir?: string },
): Promise<ToolResult> {
  try {
    const list = await listProjects(args.dir);
    if (!list.length) return textResult("No projects found.");
    return textResult(list.map((p) => `${p.name}  —  ${p.path}`).join("\n"));
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleCompile(
  session: Session, args: { path?: string },
): Promise<ToolResult> {
  try {
    const dir = session.resolveProjectDir(args.path);
    const compiled = await runCompile(dir);
    if (!compiled.ok) return errorResult(compiled.text);
    return textResult(compiled.text ? `Compiled OK.\n${compiled.text}` : "Compiled OK.");
  } catch (e) { return errorResult((e as Error).message); }
}
