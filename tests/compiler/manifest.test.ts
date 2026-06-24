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

test("non-mapping manifest fails loud with empty targets", () => {
  const { project, diagnostics } = parseManifest("42", "project.yaml");
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  expect(project.targets).toEqual([]);
});

test("non-array sprites is a diagnostic, not a throw", () => {
  const { diagnostics } = parseManifest("name: G\nsprites: oops", "project.yaml");
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
});

test("parses a lists: block into TargetDecl.lists (global on Stage, per-sprite on the sprite)", () => {
  const yaml = [
    "name: L",
    "sprites:",
    "  - name: Cat",
    "    source: cat.sprite.scratch",
    "variables:",
    "  global: { score: 0 }",
    "lists:",
    "  global: { inventory: [] }",
    "  Cat: { hand: [a, b] }",
  ].join("\n");
  const { project, diagnostics } = parseManifest(yaml, "project.yaml");
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const stage = project.targets.find((t) => t.isStage)!;
  const cat = project.targets.find((t) => t.name === "Cat")!;
  expect(stage.lists).toEqual([{ name: "inventory", value: [] }]);
  expect(cat.lists).toEqual([{ name: "hand", value: ["a", "b"] }]);
});
