import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 120_000, // editor launch/build steps are slow
    hookTimeout: 120_000,
    setupFiles: ["./tests/setup.ts"], // swallow the benign headless "No Audio Context" rejection
  },
});
