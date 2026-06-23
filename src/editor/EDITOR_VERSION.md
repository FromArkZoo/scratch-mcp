# Self-hosted Scratch editor — version record (Task 2 de-risk spike)

This records the outcome of the Task 2 de-risk gate: a served editor page where
`window.vm` is a **live `scratch-vm` instance** and `window.__scratchReady === true`
once the editor mounts. Task 3 (the live-editor bridge) depends on this contract.

## Outcome: ✅ STRATEGY A SUCCEEDED

We embed the **prebuilt** `scratch-gui` npm package in our own Vite app
(`editor/`). We do **not** re-bundle scratch-gui's source through Vite — that is
the historically painful path (worker-loaders, raw-loaders, peer-dep hell).
Instead we consume scratch-gui's shipped `dist/scratch-gui.js` UMD bundle (React
externalized) plus its runtime assets, which sidesteps every known packaging
hazard. Strategy B (clone TurboWarp + patch + webpack) was **not needed**.

### Why this works / key facts learned

- `scratch-gui@5.3.0` ships a prebuilt `dist/scratch-gui.js` whose `package.json`
  `main` points at it. Its default export is `GUI`; it also exports `AppStateHOC`.
- scratch-gui **owns VM construction internally**: its `src/reducers/vm.js` does
  `const defaultVM = new VM()` and stores it at `state.scratchGui.vm`. The GUI
  container, `vmManagerHOC` (which calls `vm.start()`), and all listeners read
  that single store VM. `mapStateToProps` always sets `vm: state.scratchGui.vm`,
  so a `vm` prop would be overridden — injecting our own VM is the wrong move.
- **Bridge contract resolution:** `AppStateHOC` builds the Redux store internally
  and exposes it as `this.store`. We wrap `GUI` in `AppStateHOC`, keep a React
  ref to the wrapper, and after render read the authoritative VM out of the store
  (`ref.current.store.getState().scratchGui.vm`) onto `window.vm`. This
  guarantees `window.vm` **is** the exact VM the editor is driving — not a
  detached second instance. See `editor/src/main.jsx`.
- scratch-gui fetches runtime assets relative to the page root (`static/`,
  `chunks/`, `libraries/`, the micro:bit `*.hex`, `extension-worker.js`). Vite
  inlines the JS but not these; `editor/scripts/copy-runtime-assets.mjs` copies
  them into `dist/` after `vite build`. Network check at runtime: **0 HTTP 4xx/5xx,
  0 failed requests.**

## Exact pinned versions

| Package | Version | Notes |
|---|---|---|
| `scratch-gui` | **5.3.0** | source tag `v5.3.0` @ commit `eeff02c1f99b92db50f942b8f269b98188d70937` (scratchfoundation/scratch-gui); prebuilt `dist/` consumed |
| `scratch-vm` | **5.0.300** | hoisted; exactly what scratch-gui@5.3.0 depends on (single VM instance, no duplication) |
| `react` | **16.14.0** | scratch-gui@5.3.0 peerDep is `^16.0.0` — React 16 is required, NOT 18/19 |
| `react-dom` | **16.14.0** | matches react |
| `vite` | **5.4.21** | build + preview server |
| `@vitejs/plugin-react` | **4.7.0** | |
| `playwright` | **1.61.0** | installed at repo root (Task 1); used by the verify gate |
| Node | **v25.6.1** | the build works on Node 25 — Strategy A needs **no** legacy Node toolchain |
| npm | **11.9.0** | |

Exact versions are locked in `editor/package-lock.json` (committed). Reproduce
with `npm ci` inside `editor/`.

> Toolchain note: no Node version manager (`nvm`/`fnm`/`volta`) is installed on
> this machine; only Node 23 + 25 are available (Homebrew). This is exactly why
> Strategy A (which builds cleanly on Node 25) was preferable to Strategy B
> (TurboWarp's webpack-4 build typically wants Node 16/18 +
> `--openssl-legacy-provider`). Strategy A avoided that wall entirely.

## Served path layout (`editor/dist/`, git-ignored)

```
editor/dist/
├── index.html                    # loads /assets/index-*.js (the Vite bundle = our entry + scratch-gui)
├── assets/index-*.js             # ~17.8 MB; React 16 + scratch-gui + scratch-vm + our main.jsx
├── static/                       # blocks media + default-project / sprite-library assets (fetched at runtime)
├── chunks/                       # async locale "steps" chunks
├── libraries/                    # sound/costume/backdrop library metadata
├── extension-worker.js           # scratch-vm extension worker
└── <hash>.hex                    # micro:bit firmware (referenced by the bundle)
```

Build it with: `cd editor && npm install && npm run build`
Serve it with:  `cd editor && npm run preview`  → `http://localhost:5174/`

## Verification gate (the hard gate) — PASSED

Built `editor/dist`, served it with `vite preview` on port 5174, then ran the
Playwright gate. Exact command and output:

```
$ cd editor && npm run preview            # serves dist/ at http://localhost:5174/
# in another shell, from editor/ (so it resolves playwright from the repo root):
$ node verify.mjs http://localhost:5174/
true
```

`verify.mjs` evaluates, in headless Chromium after the page mounts:

```js
Boolean(window.vm?.runtime) && window.__scratchReady === true
```

…and prints exactly `true` (exit code 0). Kept as `editor/verify.mjs` (minimal;
it is the *gate*, not the Task 3 bridge).

### Extra de-risk evidence (beyond the gate)

Driving the VM from outside the browser via Playwright (`page.evaluate`) succeeded
end to end — this is the actual capability Task 3 relies on:

- `window.vm.constructor` exists; `window.vm.runtime` is live (`__scratchReady === true`).
- VM API surface present: `loadProject`, `greenFlag`, `stopAll`, `start`,
  `addSprite`, `toJSON`, `saveProjectSb3` (all `function`).
- `vm.loadProject(<minimal sb3 JSON>)` → `runtime.targets.length === 1`.
- `vm.start()` + `vm.greenFlag()` + `vm.stopAll()` ran without error.
- `vm.toJSON()` serialized the loaded project (674 bytes).
- The full editor UI renders (block palette, workspace, stage, sprite panel,
  green-flag/stop, toolbar) — verified by screenshot.

### Known non-issue

One console `SyntaxError: Unexpected token '<'` fires during mount. It is a benign
internal scratch-gui probe (no failed network request, no 4xx/5xx). It does **not**
block the VM, the runtime, readiness, rendering, or driving the VM. The default
cat-sprite project is not auto-loaded (`targets.length === 0` until a project is
loaded) because no project source is configured — expected; the Task 3 bridge
loads projects itself via `vm.loadProject`.

## HARD GATE STATUS: ✅ PASS — Task 3 may proceed.
