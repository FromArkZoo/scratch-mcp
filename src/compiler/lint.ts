import type { Diagnostic, ParsedBlock, ParsedScript } from "./types.js";

// Visual statements whose only effect is a screen update. Running one EVERY
// frame — unconditionally inside a `forever` — requests a screen refresh on
// every frame, which caps the sequencer to ~one pass per frame and starves
// other sprites' non-warp loops (collision/physics), so the project crawls.
//
// Pen and motion are deliberately NOT flagged: drawing the whole scene with
// pen + go-to once per `forever` iteration is the intended single-pass
// renderer pattern, and its redraw lands at the end of the frame (it does not
// throttle its own earlier loops).
const PER_FRAME_VISUAL = new Set(["looks_say", "looks_think"]);
const IFS = new Set(["control_if", "control_if_else"]);

/**
 * Warn when a per-frame visual (say/think) runs unconditionally inside a
 * `forever` loop. One warning per sprite per kind. Returns `severity:"warning"`
 * diagnostics, so it never fails the compile.
 */
export function lintScripts(scripts: ParsedScript[], file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const warned = new Set<string>();

  function walk(blocks: ParsedBlock[], underForever: boolean, guarded: boolean): void {
    for (const b of blocks) {
      if (underForever && !guarded && PER_FRAME_VISUAL.has(b.opcode) && !warned.has(b.opcode)) {
        warned.add(b.opcode);
        const verb = b.opcode === "looks_think" ? "think" : "say";
        out.push({
          file,
          line: 0,
          severity: "warning",
          message:
            `'${verb}' runs every frame inside a forever loop — this forces a screen ` +
            `refresh on every frame and starves other sprites' loops, so the project ` +
            `runs very slowly. Guard it with an "if <value changed> then …" so it only ` +
            `updates when the displayed value actually changes.`,
        });
      }
      const isForever = b.opcode === "control_forever";
      const childForever = underForever || isForever;
      const childGuarded = isForever ? false : guarded || IFS.has(b.opcode);
      for (const sub of Object.values(b.substacks)) walk(sub, childForever, childGuarded);
    }
  }

  for (const s of scripts) walk(s.blocks, false, false);
  return out;
}
