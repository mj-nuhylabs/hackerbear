// The choices under the name field while it holds a sequence ("peptide:", "rna:" or "dna:"): the kind, and each end.
// They read and rewrite the text, so the text stays the one record of what is drawn and the ends typed by hand
// ("Ac-", "-NH2", "p") show as chosen. With nothing chosen the ends are the usual ones: H- and -OH on a peptide, 5'-OH
// and 3'-OH on RNA and DNA. ChemDraw's sequences start with its default termini in the same way.
import type { Mol } from "./render.ts";
import { pickAtoms } from "./edit.ts";
import { CODES, peptideSmiles, residueSmiles } from "./peptide.ts";
import { nucleicText, PHOSPHATE, unit } from "./nucleic.ts";

export type SeqKind = "peptide" | "rna" | "dna";
// start: N-acetyl (peptide) or a 5'-phosphate; end: C-amide or a 3'-phosphate.
export type SeqParts = { kind: SeqKind; codes: string; start: boolean; end: boolean };
export const SEQ_ENDS: Record<SeqKind, [start: string, end: string]> = {
  peptide: ["N-acetyl", "C-amide"], rna: ["5′-phosphate", "3′-phosphate"], dna: ["5′-phosphate", "3′-phosphate"],
};

export function sequenceParts(text: string): SeqParts | undefined {
  const m = /^\s*(peptide|rna|dna)\s*:\s*([\s\S]*)$/i.exec(text);
  if (!m) return undefined;
  const kind = m[1].toLowerCase() as SeqKind;
  if (kind === "peptide") {
    const p = /^(H-|Ac-)?([\s\S]*?)(-OH|-NH2)?\s*$/i.exec(m[2])!;
    return { kind, codes: p[2], start: /^ac/i.test(p[1] ?? ""), end: /nh2/i.test(p[3] ?? "") };
  }
  const n = /^(?:5'-?)?(p-?)?([\s\S]*?)(-?p)?(?:-?3')?\s*$/i.exec(m[2].replace(/[’′]/g, "'"))!;
  return { kind, codes: n[2], start: !!n[1], end: !!n[3] };
}

// The text for the parts, and where the caret goes: after the codes, before the end.
export function sequenceText(s: SeqParts): { text: string; caret: number } {
  const codes = s.codes.trim(), head = `${s.kind}: ${s.start ? (s.kind === "peptide" ? "Ac-" : "p") : ""}${codes}`;
  // With no codes yet, a 3' phosphate is "-p", so it is not read as a 5' one.
  const tail = !s.end ? "" : s.kind === "peptide" ? "-NH2" : codes ? "p" : "-p";
  return { text: head + tail, caret: head.length };
}

// ——— Residue labels ———
// A sequence drawn as residue labels, as ChemDraw draws one: H–Ala–Cys–OH, or rA–P–rC for RNA (dA–P–dC for DNA, with
// P for each phosphate). Each label keeps its residue's atoms as drawn (inner), and each bond says which of them it
// joins (ports): a residue's N on one side and its C=O on the other, a nucleotide's 5'-O and 3'-O, a phosphate's P. So
// the formula, the name and every other analysis read the whole structure, and Expand Label draws a residue out.
// full: the structure drawn in full from the same text, its atoms in the order of its SMILES (peptide.ts, nucleic.ts).
// Undefined when the atoms are not in that order: the structure is then drawn in full.
type Unit = { text?: string; label: string; from?: number; to?: number; in?: number; out?: number };
const atomsOf = (smiles: string) => [...smiles.matchAll(/\[([A-Z][a-z]?)[^\]]*\]|Br|Cl|[BCNOPSFI]/g)].map((m) => m[1] ?? m[0]);
// Rows of 10 labels, the next row back the other way, 2.6 bond lengths apart: about a bond length shows between labels.
const ROW = 10, STEP = 2.6, ROW_GAP = 1.8;

// The residue labels for a sequence from the structure drawn (full), or, when its atoms are not in the order of its
// SMILES (a quick preview's layout), from its SMILES read again (parse): the labels are laid out here either way.
export function residuesOf(text: string, full: Mol, parse: (smiles: string) => Mol): Mol | undefined {
  const done = residues(full, text);
  if (done) return done;
  const s = sequenceParts(text), smiles = !s ? undefined : s.kind === "peptide" ? peptideSmiles(text) : (() => { const n = nucleicText(text); return n && "smiles" in n ? n.smiles : undefined; })();
  try { return smiles ? residues(parse(smiles), text) : undefined; } catch { return undefined; }
}

// What a residue bonded on two sides is, for Contract Label's suggestion: its InChI with each outside bond capped as
// the free compound has it (OH on a C=O or a phosphate's P, H on an N or O) against each amino acid's, nucleoside's
// and phosphate's. The labels are the ones the Sequence tool draws.
export function residueName(m: Mol, group: Set<number>, inchi: (x: Mol | string) => string | undefined): string | undefined {
  const caps = new Map<number, string>();
  for (const b of m.bonds) {
    if (group.has(b.atoms[0]) === group.has(b.atoms[1])) continue;
    const e = group.has(b.atoms[0]) ? 0 : 1, inside = m.atoms[b.atoms[e]].label;
    caps.set(b.atoms[1 - e], inside === "C" || inside === "P" ? "O" : "H");
  }
  const keep = [...group, ...caps.keys()].sort((p, q) => p - q);
  const capped = pickAtoms({ ...m, atoms: m.atoms.map((a, i) => (caps.has(i) ? { label: caps.get(i)!, location: a.location } : a)) }, keep);
  const want = inchi(capped);
  return want ? residueTexts().find(([smiles]) => inchi(smiles) === want)?.[1] : undefined;
}
export function residueTexts(): [smiles: string, text: string][] {
  return [
    ...Object.keys(CODES).map((c): [string, string] => [`${residueSmiles(c)}O`, CODES[c]]),
    ...["A", "C", "G", "U"].map((b): [string, string] => [unit(b, false), `r${b}`]),
    ...["A", "C", "G", "T"].map((b): [string, string] => [unit(b, true), `d${b}`]),
    [`O${PHOSPHATE}O`, "P"],
  ];
}

// A residue label renamed to another residue of its kind (Ala to Gly, rA to rC): the new residue's atoms, and each bond
// keeps its side. A peptide residue's bonds go to its N and its C=O; a nucleotide's to its 5'-O (beside the ring's CH2)
// and its 3'-O; a phosphate's to its P. Undefined for any other name.
const residueKind = (t: string) => (Object.values(CODES).includes(t) ? "aa" : /^[rd][ACGUT]$/.test(t) ? "nt" : t === "P" ? "p" : undefined);
function innerOf(t: string, parse: (smiles: string) => Mol): { mol: Mol; in: number; out: number } | undefined {
  const code = Object.keys(CODES).find((k) => CODES[k] === t);
  if (code) { const mol = parse(residueSmiles(code)); return { mol, in: 0, out: mol.atoms.length - 2 }; }
  if (/^[rd][ACGUT]$/.test(t)) { const mol = parse(unit(t[1], t[0] === "d")); return { mol, in: 0, out: mol.atoms.length - 1 }; }
  if (t === "P") return { mol: parse(PHOSPHATE), in: 0, out: 0 };
  return undefined;
}
// Which side a kept atom bonds on: "in" for a residue's N or a nucleotide's 5'-O (its carbon has no other bond).
function sideOf(inner: Mol, k: number): "in" | "out" {
  const a = inner.atoms[k], near = (j: number) => inner.bonds.filter((b) => b.atoms.includes(j)).map((b) => b.atoms[0] === j ? b.atoms[1] : b.atoms[0]);
  if (a.label === "N") return "in";
  if (a.label === "O") return near(k).some((c) => inner.atoms[c].label === "C" && near(c).length === 2) ? "in" : "out";
  return k === 0 ? "in" : "out";
}
export function relabel(m: Mol, i: number, text: string, parse: (smiles: string) => Mol): Mol | undefined {
  const a = m.atoms[i], kind = residueKind(text);
  if (!a.inner || !a.text || !kind || kind !== residueKind(a.text)) return undefined;
  let made: ReturnType<typeof innerOf>;
  try { made = innerOf(text, parse); } catch { return undefined; }
  if (!made) return undefined;
  for (const p of [made.in, made.out]) { const { implicitHCount: _, ...x } = made.mol.atoms[p]; made.mol.atoms[p] = x; }
  const old = a.inner;
  const bonds = m.bonds.map((b) => {
    if (!b.ports || !b.atoms.includes(i)) return b;
    const ports = b.atoms.map((k, e) => (k !== i ? b.ports![e] : b.ports![e] < 0 ? -1 : sideOf(old, b.ports![e]) === "in" ? made!.in : made!.out)) as [number, number];
    return { ...b, ports };
  });
  return { ...m, bonds, atoms: m.atoms.map((x, k) => (k === i ? { ...x, text, inner: made!.mol } : x)) };
}

export function residues(full: Mol, text: string): Mol | undefined {
  const s = sequenceParts(text);
  if (!s) return undefined;
  const units: Unit[] = [], expect: string[] = [];
  const take = (smiles: string, u: Omit<Unit, "from" | "to">) => { const els = atomsOf(smiles); units.push({ ...u, from: expect.length, to: expect.length + els.length }); expect.push(...els); };
  const skip = (smiles: string, u: Unit) => { expect.push(...atomsOf(smiles)); units.push(u); };
  const codes = s.codes.replace(/\s+/g, "");
  if (s.kind === "peptide") {
    if (s.start) skip("CC(=O)", { text: "Ac", label: "C" }); else units.push({ label: "H" });
    for (const c of codes) { if (!CODES[c]) return undefined; const r = residueSmiles(c); take(r, { text: CODES[c], label: "C", in: 0, out: atomsOf(r).length - 2 }); }
    skip(s.end ? "N" : "O", { text: s.end ? "NH2" : "OH", label: s.end ? "N" : "O" });
  } else {
    const dna = s.kind === "dna", letters = [...codes.toUpperCase()].map((ch) => (ch === (dna ? "U" : "T") ? (dna ? "T" : "U") : ch));
    if (s.start) take(`O${PHOSPHATE}`, { text: "P", label: "P", out: 1 });
    letters.forEach((b, k) => {
      if (k) take(PHOSPHATE, { text: "P", label: "P", in: 0, out: 0 });
      const u = unit(b, dna);
      take(u, { text: `${dna ? "d" : "r"}${b}`, label: "C", in: 0, out: atomsOf(u).length - 1 });
    });
    if (s.end) take(`${PHOSPHATE}O`, { text: "P", label: "P", in: 0 });
  }
  if (!codes || full.atoms.length !== expect.length || full.atoms.some((a, k) => a.label !== expect[k])) return undefined;
  const atoms: Mol["atoms"] = units.map((u, k) => {
    const row = Math.floor(k / ROW), col = row % 2 ? ROW - 1 - (k % ROW) : k % ROW;
    const inner = u.from === undefined ? undefined : pickAtoms(full, Array.from({ length: u.to! - u.from }, (_, n) => u.from! + n));
    // The atoms that bond out count their hydrogens again, beside the bonds they have now.
    if (inner) for (const p of [u.in, u.out]) if (p !== undefined) { const { implicitHCount: _, ...a } = inner.atoms[p]; inner.atoms[p] = a; }
    // A residue's label is centred, so it reads as written in a row that runs right to left (never "alA"); an end
    // (OH, NH2) turns as any label does (HO).
    return { label: u.label, location: [col * STEP, -row * ROW_GAP, 0], ...(u.text ? { text: u.text } : {}), ...(inner ? { inner, align: "centre" as const } : {}) };
  });
  const bonds: Mol["bonds"] = units.slice(1).map((u, k) => ({ type: 1, atoms: [k, k + 1], ports: [units[k].out ?? -1, u.in ?? -1] }));
  return { atoms, bonds };
}
