// src/compiler/packager.ts
import JSZip from "jszip";
import { byOpcode } from "./blocks/registry.js";
import { generatePlaceholderCostume } from "./placeholder.js";
import type { Diagnostic, ParsedBlock, ParsedScript, Project } from "./types.js";

const COSTUME_BASE = { bitmapResolution: 1, dataFormat: "svg", rotationCenterX: 50, rotationCenterY: 50 };

export async function packageProject(
  project: Project,
  scriptsByTarget: Map<string, ParsedScript[]>,
): Promise<{ sb3: Buffer; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const zip = new JSZip();

  // 1. variable id maps. Global vars live on the Stage; each target sees its own + globals.
  const stage = project.targets.find((t) => t.isStage)!;
  let varCounter = 0;
  const stageVarIds = new Map<string, string>();
  for (const v of stage.variables) stageVarIds.set(v.name, `var-${++varCounter}`);

  const targetsJson: any[] = [];
  for (const target of project.targets) {
    const ownVarIds = new Map<string, string>();
    if (!target.isStage) for (const v of target.variables) ownVarIds.set(v.name, `var-${++varCounter}`);
    const resolveVar = (name: string): string | undefined =>
      ownVarIds.get(name) ?? stageVarIds.get(name);

    // block emission
    const blocks: Record<string, any> = {};
    let idCounter = 0;
    const nextId = () => `blk-${++idCounter}`;
    const scripts = scriptsByTarget.get(target.name) ?? [];

    const emitStack = (list: ParsedBlock[], parentForFirst: string | null, topLevel: boolean, hatXY: { x: number; y: number }): string | null => {
      let firstId: string | null = null;
      let prevId: string | null = null;
      list.forEach((b, i) => {
        const id = nextId();
        const def = byOpcode.get(b.opcode);
        const entry: any = {
          opcode: b.opcode, next: null,
          parent: i === 0 ? parentForFirst : prevId,
          inputs: {}, fields: {}, shadow: false,
          topLevel: topLevel && i === 0,
        };
        if (entry.topLevel) { entry.x = hatXY.x; entry.y = hatXY.y; }
        if (def) {
          for (const [nm, spec] of Object.entries(def.inputs ?? {})) {
            if (spec.kind === "substack") continue;
            const v = b.inputs[nm]?.value ?? "";
            entry.inputs[nm] = [1, [spec.shadowType ?? 4, v]];
          }
          if (def.substack) {
            const kids = b.substacks[def.substack] ?? [];
            if (kids.length) entry.inputs[def.substack] = [2, emitStack(kids, id, false, hatXY)];
          }
          for (const [nm, fspec] of Object.entries(def.fields ?? {})) {
            if (fspec.kind === "variable") {
              const vname = b.fields[nm] ?? "";
              const vid = resolveVar(vname);
              if (!vid) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error", message: `unresolved variable "${vname}"` });
              entry.fields[nm] = [vname, vid ?? ""];
            }
          }
        } else {
          diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error", message: `unknown opcode "${b.opcode}"` });
        }
        blocks[id] = entry;
        if (prevId) blocks[prevId].next = id;
        if (i === 0) firstId = id;
        prevId = id;
      });
      return firstId;
    };

    scripts.forEach((s, si) => emitStack(s.blocks, null, true, { x: 40, y: 40 + si * 200 }));

    // costume (placeholder for the skeleton)
    const costume = generatePlaceholderCostume(target.name);
    zip.file(costume.md5ext, costume.bytes);

    const variablesJson: Record<string, [string, string | number]> = {};
    const vmap = target.isStage ? stageVarIds : ownVarIds;
    for (const v of target.variables) variablesJson[vmap.get(v.name)!] = [v.name, v.value];

    const base = {
      isStage: target.isStage, name: target.name,
      variables: variablesJson, lists: {}, broadcasts: {}, blocks, comments: {},
      currentCostume: 0,
      costumes: [{ ...COSTUME_BASE, name: costume.name, assetId: costume.md5, md5ext: costume.md5ext }],
      sounds: [], volume: 100, layerOrder: target.isStage ? 0 : 1,
    };
    targetsJson.push(target.isStage
      ? { ...base, tempo: 60, videoTransparency: 50, videoState: "on", textToSpeechLanguage: null }
      : { ...base, visible: target.visible ?? true, x: target.x ?? 0, y: target.y ?? 0,
          size: target.size ?? 100, direction: target.direction ?? 90, draggable: false, rotationStyle: "all around" });
  }

  const projectJson = { targets: targetsJson, monitors: [], extensions: [], meta: { semver: "3.0.0", vm: "0.2.0", agent: "scratch-mcp" } };
  zip.file("project.json", JSON.stringify(projectJson));
  const sb3 = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { sb3, diagnostics };
}
