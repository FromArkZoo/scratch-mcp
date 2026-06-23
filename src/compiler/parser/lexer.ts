export type Tok =
  | { t: "word"; v: string }
  | { t: "(" } | { t: ")" }
  | { t: "<" } | { t: ">" }       // boolean-open / boolean-close ONLY (operators are word tokens)
  | { t: "text"; v: string }
  | { t: "menu"; v: string };

/** Tokenize one source line into a bracket-aware token stream. `[x v]` → menu,
 *  `[hello]` → text. `<`/`>` are boolean brackets unless space-adjacent (then
 *  they are comparison-operator words; see the spacing rule above). */
export function tokenizeLine(line: string): Tok[] {
  const out: Tok[] = [];
  const s = line.trim();
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : "";        // "" (non-space) at the boundary → bracket
    const next = i + 1 < s.length ? s[i + 1] : "";
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === "(") { out.push({ t: "(" }); i++; continue; }
    if (ch === ")") { out.push({ t: ")" }); i++; continue; }
    if (ch === "<") { out.push(next === " " ? { t: "word", v: "<" } : { t: "<" }); i++; continue; }
    if (ch === ">") { out.push(prev === " " ? { t: "word", v: ">" } : { t: ">" }); i++; continue; }
    if (ch === "[") {
      const close = s.indexOf("]", i);
      const inner = close === -1 ? s.slice(i + 1) : s.slice(i + 1, close);
      i = close === -1 ? s.length : close + 1;
      const m = inner.match(/^(.*)\s+v$/);            // "edge v" → menu "edge"
      if (m) out.push({ t: "menu", v: m[1].trim() });
      else out.push({ t: "text", v: inner.trim() });
      continue;
    }
    // a bare word: run until whitespace or a structural char
    let j = i;
    while (j < s.length && !" \t()<>[".includes(s[j])) j++;
    out.push({ t: "word", v: s.slice(i, j) });
    i = j;
  }
  return out;
}
