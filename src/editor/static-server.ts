import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".wav": "audio/wav", ".map": "application/json",
};

export interface StaticServer {
  url: string;
  close: () => Promise<void>;
}

export async function serveDir(root: string): Promise<StaticServer> {
  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let filePath = normalize(join(root, rawPath));
      if (!filePath.startsWith(normalize(root))) { res.statusCode = 403; return res.end(); }
      try {
        if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
      } catch {
        filePath = join(root, "index.html"); // SPA fallback
      }
      const body = await readFile(filePath);
      res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404; res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
