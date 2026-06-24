import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { expect, test } from "vitest";
import { compileProject } from "../../src/compiler/index.js";
import { runHeadless } from "./vm-harness.js";

const dir = fileURLToPath(new URL("../fixtures/infra-src", import.meta.url));

test("infra fixture compiles + runs: extensions=['pen'], broadcast sets x=1, list gives n='b'", async () => {
  const res = await compileProject(dir);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(res.ok).toBe(true);
  const zip = await JSZip.loadAsync(res.sb3!);
  const pj = JSON.parse(await zip.file("project.json")!.async("string"));
  expect(pj.extensions).toEqual(["pen"]);
  const state = await runHeadless(res.sb3!);
  expect(Number(state.variable("x"))).toBe(1);
  expect(String(state.variable("n"))).toBe("b");
});
