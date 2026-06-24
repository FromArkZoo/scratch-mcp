// tests/mcp/scaffold.test.ts
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { scaffoldProject, listProjects } from "../../src/mcp/scaffold.js";
import { compileProject } from "../../src/compiler/index.js";

test("scaffolds a project that compiles clean", async () => {
  const base = await mkdtemp(join(tmpdir(), "scaffold-"));
  const { dir } = await scaffoldProject("My Game", join(base, "game"));
  const files = (await readdir(dir)).sort();
  expect(files).toEqual(["cat.sprite.scratch", "project.yaml"]);
  const res = await compileProject(dir);
  expect(res.ok).toBe(true);
  expect(res.sb3).toBeInstanceOf(Buffer);
}, 120_000);

test("refuses to scaffold into a non-empty dir", async () => {
  const base = await mkdtemp(join(tmpdir(), "scaffold-ne-"));
  await scaffoldProject("A", join(base, "p"));
  await expect(scaffoldProject("A", join(base, "p"))).rejects.toThrow(/non-empty/);
});

test("listProjects finds scaffolded projects by name", async () => {
  const root = await mkdtemp(join(tmpdir(), "scaffold-root-"));
  await scaffoldProject("Alpha", join(root, "alpha"));
  await scaffoldProject("Beta", join(root, "beta"));
  const names = (await listProjects(root)).map((p) => p.name).sort();
  expect(names).toEqual(["Alpha", "Beta"]);
});

test("scaffolds a name with YAML-special characters and lists it", async () => {
  const base = await mkdtemp(join(tmpdir(), "scaffold-yaml-"));
  const { dir } = await scaffoldProject("Bouncing Cat: Level 2", join(base, "p"));
  const res = await compileProject(dir);
  expect(res.ok).toBe(true);
  const names = (await listProjects(base)).map((p) => p.name);
  expect(names).toContain("Bouncing Cat: Level 2");
}, 120_000);
