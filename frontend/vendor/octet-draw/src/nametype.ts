// The typography of a chemical name, as IUPAC prints it (P-16.6, IR-1.6) and ChemDraw shows Structure to Name's
// names: italic for locant letters, stereodescriptors and other italic prefixes, superscript for the numbers IUPAC
// raises. The characters stay as they are, so the name copied as plain text still reads back.
// - Italic: element symbols used as locants (N-methyl, N,N'-, O-acid, S-ethyl), sec, tert, cis, trans, fac, mer, rac,
//   rel, endo, exo, syn, anti, the structural descriptors (triangulo, tetrahedro), R, S, E, Z and their variants in
//   stereodescriptors ((2R,3S), (1R*,3R*,5SR)), the H of indicated hydrogen (1H, 2(1H)), fusion letters (benzo[d],
//   [1,2-a]), polyhedral symbols ((SP-4-2)), the element symbols of metal-metal bonds ((Re—Co)) and the donor
//   element of a κ term.
// - Superscript: the number after an element locant (N1 as N¹), κ counts and the locants of the donor atom (κ3N1 as
//   κ³N¹), η counts, and λ's bonding number. Subscript: μ's bridging index (μ3).
// Ring-fusion primes and everything else stay plain.
import { normalise, type RunStyle, type TextRun } from "./richtext.ts";

type Mark = { at: number; end: number; style: RunStyle };
const ELEMENT_LOCANT = "(?:N|O|S|Se|Te|P|As|Sb|B|Si|Ge|Sn)";
const ITALIC_WORDS = "sec|tert|cis|trans|fac|mer|rac|rel|endo|exo|syn|anti|triangulo|quadro|tetrahedro|octahedro|catena";
// Before a locant or prefix: the start, a space, an enclosing mark, a comma, a hyphen or a colon.
const BEFORE = "(?<=^|[\\s(\\[{,\\-:])";

export function nameRuns(name: string): TextRun[] {
  if (!name || name.length > 3000) return [{ text: name }];
  const marks: Mark[] = [];
  const add = (at: number, end: number, style: RunStyle) => { if (end > at) marks.push({ at, end, style }); };
  const each = (re: RegExp, f: (m: RegExpExecArray) => void) => { for (const m of name.matchAll(re)) f(m as RegExpExecArray); };
  // Element locants: N-, N,N'-, N1,N4-, O-, S-; the number after the element raised.
  each(new RegExp(`${BEFORE}(${ELEMENT_LOCANT})(\\d*[a-z]?)('*)(?=[,\\-:)])`, "g"), (m) => {
    add(m.index, m.index + m[1].length, { italic: true });
    if (m[2]) add(m.index + m[1].length, m.index + m[1].length + m[2].length, { script: "super" });
  });
  // Italic prefixes and descriptors.
  each(new RegExp(`${BEFORE}(${ITALIC_WORDS})(?=-)`, "g"), (m) => add(m.index, m.index + m[1].length, { italic: true }));
  // Stereodescriptors in enclosing marks before a hyphen: (2R,3S)-, (E)-, (1R*,3R*,5SR)-, (2Z,4E)-.
  each(/\(([^()]{1,200})\)(?=-)/g, (m) => {
    const items = m[1].split(","), start = m.index + 1;
    if (!items.every((x) => /^\d*[a-z]?'*(?:R|S|E|Z|RS|SR|R\*|S\*|r|s|M|P)$/.test(x))) return;
    let at = start;
    for (const x of items) {
      const letters = /(R|S|E|Z|RS|SR|r|s|M|P)\*?$/.exec(x)!;
      add(at + letters.index, at + letters.index + letters[1].length, { italic: true });
      at += x.length + 1;
    }
  });
  // Indicated hydrogen: 1H-, 2H,6H-, quinolin-2(1H)-one, 9H-fluoren-9-yl.
  each(/(?<=^|[\s(\[{,\-]|\d\()(\d+[a-z]?'*)H(?=[,\-)\]]|[a-z])/g, (m) => add(m.index + m[1].length, m.index + m[1].length + 1, { italic: true }));
  // Fusion letters: [d], [b,e], [2,3-b], [1,2-a], [3,2-c:5,4-c'].
  each(/\[([^\]]{1,80})\]/g, (m) => {
    const parts = m[1].split(":");
    if (!parts.every((p) => /^(?:\d+'*(?:,\d+'*)*-)?[a-z]'*(?:,[a-z]'*)*$/.test(p))) return;
    for (const l of m[1].matchAll(/[a-z]/g)) add(m.index + 1 + l.index!, m.index + 2 + l.index!, { italic: true });
  });
  // Polyhedral symbols, and the chirality symbol after one: (SP-4-2), (OC-6-43), (T-4), (T-4-R), (TBPY-5-12).
  each(/\((SP|OC|T|TBPY|SPY|TPR|PBPY)-\d+(?:-\d+)?(?:-([RSCA]))?\)/g, (m) => {
    add(m.index + 1, m.index + 1 + m[1].length, { italic: true });
    if (m[2]) add(m.index + m[0].length - 2, m.index + m[0].length - 1, { italic: true });
  });
  // Metal-metal bonds: (Re—Co), (3 Os—Os), (Os1—Os3).
  each(/\((?:\d+ )?([A-Z][a-z]?)(\d*)—([A-Z][a-z]?)(\d*)\)/g, (m) => {
    let at = m.index + 1 + (m[0].match(/^\((\d+ )?/)![1]?.length ?? 0);
    for (const [el, loc] of [[m[1], m[2]], [m[3], m[4]]]) {
      add(at, at + el.length, { italic: true });
      add(at + el.length, at + el.length + loc.length, { script: "super" });
      at += el.length + loc.length + 1;
    }
  });
  // κ terms: the count raised, each donor element italic and its locant raised (κ3N1,N1',N1'').
  each(/κ(\d*)((?:[A-Z][a-z]?\d*[a-z]?'*)(?:,[A-Z][a-z]?\d*[a-z]?'*)*)/g, (m) => {
    const start = m.index + 1;
    add(start, start + m[1].length, { script: "super" });
    let at = start + m[1].length;
    for (const item of m[2].split(",")) {
      const x = /^([A-Z][a-z]?)(\d*[a-z]?)/.exec(item)!;
      add(at, at + x[1].length, { italic: true });
      add(at + x[1].length, at + x[1].length + x[2].length, { script: "super" });
      at += item.length + 1;
    }
  });
  each(/η(\d+)/g, (m) => add(m.index + 1, m.index + 1 + m[1].length, { script: "super" }));
  each(/λ(\d+)/g, (m) => add(m.index + 1, m.index + 1 + m[1].length, { script: "super" }));
  each(/μ(\d+)/g, (m) => add(m.index + 1, m.index + 1 + m[1].length, { script: "sub" }));
  // Each character's style, the marks on it together.
  const style: RunStyle[] = [...name].map(() => ({}));
  const chars = [...name];
  // Marks are by UTF-16 index; the names here have no characters outside the BMP, so indices match.
  if (chars.length !== name.length) return [{ text: name }];
  for (const k of marks) for (let i = k.at; i < k.end; i++) style[i] = { ...style[i], ...k.style };
  return normalise(chars.map((ch, i) => ({ text: ch, ...style[i] })));
}
