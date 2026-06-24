// src/mcp/session.ts
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ScratchEditor } from "../editor/scratch-editor.js";

export class Session {
  private activeProjectDir: string | null = null;
  private editor: ScratchEditor | null = null;

  async openProject(path: string): Promise<string> {
    const dir = resolve(path);
    try { await access(join(dir, "project.yaml")); }
    catch { throw new Error(`no project.yaml in ${dir}`); }
    this.activeProjectDir = dir;
    return dir;
  }

  resolveProjectDir(path?: string): string {
    if (path) return resolve(path);
    if (this.activeProjectDir) return this.activeProjectDir;
    throw new Error("no active project — call open_project or pass a path");
  }

  async getEditor(): Promise<ScratchEditor> {
    if (!this.editor) {
      const headless = process.env.SCRATCH_MCP_HEADLESS === "1";
      this.editor = await ScratchEditor.launch({ headless });
    }
    return this.editor;
  }

  hasEditor(): boolean { return this.editor !== null; }

  async dispose(): Promise<void> {
    if (this.editor) { await this.editor.close().catch(() => {}); this.editor = null; }
  }
}
