// src/mcp/tools-editor.ts
import { readFile } from "node:fs/promises";
import { Session } from "./session.js";
import { runCompile } from "./compile.js";
import { textResult, errorResult, imageResult, type ToolResult } from "./result.js";

export async function handleReload(session: Session, args: { path?: string }): Promise<ToolResult> {
  try {
    const dir = session.resolveProjectDir(args.path);
    const compiled = await runCompile(dir);
    if (!compiled.ok || !compiled.sb3) return errorResult(compiled.text); // fail-loud: load nothing
    await (await session.getEditor()).loadProject(compiled.sb3);
    return textResult(compiled.text ? `Loaded into editor.\n${compiled.text}` : "Loaded into editor.");
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleRun(session: Session, args: { timeoutMs?: number }): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded — call reload or import_sb3 first");
    const { idle } = await (await session.getEditor()).run({ waitMs: args.timeoutMs ?? 10_000 });
    return textResult(idle
      ? "Ran to completion (idle)."
      : "Still running after timeout (e.g. a forever loop).");
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleStop(session: Session): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded");
    await (await session.getEditor()).stop();
    return textResult("Stopped.");
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleSnapshot(session: Session): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded — call reload or import_sb3 first");
    const png = await (await session.getEditor()).snapshot();
    if (png.length < 100) return errorResult("snapshot produced an empty image");
    return imageResult(png, `Stage snapshot (${png.length} bytes)`);
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleReadState(session: Session): Promise<ToolResult> {
  try {
    if (!session.hasEditor()) return errorResult("no project loaded — call reload or import_sb3 first");
    const state = await (await session.getEditor()).readState();
    return textResult(JSON.stringify(state, null, 2));
  } catch (e) { return errorResult((e as Error).message); }
}

export async function handleImportSb3(session: Session, args: { file: string }): Promise<ToolResult> {
  try {
    const bytes = await readFile(args.file);
    if (bytes.subarray(0, 2).toString("ascii") !== "PK") return errorResult(`not a .sb3 (zip) file: ${args.file}`);
    await (await session.getEditor()).loadProject(bytes);
    return textResult(`Imported ${args.file} into the editor (runnable, not editable source).`);
  } catch (e) { return errorResult((e as Error).message); }
}
