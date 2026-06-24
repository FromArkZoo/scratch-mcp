// src/mcp/result.ts
export interface ToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
}
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
export function imageResult(png: Buffer, caption: string): ToolResult {
  return {
    content: [
      { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      { type: "text", text: caption },
    ],
  };
}
