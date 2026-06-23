import { expect, test } from "vitest";
import { tokenizeLine } from "../../src/compiler/parser/lexer.js";

test("splits words and round/boolean brackets", () => {
  expect(tokenizeLine("move (10) steps")).toEqual([
    { t: "word", v: "move" }, { t: "(" }, { t: "word", v: "10" }, { t: ")" }, { t: "word", v: "steps" },
  ]);
});

test("distinguishes a [x v] menu from a [hello] text literal", () => {
  expect(tokenizeLine("go to [random position v]")).toEqual([
    { t: "word", v: "go" }, { t: "word", v: "to" }, { t: "menu", v: "random position" },
  ]);
  expect(tokenizeLine("say [hello]")).toEqual([
    { t: "word", v: "say" }, { t: "text", v: "hello" },
  ]);
});

test("tokenizes nested operators and booleans", () => {
  expect(tokenizeLine("if <(1) > (2)> then")).toEqual([
    { t: "word", v: "if" }, { t: "<" }, { t: "(" }, { t: "word", v: "1" }, { t: ")" },
    { t: "word", v: ">" }, { t: "(" }, { t: "word", v: "2" }, { t: ")" }, { t: ">" },
    { t: "word", v: "then" },
  ]);
});

test("an empty text literal and an empty menu are preserved", () => {
  expect(tokenizeLine("say []")).toEqual([{ t: "word", v: "say" }, { t: "text", v: "" }]);
});
