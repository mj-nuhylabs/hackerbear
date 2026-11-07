// RNA and DNA typed as one-letter codes: "rna: AACGUU" and "dna: ATGC" in Name to Structure, and Structure > Insert
// RNA… and Insert DNA…, which open the name field with "rna: " or "dna: " in it, as Insert Peptide… does (peptide.ts).
// The structure is built here as SMILES, one nucleotide after another from the 5' end to the 3' end: a β-D-
// ribofuranose (RNA) or 2-deoxy-β-D-ribofuranose (DNA) on N9 of a purine or N1 of a pyrimidine, joined 3'-O to 5'-O
// by phosphodiester bridges. The ends are 5'-OH and 3'-OH; a p before or after the codes puts a phosphate on that
// end. As ChemDraw's Paste Special > FASTA RNA and FASTA DNA do, T in RNA is read as U and U in DNA as T. Codes may be
// in either case. The prefix keeps codes apart from names: ACG or CAT is never read as a sequence.

// Each base written from the N that bonds to the sugar, ring closures 2 and 3 (ring 1 is the sugar's).
const BASES: Record<string, string> = {
  A: "N2C=NC3=C2N=CN=C3N", G: "N2C=NC3=C2N=C(N)NC3=O", C: "N2C=CC(N)=NC2=O", U: "N2C=CC(=O)NC2=O", T: "N2C=C(C)C(=O)NC2=O",
};
// The nucleoside from 5'-O to 3'-O: O5' C5' C4' (ring) O4' C1' (base) C2' (2'-OH in RNA) C3' O3'. Every unit's atoms
// come in the same order, so each stereocentre is written the same way in every unit (D sugar, β base).
export const unit = (base: string, dna: boolean) => `OC[C@H]1O[C@@H](${BASES[base]})${dna ? "C" : "[C@H](O)"}[C@@H]1O`;
export const PHOSPHATE = "P(=O)(O)";

// Up to 30 nucleotides: a 30-mer is 634 atoms, laid out in about 2 seconds, as long as the slowest 60-residue peptide.
export const MAX_NUCLEOTIDES = 30;
export const NUCLEIC = /^\s*(rna|dna)\s*:\s*/i;

// SMILES for one-letter codes, with a phosphate on either end when a p is typed there ("pACGU", "5'-pACGU-3'").
// "5'-" and "-3'" may be typed round the codes. Spaces are left out. problem: why the text is not a sequence.
// Undefined for empty text.
export function nucleicSmiles(text: string, dna: boolean): { smiles: string } | { problem: string } | undefined {
  const bare = text.replace(/\s+/g, "").replace(/[’′]/g, "'").replace(/^5'-?/, "").replace(/-?3'$/, "");
  const m = /^(p-?)?(.*?)(-?p)?$/i.exec(bare)!;
  const [, five, codes, three] = m;
  const example = dna ? "ATGC" : "AACGUU";
  if (!codes) return five || three || bare !== text.replace(/\s+/g, "") ? { problem: `Type the bases, for example ${example}.` } : undefined;
  const letters = [...codes.toUpperCase()].map((ch) => (ch === (dna ? "U" : "T") ? (dna ? "T" : "U") : ch));
  const bad = [...new Set([...codes].filter((_, k) => !BASES[letters[k]]))];
  if (bad.length) return { problem: `${bad.length === 1 ? "Not a nucleotide" : "Not nucleotides"}: ${bad.join(", ")}` };
  if (letters.length > MAX_NUCLEOTIDES) return { problem: `Up to ${MAX_NUCLEOTIDES} nucleotides.` };
  const chain = letters.map((b) => unit(b, dna)).join(PHOSPHATE);
  return { smiles: `${five ? `O${PHOSPHATE}` : ""}${chain}${three ? `${PHOSPHATE}O` : ""}` };
}

// Text that starts "rna:" or "dna:": its SMILES or its problem (none yet when no codes are typed, as when Insert RNA…
// opens the field). Undefined for any other text.
export function nucleicText(text: string): { smiles: string } | { problem: string } | undefined {
  const m = NUCLEIC.exec(text);
  if (!m) return undefined;
  return nucleicSmiles(text.slice(m[0].length), m[1].toLowerCase() === "dna") ?? { problem: "" };
}
// Why text that starts "rna:" or "dna:" is not a sequence; undefined when it is one, is other text or has no codes yet.
export function nucleicProblem(text: string): string | undefined {
  const n = nucleicText(text);
  return n && "problem" in n ? n.problem || undefined : undefined;
}
