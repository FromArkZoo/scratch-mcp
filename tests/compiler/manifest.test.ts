import { expect, test } from "vitest";
import { parseManifest } from "../../src/compiler/manifest.js";

const yaml = `
name: My Game
stage:
  source: stage.scratch
sprites:
  - name: Cat
    source: cat.sprite.scratch
    x: 10
    y: -5
variables:
  global: { score: 0 }
  Cat: { speed: 10 }
`;

test("parses stage + sprites + scoped variables", () => {
  const { project, diagnostics } = parseManifest(yaml, "project.yaml");
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(project.name).toBe("My Game");
  expect(project.targets[0].isStage).toBe(true);
  expect(project.targets[0].variables).toEqual([{ name: "score", value: 0 }]);
  const cat = project.targets.find((t) => t.name === "Cat")!;
  expect(cat.x).toBe(10);
  expect(cat.sourceFile).toBe("cat.sprite.scratch");
  expect(cat.variables).toEqual([{ name: "speed", value: 10 }]);
});

test("malformed yaml is a fail-loud diagnostic, not a throw", () => {
  const { diagnostics } = parseManifest("name: [unterminated", "project.yaml");
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
});
