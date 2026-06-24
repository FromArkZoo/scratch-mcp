// src/mcp/session.ts
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ScratchEditor } from "../editor/scratch-editor.js";

export class Session {
  private activeProjectDir: string | null = null;
  private editorPromise: Promise<ScratchEditor> | null = null;

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
    if (!this.editorPromise) {
      const headless = process.env.SCRATCH_MCP_HEADLESS === "1";
      this.editorPromise = ScratchEditor.launch({ headless }).catch((e) => {
        this.editorPromise = null;   // allow a retry after a failed launch
        throw e;
      });
    }
    return this.editorPromise;
  }

  hasEditor(): boolean { return this.editorPromise !== null; }

  async dispose(): Promise<void> {
    if (this.editorPromise) {
      const ed = await this.editorPromise.catch(() => null);
      this.editorPromise = null;
      if (ed) await ed.close().catch(() => {});
    }
  }
}
