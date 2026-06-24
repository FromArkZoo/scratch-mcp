// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Session } from "./session.js";
import {
  handleNewProject, handleOpenProject, handleListProjects, handleCompile,
} from "./tools-build.js";
import {
  handleReload, handleRun, handleStop, handleSnapshot, handleReadState, handleImportSb3,
} from "./tools-editor.js";
import type { ToolResult } from "./result.js";

// Resolve our own package version relative to THIS module (not process.cwd()), so the
// version read works whether run from source (src/mcp) or the built bin (dist/src/mcp)
// and regardless of the cwd a client spawns us with.
function readPackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name === "scratch-mcp") return pkg.version ?? "0.0.0";
    } catch { /* not here — keep walking up */ }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return "0.0.0";
}

export function createServer(): { server: McpServer; session: Session } {
  const session = new Session();
  const server = new McpServer({ name: "scratch-mcp", version: readPackageVersion() });

  const reg = (
    name: string,
    description: string,
    shape: Record<string, z.ZodType>,
    run: (a: any) => Promise<ToolResult>,
  ) => server.registerTool(name, { description, inputSchema: shape }, ((a: any) => run(a)) as any);

  reg("new_project", "Scaffold a new Scratch project folder that compiles clean.",
    { name: z.string(), path: z.string().optional() }, (a) => handleNewProject(session, a));
  reg("open_project", "Set the active project (validates project.yaml).",
    { path: z.string() }, (a) => handleOpenProject(session, a));
  reg("list_projects", "List projects under the projects root or a given dir.",
    { dir: z.string().optional() }, (a) => handleListProjects(session, a));
  reg("compile", "Compile project source to a .sb3 (no editor); returns diagnostics.",
    { path: z.string().optional() }, (a) => handleCompile(session, a));
  reg("reload", "Compile then load the project into the live editor (fail-loud).",
    { path: z.string().optional() }, (a) => handleReload(session, a));
  reg("run", "Green-flag the loaded project; await idle up to timeoutMs (default 10000).",
    { timeoutMs: z.number().optional() }, (a) => handleRun(session, a));
  reg("stop", "Stop all running scripts.", {}, () => handleStop(session));
  reg("snapshot", "Screenshot the stage as a PNG image.", {}, () => handleSnapshot(session));
  reg("read_state", "Read namespaced variables/lists/sprite state from the live editor.",
    {}, () => handleReadState(session));
  reg("import_sb3", "Load an existing .sb3 into the editor (runnable, not editable source).",
    { file: z.string() }, (a) => handleImportSb3(session, a));

  return { server, session };
}
