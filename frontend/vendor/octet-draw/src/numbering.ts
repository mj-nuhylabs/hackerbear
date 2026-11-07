// Compound numbers (Number these compounds): bold text under a structure, 1, 2, 3 or, as ChemDraw's reaction
// numbering offers, I, II, III (issue 34). The numbers themselves are the record of the style: a drawing whose numbers
// are all roman numerals numbers its next compound in roman numerals too, so nothing else is saved and every file
// format keeps it.
import { readingOrder } from "./access.ts";
import type { Box, Caption, Mol } from "./render.ts";

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
// 1 to 3999 as a roman numeral; any other number as it is.
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
// A roman numeral written the usual way (IV, not IIII), as its number; undefined for anything else.
const WELL_FORMED = /^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
export function fromRoman(s: string): number | undefined {
  if (!s || s.length > 15 || !WELL_FORMED.test(s)) return undefined;
  let n = 0, i = 0;
  for (const [v, r] of ROMAN) while (s.startsWith(r, i)) { n += v; i += r.length; }
  return n;
}
// A compound number's value, arabic or roman (3 or III); undefined when the text is not one on its own (3a is not).
export const numberValue = (text: string) => (/^\d{1,6}$/.test(text) ? Number(text) : fromRoman(text));
// A drawing that labels its compounds with letters (A, B, C, D) has bold capitals under its structures that are not
// roman numerals. Its C and D are letters too, never 100 and 500.
const lettered = (m: Mol) => (m.captions ?? []).some((c) => c.bold && c.under?.length && /^[A-Z]$/.test(c.text) && fromRoman(c.text) === undefined);
const letter = (m: Mol, text: string) => /^[A-Z][a-z]?$/.test(text) && lettered(m);
// The captions that are plain compound numbers: bold, under a structure, a number alone.
const plainNumbers = (m: Mol) => (m.captions ?? []).filter((c) => c.bold && c.under?.length && numberValue(c.text) !== undefined && !letter(m, c.text));
// Whether the drawing numbers its compounds in roman numerals: it has numbers and every one is roman.
export function romanNumbers(m: Mol): boolean {
  const ns = plainNumbers(m);
  return ns.length > 0 && ns.every((c) => !/^\d/.test(c.text));
}
// The number n in the drawing's style.
export const numberText = (m: Mol, n: number, roman = romanNumbers(m)) => (roman ? toRoman(n) : String(n));

// The next compound number: one more than the highest bold number already there (3, III or 3a), in the drawing's style.
export function nextCompound(m: Mol): string {
  // A roman numeral counts only under a structure, so bold text such as a heading "C" is not 100.
  const used = (m.captions ?? []).filter((c) => c.bold && (/^\d/.test(c.text) || (c.under?.length && !letter(m, c.text)))).map((c) => numberValue(c.text.replace(/(?<=^(?:\d+|[IVXLCDM]+))[a-z]$/, "")) ?? 0);
  return numberText(m, Math.max(0, ...used) + 1);
}

// The numbers in the other style: III becomes 3, 3 becomes III. A number with a letter (3a) stays as it is.
export function setRoman(m: Mol, roman: boolean): Mol {
  if (!plainNumbers(m).length) return m;
  const ns = new Set(plainNumbers(m));
  return { ...m, captions: m.captions!.map((c) => (ns.has(c) ? { ...c, text: numberText(m, numberValue(c.text)!, roman) } : c)) };
}

// On an experiment page, the numbers Octet gave (auto, from Number these compounds) follow the compounds (issue 34):
// in reading order, rows from the top and each row from the left, so starting materials come before the products of
// their arrow. The user's own numbers (typed, edited by hand, or from a file without Octet's mark, such as one from
// 1.1.0) are never changed, and Octet's go round them: they start one past the highest of the user's numbers below
// them (1 when there is none) and skip every number the user holds. 3a and other text stay as typed. The same drawing comes back when
// nothing changes.
export function renumber(m: Mol): Mol {
  const ns = plainNumbers(m).filter((c) => c.auto);
  if (!ns.length) return m;
  const box = (c: Caption): Box | undefined => {
    const at = c.under!.map((i) => m.atoms[i]?.location).filter(Boolean);
    if (!at.length) return undefined;
    const xs = at.map((p) => p![0]), ys = at.map((p) => p![1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const held = new Set(plainNumbers(m).filter((c) => !c.auto).map((c) => numberValue(c.text)!));
  const low = Math.min(...ns.map((c) => numberValue(c.text)!));
  let n = Math.max(0, ...[...held].filter((v) => v < low)) + 1;
  const roman = romanNumbers(m), order = readingOrder(ns.map(box)), text = new Map<number, string>();
  for (const k of order) {
    while (held.has(n)) n++;
    text.set(ns[k].id, numberText(m, n++, roman));
  }
  if (ns.every((c) => text.get(c.id) === c.text)) return m;
  return { ...m, captions: m.captions!.map((c) => (text.has(c.id) && text.get(c.id) !== c.text ? { ...c, text: text.get(c.id)! } : c)) };
}
