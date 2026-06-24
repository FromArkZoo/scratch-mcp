// tests/mcp/server.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";

async function connect() {
  const { server } = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

test("server exposes all 10 tools", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual([
    "compile", "import_sb3", "list_projects", "new_project", "open_project",
    "read_state", "reload", "run", "snapshot", "stop",
  ]);
});

test("new_project round-trips through the SDK", async () => {
  const root = await mkdtemp(join(tmpdir(), "srv-"));
  process.env.SCRATCH_MCP_PROJECTS_DIR = root;
  const client = await connect();
  const res: any = await client.callTool({ name: "new_project", arguments: { name: "Via SDK" } });
  expect(res.isError).toBeFalsy();
  expect(res.content[0].text).toMatch(/Created project/);
}, 120_000);

test("compile with no active project reports isError through the SDK", async () => {
  const client = await connect();
  const res: any = await client.callTool({ name: "compile", arguments: {} });
  expect(res.isError).toBe(true);
});
