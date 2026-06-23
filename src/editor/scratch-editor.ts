import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveDir, type StaticServer } from "./static-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIST = resolve(here, "../../editor/dist");

export interface SpriteState {
  name: string; x: number; y: number; direction: number;
  visible: boolean; size: number; costume: number;
}
export interface ProjectState {
  variables: Record<string, string | number | boolean>;
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

  // loadProject/run/stop/snapshot/readState implemented in Tasks 4–5.
  async loadProject(_sb3: Buffer): Promise<void> { throw new Error("not implemented"); }
  async run(): Promise<void> { throw new Error("not implemented"); }
  async stop(): Promise<void> { throw new Error("not implemented"); }
  async snapshot(): Promise<Buffer> { throw new Error("not implemented"); }
  async readState(): Promise<ProjectState> { throw new Error("not implemented"); }
}
