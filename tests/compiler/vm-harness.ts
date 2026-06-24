// tests/compiler/vm-harness.ts
// @ts-expect-error scratch-vm ships no types
import VM from "scratch-vm";

export async function runHeadless(sb3: Buffer, frames = 120) {
  const vm: any = new VM();
  // Headless: no renderer/storage host. loadProject reads assets from the sb3 zip itself.
  await vm.loadProject(sb3);
  // currentStepTime must be set before _step(); start() sets it but also starts a timer.
  // Set it directly so WORK_TIME = 0.75 * 33ms is large enough for threads to run each frame.
  vm.runtime.currentStepTime = 1000 / 30; // same as compatibility-mode interval
  vm.greenFlag();
  // Deterministic stepping: advance the runtime N frames so all threads complete.
  for (let i = 0; i < frames; i++) vm.runtime._step();
  const targets: any[] = vm.runtime.targets;
  const all = targets.flatMap((t) => Object.values(t.variables ?? {}));
  const find = (name: string) => targets.find((t) => t.sprite?.name === name || t.getName?.() === name);
  return {
    variable(name: string) { return (all.find((v: any) => v.name === name) as any)?.value; },
    spriteX(name: string) { return (find(name) as any)?.x; },
    target(name: string) { return find(name); },           // .x/.y/.direction/.size/.visible/.draggable/.currentCostume/.volume/.rotationStyle/.effects
    stage() { return targets.find((t) => t.isStage); },
    cloneCount() { return targets.length; },               // read after stepping → includes clones
    runtime() { return vm.runtime; },                      // .threads, .ioDevices, .targets
  };
}
