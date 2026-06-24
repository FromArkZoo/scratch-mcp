import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { SLICE, byOpcode } from "../../src/compiler/blocks/registry.js";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

test("the registry holds all 135 default-palette BlockDefs (137 palette − 2 parser-implicit reporters)", () => {
  expect(byOpcode.size).toBe(135);
  expect(new Set(SLICE.map((d) => d.opcode)).size).toBe(135);
});

test("each category contributes its expected opcode count", () => {
  const n = (prefix: string) => SLICE.filter((d) => d.opcode.startsWith(prefix)).length;
  expect(n("motion_")).toBe(18);
  expect(n("looks_")).toBe(21);
  expect(n("sound_")).toBe(9);
  expect(n("event_")).toBe(9);
  expect(n("control_")).toBe(11);
  expect(n("sensing_")).toBe(18);
  expect(n("operator_")).toBe(18);
  expect(n("pen_")).toBe(9);
  expect(n("music_")).toBe(7);
  expect(n("data_")).toBe(15); // variables (4) + lists (11); the 2 data reporters are parser-implicit
});

test("the all-category palette fixture compiles and loads+runs in the VM", async () => {
  const dir = fileURLToPath(new URL("../fixtures/palette-src", import.meta.url));
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  await runHeadless(res.sb3!); // loads + steps without throwing
});
