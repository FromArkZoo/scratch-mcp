// Copy scratch-gui's runtime assets into the build output.
//
// scratch-gui's prebuilt bundle fetches several things at runtime, relative to
// the page root: the default-project / blocks media under `static/`, async
// `chunks/`, sound & costume `libraries/`, the micro:bit `*.hex`, and the
// `extension-worker.js`. Vite inlines the JS bundle but does NOT know about
// these fetched-at-runtime files, so we copy them next to the built page.
//
// We deliberately skip `scratch-gui.js` (+ map): that's the source bundle Vite
// already consumed and re-bundled; shipping it again would just bloat dist/.

import { cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const editorRoot = join(here, "..");
const srcDist = join(editorRoot, "node_modules", "scratch-gui", "dist");
const outDist = join(editorRoot, "dist");

if (!existsSync(srcDist)) {
  console.error(`[copy-runtime-assets] scratch-gui dist not found at ${srcDist}`);
  process.exit(1);
}
if (!existsSync(outDist)) {
  console.error(`[copy-runtime-assets] build output not found at ${outDist} — run vite build first`);
  process.exit(1);
}

// Directories to copy wholesale.
const dirs = ["static", "chunks", "libraries"];
// Loose files matched by extension/name (the .hex is content-hashed).
const looseMatchers = [
  (n) => n === "extension-worker.js",
  (n) => n.endsWith(".hex"),
];

for (const d of dirs) {
  const from = join(srcDist, d);
  if (existsSync(from)) {
    await rm(join(outDist, d), { recursive: true, force: true });
    await cp(from, join(outDist, d), { recursive: true });
    console.log(`[copy-runtime-assets] copied ${d}/`);
  }
}

for (const name of await readdir(srcDist)) {
  if (looseMatchers.some((m) => m(name))) {
    await cp(join(srcDist, name), join(outDist, name));
    console.log(`[copy-runtime-assets] copied ${name}`);
  }
}

console.log("[copy-runtime-assets] done");
