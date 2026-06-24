// tests/mcp/tools-build.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Session } from "../../src/mcp/session.js";
import {
  handleNewProject, handleOpenProject, handleListProjects, handleCompile,
} from "../../src/mcp/tools-build.js";

const txt = (r: any) => r.content[0].text as string;

test("new_project creates a compiling project", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-new-"));
  const r = await handleNewProject(new Session(), { name: "Demo", path: join(base, "demo") });
  expect(r.isError).toBeFalsy();
  expect(txt(r)).toMatch(/Created project/);
}, 120_000);

test("compile without an active project errors", async () => {
  const r = await handleCompile(new Session(), {});
  expect(r.isError).toBe(true);
  expect(txt(r)).toMatch(/no active project/);
});

test("compile surfaces fail-loud diagnostics as isError", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-bad-"));
  const dir = join(base, "bad");
  const s = new Session();
  await handleNewProject(s, { name: "Bad", path: dir });
  await writeFile(join(dir, "cat.sprite.scratch"), "when green flag clicked\nfly (3) times\n");
  await handleOpenProject(s, { path: dir });
  const r = await handleCompile(s, {});
  expect(r.isError).toBe(true);
  expect(txt(r)).toMatch(/fly/);
}, 120_000);

test("open + compile a good project succeeds", async () => {
  const base = await mkdtemp(join(tmpdir(), "tb-ok-"));
  const dir = join(base, "ok");
  const s = new Session();
  await handleNewProject(s, { name: "Ok", path: dir });
  await handleOpenProject(s, { path: dir });
  const r = await handleCompile(s, {});
  expect(r.isError).toBeFalsy();
  expect(txt(r)).toMatch(/Compiled OK/);
}, 120_000);

test("list_projects reports created projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tb-list-"));
  const s = new Session();
  await handleNewProject(s, { name: "One", path: join(root, "one") });
  const r = await handleListProjects(s, { dir: root });
  expect(txt(r)).toMatch(/One/);
}, 120_000);
