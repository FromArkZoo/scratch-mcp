// src/mcp/scaffold.ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import yaml from "js-yaml";

const STARTER_YAML = (name: string) =>
  yaml.dump({ name, sprites: [{ name: "Cat", source: "cat.sprite.scratch" }] });
const STARTER_SCRATCH = "when green flag clicked\nmove (10) steps\n";

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

export function projectsRoot(): string {
  return process.env.SCRATCH_MCP_PROJECTS_DIR
    ? resolve(process.env.SCRATCH_MCP_PROJECTS_DIR)
    : join(process.env.HOME ?? ".", "scratch-mcp", "projects");
}

export async function scaffoldProject(name: string, path?: string): Promise<{ dir: string }> {
  const dir = path ? resolve(path) : join(projectsRoot(), slug(name));
  let existing: string[] = [];
  try { existing = await readdir(dir); }
  catch (e: any) { if (e.code !== "ENOENT") throw e; }       // ENOENT = doesn't exist → fine
  if (existing.length > 0) throw new Error(`refusing to scaffold into non-empty dir: ${dir}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "project.yaml"), STARTER_YAML(name));
  await writeFile(join(dir, "cat.sprite.scratch"), STARTER_SCRATCH);
  return { dir };
}

export async function listProjects(dir?: string): Promise<Array<{ name: string; path: string }>> {
  const root = dir ? resolve(dir) : projectsRoot();
  let entries: import("node:fs").Dirent[];
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (e: any) { if (e.code === "ENOENT") return []; throw e; }
  const out: Array<{ name: string; path: string }> = [];
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const projectDir = join(root, dirent.name);
    try {
      const doc = yaml.load(await readFile(join(projectDir, "project.yaml"), "utf8")) as any;
      out.push({ name: (doc && doc.name) || dirent.name, path: projectDir });
    } catch { /* not a project dir — skip */ }
  }
  return out;
}
