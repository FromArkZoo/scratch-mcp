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
  return {
    variable(name: string) { return (all.find((v: any) => v.name === name) as any)?.value; },
    spriteX(name: string) { return (targets.find((t) => t.sprite?.name === name || t.getName?.() === name) as any)?.x; },
  };
}
