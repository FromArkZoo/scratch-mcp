import { createHash } from "node:crypto";

/** A deterministic, self-contained SVG costume used when no real art is resolved. */
export function generatePlaceholderCostume(seed: string): {
  name: string; svg: string; bytes: Buffer; md5: string; md5ext: string; dataFormatOk?: boolean;
} {
  // deterministic hue from the seed
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">` +
    `<rect x="5" y="5" width="90" height="90" rx="12" fill="hsl(${h},70%,60%)" stroke="#222" stroke-width="3"/>` +
    `</svg>`;
  const bytes = Buffer.from(svg, "utf8");
  const md5 = createHash("md5").update(bytes).digest("hex");
  return { name: "costume1", svg, bytes, md5, md5ext: `${md5}.svg` };
}
