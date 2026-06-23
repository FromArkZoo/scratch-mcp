// Scratch MCP — self-hosted editor entry (Strategy A: embed prebuilt scratch-gui).
//
// Contract for Task 3 (the live-editor bridge): once this page is mounted in a
// browser, `window.vm` MUST be the live `scratch-vm` instance the editor is using,
// and `window.__scratchReady === true`.
//
// scratch-gui owns VM construction internally: its `vm` reducer creates a single
// `defaultVM = new VM()` and stores it at `state.scratchGui.vm`. The GUI container,
// the vmManagerHOC (which calls vm.start()) and every listener all read that same
// store VM. So rather than fight the store by injecting our own VM (connect's
// mapStateToProps would override a `vm` prop anyway), we mount the real GUI and
// then read the authoritative VM back out of the store via a ref on AppStateHOC
// (it exposes `this.store`). That guarantees window.vm === the VM the editor drives.

import React from "react";
import ReactDOM from "react-dom";

import GUI, { AppStateHOC } from "scratch-gui";

const appTarget = document.getElementById("root");

// scratch-gui uses react-modal; it needs to know the app root for a11y.
GUI.setAppElement(appTarget);

// AppStateHOC builds the Redux store (with the default VM) internally and exposes
// it as `this.store`. Wrap GUI in it and keep a ref so we can reach the store.
const WrappedGui = AppStateHOC(GUI);

const appRef = React.createRef();

function exposeVmFromStore() {
  const wrapper = appRef.current;
  if (!wrapper || !wrapper.store) return false;
  const state = wrapper.store.getState();
  const vm = state && state.scratchGui && state.scratchGui.vm;
  if (!vm) return false;

  // LOAD-BEARING: this is the bridge handle Task 3 / Playwright drives.
  window.vm = vm;

  const markReady = () => {
    window.__scratchReady = true;
  };

  // vmManagerHOC calls vm.start() during mount, so runtime exists immediately.
  // Be defensive: mark ready now if the runtime is alive, otherwise on the
  // first project/workspace event.
  if (vm.runtime) {
    markReady();
  } else {
    vm.once("workspaceUpdate", markReady);
    vm.once("PROJECT_LOADED", markReady);
  }
  return true;
}

ReactDOM.render(
  React.createElement(WrappedGui, {
    ref: appRef,
    canEditTitle: true,
    backpackVisible: false,
    canSave: false,
  }),
  appTarget,
  () => {
    // Render-complete callback. The store exists by now; expose the VM.
    if (!exposeVmFromStore()) {
      // Extremely unlikely fallback: poll briefly for the store/VM.
      let tries = 0;
      const t = setInterval(() => {
        if (exposeVmFromStore() || ++tries > 50) clearInterval(t);
      }, 100);
    }
  }
);
