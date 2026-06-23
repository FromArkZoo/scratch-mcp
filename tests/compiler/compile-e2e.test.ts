// tests/compiler/compile-e2e.test.ts
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

const dir = fileURLToPath(new URL("../fixtures/spin-src", import.meta.url));

test("compiles a source folder to an .sb3 that runs: angle → 360", async () => {
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  expect(res.sb3).toBeInstanceOf(Buffer);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("angle"))).toBe(360);
});

test("a source folder with an unknown block fails loud with no .sb3", async () => {
  const badDir = fileURLToPath(new URL("../fixtures/bad-src", import.meta.url));
  const res = await compileProject(badDir);
  expect(res.ok).toBe(false);
  expect(res.sb3).toBeUndefined();
  const errorDiags = res.diagnostics.filter((d) => d.severity === "error");
  expect(errorDiags.length).toBeGreaterThan(0);
  expect(errorDiags.some((d) => /fly/.test(d.message))).toBe(true);
});
