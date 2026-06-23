import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { generatePlaceholderCostume } from "../../src/compiler/placeholder.js";

test("placeholder costume is a valid svg with a content-matching md5", () => {
  const c = generatePlaceholderCostume("Cat");
  expect(c.svg.startsWith("<svg")).toBe(true);
  const md5 = createHash("md5").update(c.bytes).digest("hex");
  expect(c.md5).toBe(md5);
  expect(c.md5ext).toBe(`${md5}.svg`);
});

test("placeholder is deterministic for the same seed", () => {
  expect(generatePlaceholderCostume("Cat").md5).toBe(generatePlaceholderCostume("Cat").md5);
});
