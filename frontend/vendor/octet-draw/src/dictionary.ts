// Name to Structure beyond OPSIN and Octet's own tables (names.ts asks this after them): the dictionary of common,
// trivial and trade names, CAS registry numbers and InChIKeys (data/names/dictionary.tsv.gz, built from Wikidata by
// scripts/build-dictionary.ts), condensed formulas (condensed.ts), and lists of names.
import { commonKey } from "./common.ts";
import { condensedSmiles } from "./condensed.ts";
import { NameTable } from "./nametable.ts";

// The table, kept small (nametable.ts): each compound's SMILES, the compound for each name key, CAS number and
// InChIKey, names OPSIN reads as another compound than the one Wikidata and PubChem give (tropicamide, marked "!"),
// and the names with each trigram (for completion, search and spelling mistakes).
let table: NameTable | undefined;

// Loads the table (once), gzipped next to the app. names.ts starts it with OPSIN.
let loading: Promise<void> | undefined;
export function loadDictionary(): Promise<void> {
  loading ??= (async () => {
    const raw = new Uint8Array(await (await fetch(new URL("../data/names/dictionary.tsv.gz", import.meta.url))).arrayBuffer());
    // A server may have unzipped it already.
    const zipped = raw[0] === 0x1f && raw[1] === 0x8b;
    const bytes = zipped ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()) : raw;
    await attachDictionary(bytes, true);
  })().catch((e) => { loading = undefined; throw e; });
  return loading;
}

// The table: a compound a line, its SMILES, names (| between), CAS numbers (| between), InChIKey, and names OPSIN
// reads (for suggestions only), tab-separated. A line with no SMILES, or one over 4,000 bytes, is left out.
// sliced: a pause every few thousand lines, so typing and drawing never wait. The checks read it whole.
// Sliced, it returns once names, CAS numbers and InChIKeys read, and suggestions follow a moment later.
export async function attachDictionary(text: string | Uint8Array, sliced = false) {
  table = await NameTable.read(typeof text === "string" ? new TextEncoder().encode(text) : text, sliced);
  if (!sliced) await table.suggested;
}

// SMILES for a name OPSIN misreads (names.ts asks this before OPSIN).
export function beforeOpsinSmiles(text: string): string | undefined {
  return table && text.length <= 200 ? table.smiles(table.nameCompound(commonKey(text), true)) : undefined;
}

// ——— CAS registry numbers ———
// Two to seven digits, two digits and a check digit, with hyphens: 64-17-5. Typed with "CAS", "CAS RN" or "CAS No."
// before it, or in square brackets, it is the same number.
const CAS = /^(?:CAS(?:\s*(?:RN|No\.?|number|registry number))?\s*[:#]?\s*)?\[?(\d{2,7})-(\d{2})-(\d)\]?$/i;
const casParts = (text: string) => CAS.exec(text.trim());
// The check digit: the other digits from the right, times 1, 2, 3 and so on, added, modulo 10.
const checkDigit = (digits: string) => [...digits].reverse().reduce((sum, d, i) => sum + Number(d) * (i + 1), 0) % 10;
export function casValid(text: string): boolean {
  const m = casParts(text);
  return !!m && checkDigit(m[1] + m[2]) === Number(m[3]);
}
// The reason a CAS number is refused: its check digit is wrong. Undefined for text that is not a CAS number, or one
// that is right.
export function casProblem(text: string): string | undefined {
  const m = casParts(text);
  if (!m || checkDigit(m[1] + m[2]) === Number(m[3])) return undefined;
  return `Not a CAS number. The last digit must be ${checkDigit(m[1] + m[2])}.`;
}
// The number as the table keeps it (no leading zeros), or undefined.
function casNumber(text: string): string | undefined {
  const m = casParts(text);
  return m && checkDigit(m[1] + m[2]) === Number(m[3]) ? `${Number(m[1])}-${m[2]}-${m[3]}` : undefined;
}

// ——— InChIKeys ———
const INCHIKEY = /^(?:InChIKey=)?([A-Z]{14}-[A-Z]{10}-[A-Z])$/i;
export const inchiKeyOf = (text: string): string | undefined => INCHIKEY.exec(text.trim())?.[1].toUpperCase();

// SMILES for a name from the dictionary, a CAS number, an InChIKey the dictionary has, a condensed formula (PhCH2OH),
// a peptide sequence (Ala-Gly-Ser) or an amino acid written "alpha alanine". Undefined for anything else. read: OPSIN,
// for the systematic name of a peptide.
export function dictionarySmiles(text: string, read?: (name: string) => string | undefined): string | undefined {
  const s = text.trim();
  // A peptide of 60 residues runs to about 250 characters (H-Ala-…-OH); anything else stops at 200.
  if (!s || s.length > 300) return undefined;
  const systematic = read && peptideName(s);
  if (s.length > 200) return systematic ? read(systematic) : undefined;
  const t = table, number = casParts(s) && casNumber(s);
  if (casParts(s)) return t && number ? t.smiles(t.casCompound(number)) : undefined;
  const key = inchiKeyOf(s);
  if (key) return t?.smiles(t.keyCompound(key));
  return t?.smiles(t.nameCompound(commonKey(s))) ?? condensedSmiles(s) ?? (systematic ? read(systematic) : undefined);
}

// ——— Peptides and amino acids ———
// Each residue's three-letter code, its name as an acyl group and as the amino acid, and whether it has an L form.
const RESIDUES: Record<string, [string, string, boolean]> = {
  Ala: ["alanyl", "alanine", true], Arg: ["arginyl", "arginine", true], Asn: ["asparaginyl", "asparagine", true],
  Asp: ["alpha-aspartyl", "aspartic acid", true], Cys: ["cysteinyl", "cysteine", true], Gln: ["glutaminyl", "glutamine", true],
  Glu: ["alpha-glutamyl", "glutamic acid", true], Gly: ["glycyl", "glycine", false], His: ["histidyl", "histidine", true],
  Ile: ["isoleucyl", "isoleucine", true], Leu: ["leucyl", "leucine", true], Lys: ["lysyl", "lysine", true],
  Met: ["methionyl", "methionine", true], Phe: ["phenylalanyl", "phenylalanine", true], Pro: ["prolyl", "proline", true],
  Ser: ["seryl", "serine", true], Thr: ["threonyl", "threonine", true], Trp: ["tryptophyl", "tryptophan", true],
  Tyr: ["tyrosyl", "tyrosine", true], Val: ["valyl", "valine", true],
};
// The systematic name of a peptide written as a sequence of three-letter codes ("Ala-Gly-Ser", "H-Ala-D-Phe-OH",
// "Ac-Ala-Gly-NH2"), each residue L unless D- comes before it, up to 60 residues; or of an amino acid written "alpha
// alanine" or "beta alanine". Undefined for anything else.
export function peptideName(text: string): string | undefined {
  const greek = /^(alpha|beta|gamma)[\s-]+([a-z]+)$/i.exec(text);
  if (greek) return greek[1].toLowerCase() === "alpha" ? greek[2] : `${greek[1].toLowerCase()}-${greek[2]}`;
  const parts = text.split("-");
  if (parts.length > 2 * 60 + 2) return undefined;
  const acetyl = /^Ac$/i.test(parts[0]), capped = acetyl || /^H$/i.test(parts[0]);
  if (capped) parts.shift();
  const end = parts[parts.length - 1], amide = /^NH2$/i.test(end);
  if (amide || /^OH$/i.test(end)) parts.pop();
  const residues: [string, string, boolean, string][] = [];
  for (let i = 0; i < parts.length; i++) {
    const hand = /^[DL]$/i.test(parts[i]) ? parts[i++].toUpperCase() : "L";
    const code = parts[i] ? parts[i][0].toUpperCase() + parts[i].slice(1).toLowerCase() : "";
    if (!RESIDUES[code]) return undefined;
    residues.push([...RESIDUES[code], hand]);
  }
  if (residues.length < (capped || amide ? 1 : 2) || residues.length > 60) return undefined;
  const named = residues.map(([acyl, acid, chiral, hand], i) => {
    const last = i === residues.length - 1, word = last ? (amide ? (acid.endsWith("ine") ? `${acid.slice(0, -1)}amide` : acid.endsWith("an") ? `${acid}amide` : "") : acid) : acyl;
    return word && (chiral ? `${hand}-${word}` : word);
  });
  return named.every(Boolean) ? `${acetyl ? "N-acetyl-" : ""}${named.join("-")}` : undefined;
}

// ——— Lists of names ———
// A list of names, one a line or with semicolons or commas between ("benzaldehyde, aniline; acetic acid"): the
// structure (SMILES) of each name, when there are 2 to 20 and each one reads. A comma inside a name
// ("2,4-dinitrophenol") has no space after it, so it does not split the name. read: Name to Structure for one name.
export function nameList(text: string, read: (name: string) => string | undefined): string[] | undefined {
  if (text.length > 4000 || !/[\n;]|,\s/.test(text)) return undefined;
  const names = text.split(/\s*[\n;]\s*|,\s+/).map((n) => n.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 20) return undefined;
  const out: string[] = [];
  for (const n of names) { const s = read(n); if (!s) return undefined; out.push(s); }
  return out;
}

// ——— Suggestions ———
// The shortest dictionary name that starts with what was typed (lower case).
// The names that start with it all have its first trigram (a space and its first two letters) and its first three
// letters: the shorter list is read.
export function completeName(typed: string): string | undefined {
  let best: string | undefined;
  const t = table;
  if (typed.length < 2 || !t) return best;
  const lengths = t.lengths();
  const head = ` ${typed.slice(0, 2)}`, three = typed.slice(0, 3);
  t.forGram(three.length === 3 && t.gramSize(three) < t.gramSize(head) ? three : head, (i) => {
    if (lengths[i] + 1 < typed.length || (best && lengths[i] > best.length + 1)) return;
    const l = t.lower(i);
    if (l.startsWith(typed) && (!best || l.length < best.length)) best = l;
  });
  return best;
}
// Dictionary names, as written, that begin as typed (compared as keys are, so "acetyl salicylic" finds acetylsalicylic
// acid): one for each compound, the shortest first. At most most. For the template library's search and the command
// palette, after Octet's own names (names.ts namesStarting).
export function dictionaryStarting(typed: string, most: number): string[] {
  const q = commonKey(typed.trim()), head = typed.trim().toLowerCase().slice(0, 2), t = table;
  if (q.length < 2 || head.length < 2 || most <= 0 || !t) return [];
  const found = [...new Set(t.withGram(` ${head}`))].filter((i) => commonKey(t.lower(i)).startsWith(q)).sort((a, b) => t.lower(a).length - t.lower(b).length || (t.lower(a) < t.lower(b) ? -1 : 1));
  const seen = new Set<number>(), out: string[] = [];
  for (const i of found) {
    if (seen.has(t.compound(i))) continue;
    seen.add(t.compound(i));
    out.push(t.written(i));
    if (out.length >= most) break;
  }
  return out;
}
// Dictionary names that could be what was typed (lower case) with up to `most` mistakes: those sharing enough of its
// trigrams. A mistake changes at most three trigrams.
export function nearNames(typed: string, most: number): string[] {
  const mine = trigrams(typed), need = Math.max(1, mine.length - 3 * most), touched: number[] = [], out: string[] = [], t = table;
  if (!t) return out;
  if (counts.length < t.size) counts = new Uint8Array(t.size);
  // Only names near its length are counted: lower case can lengthen a name by a character (İ), hence the 1 to spare.
  const lengths = t.lengths(), long = typed.length;
  for (const g of new Set(mine)) t.forGram(g, (i) => { if (Math.abs(lengths[i] - long) <= most + 1 && counts[i]++ === 0) touched.push(i); });
  for (const i of touched) {
    if (counts[i] >= need && Math.abs(t.lower(i).length - typed.length) <= most) out.push(t.lower(i));
    counts[i] = 0;
  }
  return out;
}
// Shared trigram counts for nearNames, back to zero after each use.
let counts = new Uint8Array(0);
function trigrams(s: string): string[] {
  const t = ` ${s} `, out: string[] = [];
  for (let i = 0; i + 3 <= t.length; i++) out.push(t.slice(i, i + 3));
  return out;
}
