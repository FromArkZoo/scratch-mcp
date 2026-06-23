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

export async function serveDir(root: string, port = 0): Promise<StaticServer> {
  const normRoot = normalize(root);
  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let filePath = normalize(join(root, rawPath));
      if (!filePath.startsWith(normRoot)) { res.statusCode = 403; return res.end(); }
      try {
        if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
      } catch {
        // SPA fallback ONLY for extension-less navigations; real asset paths must 404 loudly
        if (extname(rawPath) !== "") {
          res.statusCode = 404;
          return res.end("not found");
        }
        filePath = join(root, "index.html");
      }
      const body = await readFile(filePath);
      res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404; res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const addr = server.address();
  const boundPort = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${boundPort}/`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
