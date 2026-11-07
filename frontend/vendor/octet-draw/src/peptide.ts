// Peptides typed as one-letter codes (issue 27): "peptide: ACDEFG" in Name to Structure, and Structure > Insert
// Peptide…, which opens the name field with "peptide: " in it. The codes become the three-letter sequence
// (Ala-Cys-Asp-Glu-Phe-Gly), which Name to Structure already reads (dictionary.ts peptideName), so a peptide typed
// either way is the same structure. Every residue is L. The prefix keeps one-letter codes apart from names: CHO or
// ACE is never read as a peptide.

export const CODES: Record<string, string> = {
  A: "Ala", R: "Arg", N: "Asn", D: "Asp", C: "Cys", Q: "Gln", E: "Glu", G: "Gly", H: "His", I: "Ile",
  L: "Leu", K: "Lys", M: "Met", F: "Phe", P: "Pro", S: "Ser", T: "Thr", W: "Trp", Y: "Tyr", V: "Val",
};
// Each residue's side chain as SMILES, written from the α carbon (peptideSmiles). Glycine has none; proline's closes
// a ring onto its own N.
const SIDES: Record<string, string> = {
  A: "C", R: "CCCNC(=N)N", N: "CC(N)=O", D: "CC(=O)O", C: "CS", Q: "CCC(N)=O", E: "CCC(=O)O", H: "CC1=CNC=N1",
  I: "[C@@H](C)CC", L: "CC(C)C", K: "CCCCN", M: "CCSC", F: "CC1=CC=CC=C1", S: "CO", T: "[C@@H](C)O",
  W: "CC1=CNC2=CC=CC=C12", Y: "CC1=CC=C(O)C=C1", V: "C(C)C",
};
export const MAX_RESIDUES = 60;
export const PEPTIDE = /^\s*peptide\s*:\s*/i;

// The three-letter sequence for one-letter codes, with the ends as typed: "H-" or "Ac-" before, "-OH" or "-NH2"
// after. Spaces are left out. A single residue is written H-Xaa-OH, so it draws as the amino acid. problem: why the
// text is not a peptide. Undefined for empty text.
export function threeLetter(text: string): { sequence: string } | { problem: string } | undefined {
  const m = /^(H-|Ac-)?([^-]*)(-OH|-NH2)?$/i.exec(text.replace(/\s+/g, ""));
  if (!m) return { problem: "Ends can be H-, Ac-, -OH or -NH2." };
  const [, start = "", letters, end = ""] = m;
  if (!letters) return start || end ? { problem: "Type the amino acids, for example ACDEFG." } : undefined;
  if (/[a-z]/.test(letters)) return { problem: "Type the amino acids in capitals, for example ACDEFG." };
  const bad = [...new Set([...letters].filter((ch) => !CODES[ch]))];
  if (bad.length) return { problem: `${bad.length === 1 ? "Not an amino acid" : "Not amino acids"}: ${bad.join(", ")}` };
  if (letters.length > MAX_RESIDUES) return { problem: `Up to ${MAX_RESIDUES} amino acids.` };
  const body = [...letters].map((ch) => CODES[ch]).join("-");
  const lone = letters.length === 1 && !start && !end;
  return { sequence: `${lone ? "H-" : start.replace(/^ac/i, "Ac").replace(/^h/, "H")}${body}${lone ? "-OH" : end.replace(/^-oh$/i, "-OH").replace(/^-nh2$/i, "-NH2")}` };
}

// SMILES for one-letter codes, built here without OPSIN: every residue L, N-terminus first, with the ends as typed.
// It is the structure Name to Structure gives for the same text (peptide.check.ts compares InChIs), written another
// way, so neither the name field's live preview of a peptide nor Return waits for OPSIN (namepreview.ts). Undefined for
// text that is not a peptide.
export function peptideSmiles(text: string): string | undefined {
  const p = PEPTIDE.test(text) ? threeLetter(text.replace(PEPTIDE, "")) : undefined;
  if (!p || !("sequence" in p)) return undefined;
  const m = /^(H-|Ac-)?(.*?)(-OH|-NH2)?$/.exec(p.sequence)!, codes = m[2].split("-").map((c) => Object.keys(CODES).find((k) => CODES[k] === c)!);
  const body = codes.map(residueSmiles).join("");
  return `${m[1] === "Ac-" ? "CC(=O)" : ""}${body}${m[3] === "-NH2" ? "N" : "O"}`;
}

// One residue from its N to its C=O, the C=O's carbon and oxygen last (sequence.ts reads its atoms by that order).
export const residueSmiles = (k: string) => (k === "G" ? "NCC(=O)" : k === "P" ? "N1CCC[C@H]1C(=O)" : `N[C@@H](${SIDES[k]})C(=O)`);

// Text that starts "peptide:": its three-letter sequence or its problem (none yet when no codes are typed, as when
// Insert Peptide… opens the field). Undefined for any other text.
export function peptideText(text: string): { sequence: string } | { problem: string } | undefined {
  if (!PEPTIDE.test(text)) return undefined;
  return threeLetter(text.replace(PEPTIDE, "")) ?? { problem: "" };
}
// Why text that starts "peptide:" is not a peptide; undefined when it is one, is other text or has no codes yet.
export function peptideProblem(text: string): string | undefined {
  const p = peptideText(text);
  return p && "problem" in p ? p.problem || undefined : undefined;
}
