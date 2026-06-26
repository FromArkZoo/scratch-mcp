// tests/editor/with-timeout.test.ts
// page.evaluate has no built-in timeout, so a wedged in-page op (e.g. vm.loadProject
// on a corrupt/huge sb3) could hang a tool forever. withTimeout bounds it.
import { expect, test } from "vitest";
import { withTimeout } from "../../src/editor/scratch-editor.js";

test("withTimeout rejects with the label when the promise exceeds the budget", async () => {
  await expect(withTimeout(new Promise(() => {}), 50, "stuck-op"))
    .rejects.toThrow(/stuck-op/i);
});

test("withTimeout resolves a fast promise", async () => {
  await expect(withTimeout(Promise.resolve("ok"), 1000, "fast")).resolves.toBe("ok");
});
