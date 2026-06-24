// Vitest global setup. Headless Node has no Web Audio, so the scratch-vm Music extension's
// sound preloader (fire-and-forget in its constructor) rejects with "No Audio Context Detected".
// That rejection is benign — the .sb3 still loads and steps — but it is unhandled, so swallow ONLY
// that specific message here. Any other unhandled rejection is re-thrown so real bugs still fail loud.
process.on("unhandledRejection", (reason: unknown) => {
  const msg = String((reason as { message?: string })?.message ?? reason);
  if (msg.includes("No Audio Context")) return;
  throw reason;
});
