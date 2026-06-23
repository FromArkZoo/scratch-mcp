import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// scratch-gui (and its deps) are an older CommonJS/webpack ecosystem package.
// They assume `process.env.NODE_ENV`, a Node `global`, and ship `.cjs`/UMD bundles.
// These defines / aliases make the prebuilt scratch-gui bundle consumable by Vite
// without re-bundling scratch-gui's source (which is the historically painful path).
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.DEBUG": JSON.stringify(false),
    global: "globalThis",
  },
  resolve: {
    alias: {
      // Some scratch deps reach for Node's process; provide a browser shim.
      "process/browser": "process/browser.js",
    },
  },
  optimizeDeps: {
    // scratch-gui pulls a large, mostly-CJS dependency graph. Let esbuild
    // pre-bundle it so dev/preview start reliably.
    include: ["scratch-gui", "scratch-vm", "react", "react-dom"],
    esbuildOptions: {
      // Allow JSX in .js files some scratch deps use, and define NODE_ENV.
      define: { "process.env.NODE_ENV": '"production"' },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 30000,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
