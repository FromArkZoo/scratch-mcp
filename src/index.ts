#!/usr/bin/env node
// src/index.ts — scratch-mcp stdio entry point
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const { server, session } = createServer();
  const shutdown = async () => { await session.dispose().catch(() => {}); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => { console.error(e); process.exit(1); });
