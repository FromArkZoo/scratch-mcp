// tests/mcp/session.test.ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { Session, resolveHeadless } from "../../src/mcp/session.js";
import { ScratchEditor } from "../../src/editor/scratch-editor.js";

test("resolveHeadless defaults to headless; visible only on explicit opt-in", () => {
  expect(resolveHeadless({})).toBe(true);                              // default = headless (fast, no display needed)
  expect(resolveHeadless({ SCRATCH_MCP_VISIBLE: "1" })).toBe(false);   // human wants to watch
  expect(resolveHeadless({ SCRATCH_MCP_HEADLESS: "0" })).toBe(false);  // back-compat escape to headful
  expect(resolveHeadless({ SCRATCH_MCP_HEADLESS: "1" })).toBe(true);
});

test("warmEditor kicks off the launch so hasEditor() is true immediately", async () => {
  const fake = { close: vi.fn().mockResolvedValue(undefined) } as unknown as ScratchEditor;
  const spy = vi.spyOn(ScratchEditor, "launch").mockResolvedValue(fake);
  const s = new Session();
  expect(s.hasEditor()).toBe(false);
  s.warmEditor();
  expect(s.hasEditor()).toBe(true);
  await s.dispose();
  spy.mockRestore();
});

test("resolveProjectDir prefers explicit path, then active, else throws", async () => {
  const s = new Session();
  expect(() => s.resolveProjectDir()).toThrow(/no active project/);
  expect(s.resolveProjectDir("/tmp/x")).toBe(resolve("/tmp/x"));
  const dir = await mkdtemp(join(tmpdir(), "sess-"));
  await writeFile(join(dir, "project.yaml"), "name: X\n");
  await s.openProject(dir);
  expect(s.resolveProjectDir()).toBe(resolve(dir));
  expect(s.resolveProjectDir("/tmp/y")).toBe(resolve("/tmp/y"));   // explicit overrides active
});

test("openProject rejects a dir without project.yaml", async () => {
  const s = new Session();
  const dir = await mkdtemp(join(tmpdir(), "sess-empty-"));
  await expect(s.openProject(dir)).rejects.toThrow(/project\.yaml/);
});

test("getEditor launches once and is reused; dispose closes it", async () => {
  const fake = { close: vi.fn().mockResolvedValue(undefined) } as unknown as ScratchEditor;
  const spy = vi.spyOn(ScratchEditor, "launch").mockResolvedValue(fake);
  const s = new Session();
  expect(s.hasEditor()).toBe(false);
  const e1 = await s.getEditor();
  const e2 = await s.getEditor();
  expect(e1).toBe(e2);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(s.hasEditor()).toBe(true);
  await s.dispose();
  expect(fake.close).toHaveBeenCalled();
  expect(s.hasEditor()).toBe(false);
  spy.mockRestore();
});

test("concurrent getEditor calls launch the editor only once", async () => {
  const fake = { close: vi.fn().mockResolvedValue(undefined) } as unknown as ScratchEditor;
  const spy = vi.spyOn(ScratchEditor, "launch").mockResolvedValue(fake);
  const s = new Session();
  const [a, b] = await Promise.all([s.getEditor(), s.getEditor()]);
  expect(a).toBe(b);
  expect(spy).toHaveBeenCalledTimes(1);
  await s.dispose();
  spy.mockRestore();
});
