import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveDir, type StaticServer } from "./static-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIST = resolve(here, "../../editor/dist");

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
export interface LaunchOptions { headless?: boolean; port?: number; }

export class ScratchEditor {
  private constructor(
    private readonly server: StaticServer,
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async launch(opts: LaunchOptions = {}): Promise<ScratchEditor> {
    const server = await serveDir(EDITOR_DIST, opts.port);
    try {
      const browser = await chromium.launch({ headless: opts.headless ?? false });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(server.url, { waitUntil: "load" });
      await page.waitForFunction(
        () => Boolean((window as any).vm) && (window as any).__scratchReady === true,
        { timeout: 60_000 },
      );
      return new ScratchEditor(server, browser, page);
    } catch (e) {
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
    await this.page.evaluate(async (data: string) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await (window as any).vm.loadProject(bytes.buffer);
    }, b64);
  }

  async run(opts: { waitMs?: number } = {}): Promise<{ idle: boolean }> {
    const waitMs = opts.waitMs ?? 10_000;
    // Arm a one-shot PROJECT_RUN_STOP listener, reset the flag, then green-flag.
    await this.page.evaluate(() => {
      const vm = (window as any).vm;
      (window as any).__scratchRunDone = false;
      vm.runtime.once("PROJECT_RUN_STOP", () => { (window as any).__scratchRunDone = true; });
      vm.greenFlag();
    });
    try {
      await this.page.waitForFunction(
        () => (window as any).__scratchRunDone === true,
        { timeout: waitMs },
      );
      return { idle: true };
    } catch {
      return { idle: false }; // timed out — e.g. a forever loop never goes idle
    }
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
