// src/compiler/packager.ts
import JSZip from "jszip";
import { byOpcode } from "./blocks/registry.js";
import { generatePlaceholderCostume } from "./placeholder.js";
import type { Diagnostic, InputValue, ParsedBlock, ParsedScript, Project } from "./types.js";
import type { BlockDef, InputSpec } from "./blocks/types.js";

const COSTUME_BASE = { bitmapResolution: 1, dataFormat: "svg", rotationCenterX: 50, rotationCenterY: 50 };

export async function packageProject(
  project: Project,
  scriptsByTarget: Map<string, ParsedScript[]>,
): Promise<{ sb3: Buffer; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const usedOpcodes = new Set<string>();
  let bcastCounter = 0;
  const broadcastIds = new Map<string, string>();
  const resolveBroadcast = (name: string): string => {
    let id = broadcastIds.get(name);
    if (!id) { id = `bcast-${++bcastCounter}`; broadcastIds.set(name, id); }
    return id;
  };
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

    const emitInput = (parentId: string, spec: InputSpec, value: InputValue | undefined): any => {
      // substack guard: satisfies type narrowing so spec.shadowType is reachable below
      if (spec.kind === "substack") return undefined;
      // boolean slot: a block or nothing
      if (spec.kind === "boolean") {
        if (value && value.kind === "block") return [2, emitBlock(value.block, parentId)];
        return undefined; // empty boolean → caller omits the input
      }
      // menu slot: generate a shadow menu block
      if (spec.kind === "menu") {
        const sel = value && value.kind === "menu" ? value.value : spec.default;
        const mid = nextId();
        const fieldVal = spec.broadcast ? [sel, resolveBroadcast(sel)] : [sel, null];
        blocks[mid] = { opcode: spec.menuOpcode, next: null, parent: parentId,
          inputs: {}, fields: { [spec.field]: fieldVal }, shadow: true, topLevel: false };
        return [1, mid];
      }
      // number/text slot: literal, variable primitive, or nested reporter obscuring a shadow
      const st = spec.shadowType;
      if (!value || value.kind === "literal") {
        return [1, [st, value && value.kind === "literal" ? value.value : ""]];
      }
      if (value.kind === "variable") {
        const id = resolveVar(value.name);
        if (!id) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
          message: `unresolved variable "${value.name}"` });
        return [3, [12, value.name, id ?? ""], [st, ""]];
      }
      // value.kind === "block" (menu was already handled in the menu branch above)
      if (value.kind === "block") return [3, emitBlock(value.block, parentId), [st, ""]];
      return [1, [st, ""]];
    };

    // emitBlock emits a single (possibly nested) reporter/boolean block and returns its id.
    const emitBlock = (b: ParsedBlock, parentId: string): string => {
      const id = nextId();
      usedOpcodes.add(b.opcode);
      const def = byOpcode.get(b.opcode);
      const entry: any = { opcode: b.opcode, next: null, parent: parentId,
        inputs: {}, fields: {}, shadow: false, topLevel: false };
      if (!def) {
        diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
          message: `unknown opcode "${b.opcode}"` });
      } else {
        for (const [nm, ispec] of Object.entries(def.inputs ?? {})) {
          if (ispec.kind === "substack") continue;
          const enc = emitInput(id, ispec, b.inputs[nm]);
          if (enc !== undefined) entry.inputs[nm] = enc;
        }
        emitFields(def, b, entry);
      }
      blocks[id] = entry;
      return id;
    };

    // emitFields handles variable fields ([name,id]) and dropdown fields ([value,null]).
    const emitFields = (def: BlockDef, b: ParsedBlock, entry: any): void => {
      for (const [nm, fspec] of Object.entries(def.fields ?? {})) {
        if (fspec.kind === "variable") {
          const vname = b.fields[nm] ?? "";
          const vid = resolveVar(vname);
          if (!vid) diagnostics.push({ file: target.sourceFile ?? target.name, line: 0, severity: "error",
            message: `unresolved variable "${vname}"` });
          entry.fields[nm] = [vname, vid ?? ""];
        } else if (fspec.kind === "broadcast") {
          const bname = b.fields[nm] ?? "";
          entry.fields[nm] = [bname, resolveBroadcast(bname)];
        } else { // dropdown (list handled in Task 4)
          entry.fields[nm] = [b.fields[nm] ?? "", null];
        }
      }
    };

    const emitStack = (list: ParsedBlock[], parentForFirst: string | null, topLevel: boolean, hatXY: { x: number; y: number }): string | null => {
      let firstId: string | null = null;
      let prevId: string | null = null;
      list.forEach((b, i) => {
        const id = nextId();
        usedOpcodes.add(b.opcode);
        const def = byOpcode.get(b.opcode);
        const entry: any = {
          opcode: b.opcode, next: null,
          parent: i === 0 ? parentForFirst : prevId,
          inputs: {}, fields: {}, shadow: false,
          topLevel: topLevel && i === 0,
        };
        if (entry.topLevel) { entry.x = hatXY.x; entry.y = hatXY.y; }
        if (def) {
          for (const [nm, ispec] of Object.entries(def.inputs ?? {})) {
            if (ispec.kind === "substack") continue;
            const enc = emitInput(id, ispec, b.inputs[nm]);
            if (enc !== undefined) entry.inputs[nm] = enc;
          }
          for (const sub of def.substacks ?? []) {
            const kids = b.substacks[sub] ?? [];
            if (kids.length) entry.inputs[sub] = [2, emitStack(kids, id, false, hatXY)];
          }
          emitFields(def, b, entry);
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

  const stageJson = targetsJson.find((t) => t.isStage);
  if (stageJson) {
    const bmap: Record<string, string> = {};
    for (const [name, id] of broadcastIds) bmap[id] = name;
    stageJson.broadcasts = bmap;
  }

  const extensions: string[] = [];
  if ([...usedOpcodes].some((op) => op.startsWith("pen_"))) extensions.push("pen");
  if ([...usedOpcodes].some((op) => op.startsWith("music_"))) extensions.push("music");
  const projectJson = { targets: targetsJson, monitors: [], extensions, meta: { semver: "3.0.0", vm: "0.2.0", agent: "scratch-mcp" } };
  zip.file("project.json", JSON.stringify(projectJson));
  const sb3 = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { sb3, diagnostics };
}
