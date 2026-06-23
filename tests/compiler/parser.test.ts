import { expect, test } from "vitest";
import { parseScripts } from "../../src/compiler/parser.js";

const src = `when green flag clicked
set [angle] to (0)
repeat (36)
  turn right (10) degrees
  change [angle] by (10)
end`;

test("parses a hat + nested c-block into IR", () => {
  const { scripts, diagnostics } = parseScripts(src, "cat.sprite.scratch");
  expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(scripts).toHaveLength(1);
  const b = scripts[0].blocks;
  expect(b[0].opcode).toBe("event_whenflagclicked");
  expect(b[1].opcode).toBe("data_setvariableto");
  expect(b[1].fields.VARIABLE).toBe("angle");
  const valueInput = b[1].inputs.VALUE;
  expect(valueInput.kind === "literal" ? valueInput.value : undefined).toBe("0");
  const rep = b[2];
  expect(rep.opcode).toBe("control_repeat");
  const timesInput = rep.inputs.TIMES;
  expect(timesInput.kind === "literal" ? timesInput.value : undefined).toBe("36");
  expect(rep.substacks.SUBSTACK.map((x) => x.opcode)).toEqual(["motion_turnright", "data_changevariableby"]);
});

test("an unknown block is a fail-loud diagnostic", () => {
  const { diagnostics } = parseScripts("when green flag clicked\nfly (3) times", "f.scratch");
  expect(diagnostics.some((d) => d.severity === "error" && /fly/.test(d.message))).toBe(true);
});

test("a script whose first line is not a hat emits an error diagnostic and does not throw", () => {
  const { diagnostics } = parseScripts("move (10) steps", "f.scratch");
  expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
});

test("a stray end with no open c-block emits an error diagnostic and does not throw", () => {
  const { diagnostics } = parseScripts("when green flag clicked\nend", "f.scratch");
  expect(diagnostics.some((d) => d.severity === "error" && /unexpected.*end/i.test(d.message))).toBe(true);
});

test("an unterminated c-block emits an error diagnostic and does not throw", () => {
  const { diagnostics } = parseScripts(
    "when green flag clicked\nrepeat (3)\nmove (10) steps",
    "f.scratch"
  );
  expect(diagnostics.some((d) => d.severity === "error" && /c-block.*end|end.*c-block|no matching/i.test(d.message))).toBe(true);
});
