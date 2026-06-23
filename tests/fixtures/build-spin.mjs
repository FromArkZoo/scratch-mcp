// tests/fixtures/build-spin.mjs — builds spin.sb3 from spin.project.json via the live VM
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveDir } from "../../dist/src/editor/static-server.js";

const dist = fileURLToPath(new URL("../../editor/dist", import.meta.url));
const proj = JSON.parse(await readFile(new URL("./spin.project.json", import.meta.url), "utf8"));

const server = await serveDir(dist);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(server.url, { waitUntil: "load" });
await page.waitForFunction(() => window.vm && window.__scratchReady === true, { timeout: 60000 });

// Load the project definition, then serialize to .sb3. DO NOT greenFlag before saving
// (running would mutate `angle` to 360 and the saved initial value must stay 0).
const bytes = await page.evaluate(async (p) => {
  const vm = window.vm;
  await vm.loadProject(p);
  const blob = await vm.saveProjectSb3();      // Blob in the browser
  const buf = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}, proj);

await writeFile(new URL("./spin.sb3", import.meta.url), Buffer.from(bytes));
console.log("wrote spin.sb3", bytes.length, "bytes");
await browser.close();
await server.close();
