// src/mcp/session.ts
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ScratchEditor } from "../editor/scratch-editor.js";

/**
 * The editor runs headless by default: Claude observes the project via snapshot /
 * read_state (neither needs a window), headless boots ~3x faster, and it cannot stall
 * waiting for a macOS display the MCP child may not have. A human who wants to watch the
 * live editor sets SCRATCH_MCP_VISIBLE=1. SCRATCH_MCP_HEADLESS is kept as a back-compat
 * override (=1 forces headless, =0 forces visible).
 */
export function resolveHeadless(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SCRATCH_MCP_HEADLESS === "1") return true;
  if (env.SCRATCH_MCP_HEADLESS === "0" || env.SCRATCH_MCP_VISIBLE === "1") return false;
  return true;
}

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
      const headless = resolveHeadless();
      this.editorPromise = ScratchEditor.launch({ headless }).catch((e) => {
        this.editorPromise = null;   // allow a retry after a failed launch
        throw e;
      });
    }
    return this.editorPromise;
  }

  /**
   * Start the editor launch in the background without awaiting it, so its ~1s cold
   * start overlaps the user's authoring instead of sitting on the first reload's
   * critical path. Safe to call repeatedly (getEditor memoizes); failures are
   * swallowed here and reset internally so the first real getEditor retries.
   */
  warmEditor(): void {
    void this.getEditor().catch(() => {});
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
