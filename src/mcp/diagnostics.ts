// src/mcp/diagnostics.ts
import type { Diagnostic } from "../compiler/types.js";

export function formatDiagnostics(diags: Diagnostic[]): { text: string; hasError: boolean } {
  const errors = diags.filter((d) => d.severity === "error").length;
  const warnings = diags.filter((d) => d.severity === "warning").length;
  const lines = diags.map((d) => {
    const loc = d.col != null ? `${d.line}:${d.col}` : `${d.line}`;
    return `${d.file}:${loc}: ${d.severity}: ${d.message}`;
  });
  const summary = `${errors} error(s), ${warnings} warning(s)`;
  return { text: diags.length ? `${summary}\n${lines.join("\n")}` : "", hasError: errors > 0 };
}
