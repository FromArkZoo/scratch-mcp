import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { serveDir, type StaticServer } from "./static-server.js";

/**
 * Resolve the self-hosted editor bundle (<repo>/editor/dist) from a module dir.
 * Anchored to the scratch-mcp package root (NOT a fixed count of `../`), so it is
 * correct whether this module runs from source (src/editor) or the compiled bin
 * (dist/src/editor — one level deeper). The old `../../editor/dist` literal was
 * right from source but off-by-one once tsc nested it under dist/, so the built
 * server served a 404 page and launch hung the full 60s waiting for window.vm.
 */
export function resolveEditorDist(moduleDir: string): string {
  let dir = moduleDir;
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string };
      if (pkg.name === "scratch-mcp") return join(dir, "editor", "dist");
    } catch { /* not here — keep walking up */ }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return resolve(moduleDir, "../../editor/dist"); // best-effort fallback (source layout)
}

const here = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIST = resolveEditorDist(here);

/**
 * Bound a promise that has no native timeout (notably page.evaluate, which Playwright
 * never times out) so a wedged in-page op — e.g. vm.loadProject on a corrupt/huge sb3 —
 * can't hang a tool indefinitely.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export type ScalarMap = Record<string, string | number | boolean>;
export type ListMap = Record<string, (string | number | boolean)[]>;
export interface SpriteState {
  name: string; x: number; y: number; direction: number;
  visible: boolean; size: number; costume: number;
  variables: ScalarMap;   // this sprite's locals
  lists: ListMap;         // this sprite's local lists
}
export interface ProjectState {
  variables: ScalarMap;   // Stage/global scalars
  lists: ListMap;         // Stage/global lists
  sprites: SpriteState[];
}
export interface LaunchOptions { headless?: boolean; port?: number; editorDist?: string; }

export class ScratchEditor {
  private constructor(
    private readonly server: StaticServer,
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async launch(opts: LaunchOptions = {}): Promise<ScratchEditor> {
    const dist = opts.editorDist ?? EDITOR_DIST;
    // Fail loud BEFORE launching chromium: a missing bundle otherwise serves a 404
    // page and the readiness gate below silently hangs the full 60s.
    if (!existsSync(join(dist, "index.html"))) {
      throw new Error(`editor bundle not found at ${dist} (no index.html). Build it with: (cd editor && npm run build).`);
    }
    const server = await serveDir(dist, opts.port);
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: opts.headless ?? true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(server.url, { waitUntil: "load" });
      await page.waitForFunction(
        () => Boolean((window as any).vm) && (window as any).__scratchReady === true,
        undefined,
        { timeout: 60_000 },
      );
      return new ScratchEditor(server, browser, page);
    } catch (e) {
      await browser?.close().catch(() => {});   // don't leak the browser if a post-launch step throws
      await server.close().catch(() => {});
      throw e;
    }
  }

  /** Test-only probe. */
  async hasLiveVm(): Promise<boolean> {
    return this.page.evaluate(() => Boolean((window as any).vm?.runtime));
  }

  async close(): Promise<void> {
    await this.browser.close().catch(() => {});
    await this.server.close().catch(() => {});
  }

  async readState(): Promise<ProjectState> {
    return this.page.evaluate(() => {
      const vm = (window as any).vm;
      const targets = vm.runtime.targets as any[];
      const scalarsOf = (t: any) => {
        const out: Record<string, any> = {};
        for (const id of Object.keys(t.variables ?? {})) {
          const v = t.variables[id];
          if (v && v.type === "") out[v.name] = v.value;        // scalar
        }
        return out;
      };
      const listsOf = (t: any) => {
        const out: Record<string, any> = {};
        for (const id of Object.keys(t.variables ?? {})) {
          const v = t.variables[id];
          if (v && v.type === "list") out[v.name] = v.value;    // list
        }
        return out;
      };
      let variables: Record<string, any> = {};
      let lists: Record<string, any> = {};
      const sprites: any[] = [];
      for (const t of targets) {
        if (!t || t.isOriginal === false) continue;             // skip clones
        if (t.isStage) {
          variables = scalarsOf(t);
          lists = listsOf(t);
        } else {
          sprites.push({
            name: t.sprite?.name ?? t.getName?.() ?? "",
            x: t.x, y: t.y, direction: t.direction,
            visible: t.visible, size: t.size, costume: t.currentCostume,
            variables: scalarsOf(t),
            lists: listsOf(t),
          });
        }
      }
      return { variables, lists, sprites };
    });
  }

  async loadProject(sb3: Buffer): Promise<void> {
    // Note: for very large .sb3 files (multi-MB with embedded assets) this base64 string
    // crosses the Playwright IPC boundary; a future optimization could read bytes in the
    // browser context directly to avoid the serialisation overhead.
    const b64 = sb3.toString("base64");
    await withTimeout(this.page.evaluate(async (data: string) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await (window as any).vm.loadProject(bytes.buffer);
    }, b64), 30_000, "loadProject");
  }

  async run(opts: { waitMs?: number } = {}): Promise<{ idle: boolean; running: boolean; threads: number }> {
    // Settle briefly by default: a forever-loop project (every game) never emits
    // PROJECT_RUN_STOP, so we report its liveness rather than blocking for the full
    // budget. Pass a larger waitMs to wait for a terminating project to finish.
    const waitMs = opts.waitMs ?? 2_000;
    // Arm a one-shot PROJECT_RUN_STOP listener, reset the flag, then green-flag.
    await this.page.evaluate(() => {
      const vm = (window as any).vm;
      (window as any).__scratchRunDone = false;
      vm.runtime.once("PROJECT_RUN_STOP", () => { (window as any).__scratchRunDone = true; });
      vm.greenFlag();
    });
    let idle = true;
    try {
      await this.page.waitForFunction(
        () => (window as any).__scratchRunDone === true,
        undefined,
        { timeout: waitMs },
      );
    } catch (e) {
      // Only a settle timeout means "didn't reach a natural stop"; surface real errors.
      if ((e as Error).name !== "TimeoutError") throw e;
      idle = false;
    }
    // Count live (non-monitor) threads to tell a running project from a quiesced one.
    // Prefer the VM's own non-monitor counter; the fallback filters monitor (watcher)
    // threads out itself so it can't falsely report a watcher-only project as running.
    const threads = await this.page.evaluate(() => {
      const rt = (window as any).vm.runtime;
      const c = rt._nonMonitorThreadCount;
      return typeof c === "number" ? c : (rt.threads ?? []).filter((t: any) => !t.updateMonitor).length;
    });
    // idle = reached PROJECT_RUN_STOP within the budget; running = still has live threads;
    // neither = green flag triggered nothing that persisted.
    return { idle, running: threads > 0 && !idle, threads };
  }

  async stop(): Promise<void> {
    await this.page.evaluate(() => (window as any).vm.stopAll());
  }

  async snapshot(): Promise<Buffer> {
    const dataUrl: string = await this.page.evaluate(() => {
      const vm = (window as any).vm;
      const canvas = vm.renderer?.canvas as HTMLCanvasElement;
      if (!canvas) throw new Error("renderer canvas unavailable");
      // force a render so the snapshot reflects current state
      vm.renderer?.draw?.();
      return canvas.toDataURL("image/png");
    });
    return Buffer.from(dataUrl.split(",")[1], "base64");
  }
}
