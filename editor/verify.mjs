// Objective verification gate for Task 2.
//
// Launches headless Chromium, loads the served editor, and proves the bridge
// contract: `window.vm` is a live scratch-vm instance (has a runtime) AND
// `window.__scratchReady === true`. Prints exactly `true` on success.
//
// Usage:  node verify.mjs [url]   (default http://localhost:5174/)
// Requires the editor to already be served (e.g. `npm run preview`).

import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5174/";

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "domcontentloaded" });

// Wait for the editor to mount and the bridge to be wired.
await page
  .waitForFunction(
    () => Boolean(window.vm && window.vm.runtime) && window.__scratchReady === true,
    { timeout: 60000 }
  )
  .catch((e) => { console.error("waitForFunction did not resolve:", e.message); });

const result = await page.evaluate(
  () => Boolean(window.vm?.runtime) && window.__scratchReady === true
);

// Print exactly the gate value the task requires.
console.log(result);

if (!result && errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
}

await browser.close();
process.exit(result ? 0 : 1);
