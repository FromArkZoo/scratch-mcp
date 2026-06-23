// tests/compiler/grammar-e2e.test.ts
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

const dir = fileURLToPath(new URL("../fixtures/grammar-src", import.meta.url));

test("compiles the grammar fixture and runs it: r=7, b=9, c=5, m=5, k=1", async () => {
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("r"))).toBe(7);
  expect(Number(state.variable("b"))).toBe(9);
  expect(Number(state.variable("c"))).toBe(5);
  expect(Number(state.variable("m"))).toBe(5);
  expect(Number(state.variable("k"))).toBe(1);
});
