// tests/mcp/diagnostics.test.ts
import { expect, test } from "vitest";
import { formatDiagnostics } from "../../src/mcp/diagnostics.js";

test("formats errors and warnings with file:line and a summary", () => {
  const { text, hasError } = formatDiagnostics([
    { file: "cat.sprite.scratch", line: 3, message: 'unknown block "fly"', severity: "error" },
    { file: "project.yaml", line: 0, message: "deprecated key", severity: "warning" },
  ]);
  expect(hasError).toBe(true);
  expect(text).toContain("1 error(s), 1 warning(s)");
  expect(text).toContain('cat.sprite.scratch:3: error: unknown block "fly"');
  expect(text).toContain("project.yaml:0: warning: deprecated key");
});

test("includes column when present", () => {
  const { text } = formatDiagnostics([
    { file: "a.scratch", line: 2, col: 5, message: "boom", severity: "error" },
  ]);
  expect(text).toContain("a.scratch:2:5: error: boom");
});

test("empty diagnostics → empty text, no error", () => {
  const { text, hasError } = formatDiagnostics([]);
  expect(text).toBe("");
  expect(hasError).toBe(false);
});
