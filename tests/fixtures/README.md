# Test Fixtures

## spin.sb3

A minimal Scratch 3 project used to validate the live VM bridge.

### What the project does

- Stage has a global variable `angle` initialised to `0`.
- Sprite `Cat` has one script: `when green flag clicked → set angle to 0 → repeat 36 [turn cw 10°, change angle by 10]`.
- Running the project to completion sets `angle` to `360` and rotates the sprite by one full turn.

### How to regenerate

The fixture is generated from `spin.project.json` by `build-spin.mjs`. To regenerate:

```bash
npm run build          # compile TypeScript → dist/
node tests/fixtures/build-spin.mjs
```

`build-spin.mjs` launches the self-hosted Scratch editor via Playwright, loads `spin.project.json` into the live VM, calls `vm.saveProjectSb3()` to serialise the project as a real `.sb3` (ZIP containing `project.json` + bundled assets), and writes the result to `spin.sb3`. The green flag is **not** triggered before saving, so the initial `angle` value of `0` is preserved.
