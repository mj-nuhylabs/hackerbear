// The chemistry engine (Indigo) and the drawing style, shared by the editor and the dev gallery.
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import { AROMATIC, HBOND, hydrogens, labelInk, NONMETAL, orderOf, QUADRUPLE, scaleOf, type Box, type Face, type Ink, type Mol } from "./render.ts";
import { arialInk } from "./cdxml.ts";
import { fontStack } from "./docstyle.ts";
import { chemicalText, labelSmiles, writtenOxidation } from "./labels.ts";
import { bondedTo, chairHydrogens, fragments, insertMol, labelPlacer, levelTurn, perspectiveBonds, pickAtoms, renumberCentre, sandwich, subset } from "./edit.ts";
import { graphOf, type Graph } from "./naming.ts";
import { clean2d } from "./clean2d.ts";
import { kekulise } from "./rings.ts";
import { counts } from "./mass.ts";
import { hasQuery, polymerBrackets, polymerLabel, repeatCount } from "./query.ts";
import { isQueryMolfile, readV3000, RXCTR, writeV3000 } from "./molv3.ts";
import { axialLabels } from "./axial.ts";
import { sandwichIons } from "./metals.ts";
import { cipLabels } from "./cip.ts";
import type { StereoFacts } from "./check.ts";
import { inHost } from "./synpath.ts"; // SynPath

type IndigoModule = Awaited<ReturnType<typeof Indigo>>;
let indigo: IndigoModule | undefined;
export const ready: Promise<void> = Indigo().then((m: IndigoModule) => { indigo = m; });

// Drawing sizes come from brand/tokens.css (ACS 1996). The layout worker (layout.worker.ts) has no page: it lays out
// with Indigo alone and reads none of them.
// SynPath: the tokens are scoped to .octet-host, so they are read there (synpath.ts).
const token = (name: string) => (typeof document === "undefined" ? "" : inHost((h) => getComputedStyle(h).getPropertyValue(name)));
const pt = (name: string) => (parseFloat(token(name)) * 4) / 3; // pt to px
const BOND = pt("--bond-length");
export const STYLE = {
  bond: BOND,
  line: pt("--bond-width"),
  bold: pt("--bond-bold"),
  spacing: (parseFloat(token("--bond-spacing")) / 100) * BOND,
  hash: pt("--hash-spacing"),
  // ChemDraw's bonds clear the glyph outlines by 1.69 pt for a 1.6 pt margin (measured).
  margin: (pt("--margin-width") * 1.69) / 1.6,
  size: pt("--atom-label-size"),
};

// Text measured once and kept by its key. When a store holds `most`, the one used longest ago goes, so a long session
// with many different labels and captions does not fill the memory (issue 2).
function lastUsed<T>(store: Map<string, T>, most: number, key: string, make: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) { store.delete(key); store.set(key, hit); return hit; }
  const value = make();
  store.set(key, value);
  if (store.size > most) store.delete(store.keys().next().value!);
  return value;
}

// Glyph metrics and outlines. The outline is the edge pixels of the text drawn 8x larger, scaled back.
const FONT = token("--atom-label-font");
const SCALE = 8;
const inks = new Map<string, Ink>();
// Label metrics for a font and size (px), plain or bold or italic. Each text is measured once per font, size and face.
export const measurer = (font: string, size: number, bold = false, italic = false) => (text: string): Ink => {
  const face = `${italic ? "italic " : ""}${bold ? "bold " : ""}`;
  return lastUsed(inks, 2000, `${font}|${size}|${bold}|${italic}|${text}`, () => {
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.font = `${face}${size}px ${font}`;
    const m = g.measureText(text);
    const pad = 2, baseline = size * 1.2;
    const w = (canvas.width = Math.ceil((m.width + 2 * pad) * SCALE)), h = (canvas.height = Math.ceil(size * 1.6 * SCALE));
    g.font = `${face}${size * SCALE}px ${font}`;
    g.fillText(text, pad * SCALE, baseline * SCALE);
    const alpha = g.getImageData(0, 0, w, h).data;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * 4 + 3] > 127;
    const outline: [number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (on(x, y) && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)))
          outline.push([(x + 0.5) / SCALE - pad, (y + 0.5) / SCALE - baseline]);
    return { width: m.width, ascent: m.actualBoundingBoxAscent, outline };
  });
};
const plain = measurer(FONT, STYLE.size);
// A label's metrics in its own face (an atom's label can have its own font, bold and italic).
export const measure = (text: string, face?: Face): Ink =>
  face ? measurer(face.font ? fontStack(face.font) : FONT, STYLE.size, !!face.bold, !!face.italic)(text) : plain(text);

// A caption line's advance width in px, in the caption font. A width grows with the size (to within 0.04 px up to
// 40 px), so each text is measured once, at 100 px, for every size: a scale drag measures nothing again.
const CAPTION_FONT = token("--caption-font");
const widths = new Map<string, number>();
let meter: CanvasRenderingContext2D | undefined;
const pen = () => (meter ??= document.createElement("canvas").getContext("2d")!);
export function textWidth(text: string, size: number, bold?: boolean, italic?: boolean, family = CAPTION_FONT): number {
  const face = `${italic ? "italic " : ""}${bold ? "bold " : ""}`, key = `${face}${family}|${text}`;
  return lastUsed(widths, 10_000, key, () => { const m = pen(); m.font = `${face}100px ${family}`; return m.measureText(text).width / 100; }) * size;
}
// How far a piece of caption text reaches above and below its baseline in px: its tallest character and its lowest
// descender, as drawn (Variable line spacing).
const extents = new Map<string, [number, number]>();
export function textExtent(text: string, size: number, bold?: boolean, italic?: boolean, family = CAPTION_FONT): [number, number] {
  const font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${family}`, key = `${font}|${text}`;
  return lastUsed(extents, 10_000, key, (): [number, number] => { const p = pen(); p.font = font; const m = p.measureText(text); return [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]; });
}
export { CAPTION_FONT };

function engine() {
  if (!indigo) throw new Error("Indigo is not loaded yet");
  return indigo;
}

// A KET atom as Octet's: KET radicals 2 and 3 are one and two unpaired electrons. A map number and an enhanced
// stereo flag (abs, &n, orn) are kept.
type KetAtom = { label: string; location: [number, number, number]; charge?: number; radical?: number; isotope?: number; mapping?: number; stereoLabel?: string; alias?: string };
// A MOL file's alias ("A  n" and the label on the next line) is the atom's label, as Octet writes it, kept to 40
// characters of plain text as the CDXML reader keeps a label.
const aliasOf = (a: KetAtom) => { const t = typeof a.alias === "string" ? a.alias.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 40) : ""; return t && t !== a.label ? { text: t } : {}; };
const atomOfKet = (a: KetAtom): Mol["atoms"][number] =>
  ({ label: a.label, location: a.location, charge: a.charge, ...aliasOf(a), ...(a.radical ? { radical: a.radical === 1 ? 3 : a.radical - 1 } : {}), ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(Number.isInteger(a.mapping) && a.mapping! > 0 && a.mapping! <= 9999 ? { map: a.mapping } : {}),
    ...(/^(abs|&[1-9]\d?|or[1-9]\d?)$/.test(a.stereoLabel ?? "") ? { enhanced: a.stereoLabel } : {}) });

// Pasted, typed and imported text can stop the editor, as Indigo runs on the main thread: it reads very long text
// slowly, and its layout can tidy a crowded structure (a ring atom with five phenyls, a dense dendrimer) for minutes.
// So Octet reads at most 20,000 characters of SMILES and 300,000 of a file (a 1,000-atom KET file is 250,000), lays
// out at most 1,000 atoms, and caps the layout's rounds of tidying. 50 rounds is the fewest that lays out every real
// structure tried as no cap does (Pd(PPh3)4 needs 50). Each round costs more on a bigger structure, so the cap falls
// to 10 rounds at 400 atoms (a 100-residue peptide needs 10). The slowest structure tried takes half a second, and a
// 300,000-character file that is not chemistry takes under a second to refuse (src/layout.check.ts).
const MOST_CHARACTERS = 300_000, MOST_SMILES = 20_000, MOST_ATOMS = 1000;
// The reason to show for text over a limit.
const over = (most: number, what: string) => new RangeError(`It has more than ${most.toLocaleString("en-GB")} ${what}.`);
// Atoms in a SMILES (bracket atoms and the organic subset), up to the first space (CXSMILES and names come after it).
export const smilesAtoms = (smiles: string) => smiles.split(/\s/)[0].match(/\[[^\]]*\]|Br|Cl|[BCNOPSFIbcnops*]/g)?.length ?? 0;

// A structure file (MOL, SDF, RXN, RDF, CDXML, KET, SMILES), keeping the file's own drawing where it has one.
// Coordinates are scaled so the median bond is one bond length; SMILES (no drawing) is laid out. A reaction keeps its
// arrows and plus signs; an RD file's reactions stand one under another.
// Throws a RangeError, with the reason to show, for text over Octet's limits.
// An MDL file (MOL, SDF, RXN, RDF) whose only enhanced stereochemistry is its chiral flag: no V3000 stereo collections.
// Indigo reads the flag as abs (1) or &1 (0) on every stereocentre.
export const chiralFlagOnly = (text: string) => /V2000|V3000/.test(text) && !/MDLV30\/STE(ABS|RAC|REL)/.test(text);
export function importStructure(text: string): Mol {
  if (text.length > MOST_CHARACTERS) throw over(MOST_CHARACTERS, "characters");
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    const hasDrawing = /V2000|V3000|<CDXML|"root"|<cml[\s>]/i.test(text);
    if (!hasDrawing) return parseStructure(text);
    if (/^\s*\$RDFILE/.test(text)) return readRdf(text);
    // A query or Markush molfile: read by Octet, so its query data is kept (molv3.ts). A V2000 one (R-groups, atom
    // lists, substitution counts, S-groups) is made V3000 by Indigo first.
    const reaction = /^\s*\$RXN/.test(text);
    const v2000 = !reaction && /V2000/.test(text) && /^M {2}(RGP|ALS|SUB|UNS|RBC|LIN|STY|LOG)|^\$RGP|^(?:.{31})(R#|L |A |Q )|^.{6}  [5-8] /m.test(text);
    const v3000 = v2000 ? (() => { try { return convert(text, "molfile", { "molfile-saving-mode": "3000" }); } catch { return ""; } })() : text;
    if (!reaction && isQueryMolfile(v3000)) {
      const mol = readV3000(v3000);
      const lengths = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[1]].location[0] - mol.atoms[b.atoms[0]].location[0], mol.atoms[b.atoms[1]].location[1] - mol.atoms[b.atoms[0]].location[1])).sort((a, b) => a - b);
      const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1), at = (q: [number, number]): [number, number] => [q[0] * k, q[1] * k];
      return { ...mol, atoms: mol.atoms.map((a) => ({ ...a, location: [a.location[0] * k, a.location[1] * k, (a.location[2] ?? 0) * k] })), ...(mol.shapes ? { shapes: mol.shapes.map((sh) => ({ ...sh, from: at(sh.from), to: at(sh.to) })) } : {}) };
    }
    return scaled(fromKet(JSON.parse(JSON.parse(ind.convert(text, "ket", opts)).struct), /^\$\$\$\$/m.test(text)));
  } finally {
    opts.delete();
  }
}
// A drawing with its median bond one bond length long.
function scaled(mol: Mol): Mol {
  const lengths = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[1]].location[0] - mol.atoms[b.atoms[0]].location[0], mol.atoms[b.atoms[1]].location[1] - mol.atoms[b.atoms[0]].location[1])).sort((a, b) => a - b);
  const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1), at = (q: [number, number]): [number, number] => [q[0] * k, q[1] * k];
  return {
    ...mol, atoms: mol.atoms.map((a) => ({ ...a, location: [a.location[0] * k, a.location[1] * k, (a.location[2] ?? 0) * k] })),
    ...(mol.arrows ? { arrows: mol.arrows.map((a) => ({ ...a, from: at(a.from), to: at(a.to) })) } : {}),
    // A plus sign's point is its middle; its caption's point is its baseline, a quarter of a bond length lower.
    ...(mol.captions ? { captions: mol.captions.map((c) => ({ ...c, x: c.x * k, y: c.y * k - 0.25 })) } : {}),
  };
}
// Indigo's KET as a drawing: its molecules, with their map numbers and enhanced stereo, and a reaction's arrows and
// plus signs (Octet's reaction arrows and "+" captions). apart: the molecules are an SD file's records, which other
// programs often draw at one place; when two overlap, they are set in a row.
function fromKet(ket: Record<string, unknown> & { root: { nodes: Record<string, unknown>[] } }, apart = false): Mol {
  const mol: Mol = { atoms: [], bonds: [] }, arrows: NonNullable<Mol["arrows"]> = [], captions: NonNullable<Mol["captions"]> = [];
  let id = 1;
  for (const node of ket.root.nodes) {
    const frag = typeof node.$ref === "string" ? ket[node.$ref] as { type?: string; atoms: KetAtom[]; bonds: Mol["bonds"] } : undefined;
    if (frag?.type === "molecule") {
      const base = mol.atoms.length;
      mol.atoms.push(...frag.atoms.map(atomOfKet));
      // A bond's reacting centre (KET "center", the MDL code) is its Rxn mark.
      const rxnOf = (b: { center?: number }) => Object.keys(RXCTR).find((k) => RXCTR[k] === b.center) as Mol["bonds"][number]["rxn"];
      mol.bonds.push(...frag.bonds.map((b) => { const rxn = rxnOf(b as { center?: number }); return { type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number], stereo: b.stereo, ...(rxn ? { rxn } : {}) }; }));
    } else if (node.type === "plus" && Array.isArray(node.location)) {
      const [x, y] = (node.location as number[]).map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) captions.push({ id: id++, text: "+", x, y, align: "centre" });
    } else if (node.type === "arrow") {
      const d = node.data as { mode?: string; pos?: { x: number; y: number }[] } | undefined, [p, q] = d?.pos ?? [];
      if (!p || !q || ![p.x, p.y, q.x, q.y].every(Number.isFinite)) continue;
      const mode = String(d?.mode ?? "");
      const kind = /equilibrium/.test(mode) ? "equilibrium" : /retrosynthetic/.test(mode) ? "retro" : /failed/.test(mode) ? "nogo" : /both-ends/.test(mode) ? "resonance" : "reaction";
      arrows.push({ id: id++, kind, from: [p.x, p.y], to: [q.x, q.y], ...(/dashed/.test(mode) ? { style: "dashed" as const } : {}) });
    }
  }
  if (apart) {
    const groups = fragments(mol), box = (g: number[]) => [0, 1].flatMap((k) => [Math.min(...g.map((i) => mol.atoms[i].location[k])), Math.max(...g.map((i) => mol.atoms[i].location[k]))]);
    const boxes = groups.map(box), touch = (p: number[], q: number[]) => p[0] <= q[1] && q[0] <= p[1] && p[2] <= q[3] && q[2] <= p[3];
    if (boxes.some((p, k) => boxes.slice(k + 1).some((q) => touch(p, q)))) {
      const lengths = mol.bonds.map((b) => Math.hypot(...[0, 1].map((k) => mol.atoms[b.atoms[1]].location[k] - mol.atoms[b.atoms[0]].location[k]))).sort((x, y) => x - y);
      const gap = 2 * (lengths[Math.floor(lengths.length / 2)] || 1);
      let x = 0;
      groups.forEach((g, k) => {
        const [x0, x1, y0, y1] = boxes[k], dx = x - x0, dy = -(y0 + y1) / 2;
        for (const i of g) mol.atoms[i] = { ...mol.atoms[i], location: [mol.atoms[i].location[0] + dx, mol.atoms[i].location[1] + dy, mol.atoms[i].location[2]] };
        x += x1 - x0 + gap;
      });
    }
  }
  return { ...mol, ...(arrows.length ? { arrows } : {}), ...(captions.length ? { captions } : {}) };
}
// An RD file: each reaction (and molecule) record read on its own, one under another, so no two overlap.
function readRdf(text: string): Mol {
  const records = text.replace(/\r\n?/g, "\n").split(/^\$[RM]FMT[^\n]*\n/m).slice(1).slice(0, 200)
    .map((r) => r.replace(/^\$(RIREG|REREG|MIREG|MEREG)[^\n]*\n/, "").split(/^\$DTYPE/m)[0].trimEnd()).filter((r) => r.trim());
  if (!records.length) throw new Error("This RD file has no reactions.");
  let out: Mol = { atoms: [], bonds: [] }, top = 0;
  for (const r of records) {
    const part = importStructure(r.startsWith("$RXN") ? r : `${r}\n`), ys = [...part.atoms.map((a) => a.location[1]), ...(part.arrows ?? []).flatMap((a) => [a.from[1], a.to[1]])];
    if (!ys.length) continue;
    const dy = top - Math.max(...ys);
    out = insertMol(out, part, [0, dy]).mol;
    top += Math.min(...ys) - Math.max(...ys) - 3;
  }
  return out;
}

// SMILES (or a MOL file) to a laid-out molecule with Kekulé bonds and stereo wedges. All fragments are kept.
// Throws a RangeError, with the reason to show, for text over Octet's limits. tidy false: Indigo's layout only, for
// a structure that is read and not drawn (its InChI).
export function parseStructure(text: string, tidy = true): Mol {
  // SMILES is one line, counted as written (Indigo reads a long SMILES slowly); a MOL file or other file, through Indigo.
  const file = /^[{<]|[\r\n]/.test(text.trim()), most = file ? MOST_CHARACTERS : MOST_SMILES;
  if (text.length > most) throw over(most, "characters");
  // An RD file (pasted as text) is read record by record, as Import reads it: Indigo reads only one of its reactions.
  if (/^\s*\$RDFILE/.test(text)) return readRdf(text);
  const atoms = smilesAtoms(file ? convert(text, "smiles") : text);
  if (atoms > MOST_ATOMS) throw over(MOST_ATOMS, "atoms");
  // SMILES sets each stereocentre absolutely, and Indigo flags each one abs. Like a structure drawn by hand, it then
  // shows no flags, as in ChemDraw. Flags stay where the SMILES also sets and or or groups (CXSMILES).
  const lay = (smart: boolean) => {
    const m = indigoLayout(text, atoms, smart);
    return file || m.atoms.some((a) => /^(&|or)/.test(a.enhanced ?? "")) ? m : { ...m, atoms: m.atoms.map((a) => (a.enhanced ? (({ enhanced: _, ...rest }) => rest)(a) : a)) };
  };
  let out = lay(false);
  // A larger structure is laid out again only with Indigo's templates, and only where its SMILES sets stereochemistry.
  const marked = !file && /[@/\\]/.test(text);
  if (tidy && !out.arrows && (marked || out.atoms.length <= MOST_TIDIED)) out = tidied(out, () => lay(true), text, out.atoms.length <= MOST_TIDIED);
  // Any other with a few atoms on bonds, or labels on bonds or labels, has them moved off (with many atoms on bonds, as
  // on a carbon with 50 phenyls, there is no room).
  else if (tidy && !out.arrows) {
    const n = crowded(out, 0.15, 0, true), moved = (n || overLabels(out, inkBoxes(out)).length) && n <= MOST_NUDGED ? nudged(out) : out;
    if (moved !== out && toInchi(moved) === toInchi(out)) out = moved;
  }
  if (tidy && !out.arrows && marked) out = crossed(out, text);
  // The middle carbon of an allene, a ketene or an isothiocyanate lies in line with its two double bonds, so it shows
  // its label (C), as a carbon typed as a label does.
  if (tidy) out = { ...out, atoms: out.atoms.map((a, i) => (a.label === "C" && !a.text && out.bonds.filter((b) => b.atoms.includes(i)).map((b) => b.type).join() === "2,2" ? { ...a, shown: true as const } : a)) };
  return out.captions ? { ...out, captions: out.captions.map((c) => ({ ...c, y: c.y - 0.25 })) } : out;
}
// The structure Name to Structure draws for SMILES, fully tidied: a metallocene as a sandwich (ions: true, for a name;
// SMILES typed as it is keeps its ions). Return's layout of a sequence or a large structure, made in the layout worker
// (namepreview.ts fullLayout). Throws when the SMILES does not read.
export const fullMol = (smiles: string, ions = true): Mol => (ions ? sandwich(parseStructure(smiles)) : parseStructure(smiles));
// Indigo's layout of SMILES without the tidy, as Name to Structure draws it (a metallocene as a sandwich): the name
// field's live preview of a large structure (namepreview.ts, layout.worker.ts). Undefined when it does not read.
export function quickMol(smiles: string): Mol | undefined {
  try { const m = sandwich(parseStructure(smiles, false)); return m.atoms.length ? m : undefined; } catch { return undefined; }
}
// Indigo's own layout of a SMILES or file of so many atoms, its rounds of tidying capped for the size (MOST_ATOMS
// above). smart: with Indigo's ring templates. A reaction (reactants>agents>products) keeps its arrow and plus signs.
export function indigoLayout(text: string, atoms = smilesAtoms(text), smart = false): Mol {
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    // Indigo checks each Kekulé form it finds by making it aromatic again, which takes a second for a fullerene (PCBM)
    // and leaves some rings aromatic (caffeine's, made Kekulé below). Without the check, the dictionary's 15,195
    // structures written as aromatic SMILES draw with the same InChI (one better), and 9 with other double bonds.
    opts.set("dearomatize-verification", "false");
    opts.set("layout-max-iterations", String(Math.min(50, Math.max(10, Math.round(4000 / atoms)))));
    if (smart) opts.set("smart-layout", "true");
    const ket = JSON.parse(JSON.parse(ind.layout(text, "ket", opts)).struct);
    for (const node of ket.root.nodes) if (typeof node.$ref === "string" && ket[node.$ref]?.type === "molecule") kekule(ket[node.$ref]);
    return fromKet(ket);
  } finally {
    opts.delete();
  }
}
// Indigo leaves a ring aromatic where it cannot make it Kekulé (a pterin written with c(=N) and [nH], as in
// sapropterin's SMILES), and no InChI can be made from such a drawing. Its aromatic bonds are made Kekulé here, as
// cip.ts makes them: a double bond to each atom with room for one after its bonds, H atoms and charge, carbons first.
function kekule(frag: { atoms: (KetAtom & { implicitHCount?: number })[]; bonds: { type: number; atoms: [number, number] }[] }) {
  const arom = frag.bonds.filter((b) => b.type === 4);
  if (!arom.length) return;
  const used = frag.atoms.map(() => 0), single = frag.atoms.map(() => 0);
  for (const b of frag.bonds) for (const i of b.atoms) { used[i] += orderOf(b.type); single[i] += b.type === 4 ? 1 : orderOf(b.type); }
  const room = (i: number) => { const a = frag.atoms[i]; return hydrogens(a.label, a.charge ?? 0, single[i]) - (a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i])); };
  const can = [...new Set(arom.flatMap((b) => b.atoms))].filter((i) => room(i) >= 1).sort((p, q) => Number(frag.atoms[p].label !== "C") - Number(frag.atoms[q].label !== "C") || p - q);
  // Only a Kekulé form that gives every such atom its double bond: otherwise (a metal complex's rings) Indigo's stay.
  const on = kekulise(arom.map((b) => b.atoms), can);
  if (2 * on.filter(Boolean).length === can.length) on.forEach((d, k) => { arom[k].type = d ? 2 : 1; });
}

// Indigo's layout of a cage or bridged ring system (taxol, morphine, adamantane) can put an atom on a bond or two atoms
// on top of each other, and its plain layout draws some of a macrocycle's E double bonds Z (sirolimus, amphotericin B).
// Such a structure is laid out again with Indigo's ring templates, and each layout is cleaned up (clean false: not
// cleaned, for a large structure). The wedges go where ChemDraw puts them (placeWedges), and only a drawing that
// still reads as the same stereoisomer as the text (same standard InChI) is kept: the one with the fewest
// atoms the structure check warns about (on a bond, or in line), then on bonds or on each other, then labels on bonds or
// labels, then atoms close to them, then the fewest crossing bonds. If none reads the same, Indigo's own is. A drawing
// whose only fault is a label on a bond or a label is repaired (flipped, nudged), not laid out again.
const MOST_TIDIED = 100;
// Each clean-up's rounds times its atoms (each pass). A round costs about N, so this caps the time (under 0.3 s in all
// for the slowest structure in src/hardmolecules.check.ts), and the same text is drawn the same on any computer.
const TIDY_WORK = 10000;
function tidied(first: Mol, smart: () => Mol, text: string, clean = true): Mol {
  // A bond under half or over twice a bond length (Indigo stretches one across some cages, as in endrin aldehyde) is
  // laid out again too, as crowding is.
  const xy = first.atoms.map((a) => a.location);
  const long = first.bonds.some(({ atoms: [u, v] }) => Math.abs(Math.log2(Math.hypot(xy[u][0] - xy[v][0], xy[u][1] - xy[v][1]))) > 1);
  const wedged = first.bonds.some((b) => b.stereo === 1 || b.stereo === 6), crowd = crowded(first, 0.15, 0.35) + Number(long);
  if (!crowd && !wedged && !/[/\\]/.test(text) && !overLabels(first, inkBoxes(first)).length) return first;
  // A metal complex drawn by Octet can read differently from its SMILES (Indigo reads Pd(PPh3)4's SMILES with
  // charges on the metal), so a drawing that reads as Indigo's own drawing does is kept too, where only that differs.
  const flat = (i?: string) => i?.replace(/\/[btms][^/]*/g, ""), own = toInchi(text), drawn = toInchi(first);
  const refs = [own, flat(own) === flat(drawn) ? undefined : drawn].filter((r): r is string => !!r);
  if (!refs.length) return first;
  const same = (m: Mol) => { const i = toInchi(m); return refs.some((r) => r === i || opened(r, i)); };
  // The drawing with its wedges, if it reads as the text does. Indigo's own wedges can leave a crowded cage's centres
  // open or set them the wrong way (Jiadifenolide), as can the hands they give: then every centre gets a wedge, and
  // InChI says which to turn round or take away (mended).
  // The stereocentres are the structure's, whatever its layout: read once.
  let centres: Set<number> | undefined;
  // So is a wedge Indigo drew at a centre whose bonds show no hand (they lie in line in its layout): placeWedges leaves
  // it where it is, which can be on a bond to another centre (zenazocine).
  const fit = (m: Mol, from: Mol): Mol | undefined => {
    centres ??= stereoFacts(m).centres;
    const hands = wedgeHands(from), out = wedged ? placeWedges(m, hands, centres) : m, ok = same(out);
    const lost = from.bonds.some((b) => (b.stereo === 1 || b.stereo === 6) && centres!.has(b.atoms[0]) && !hands.has(b.atoms[0]));
    if (ok && !lost) return out;
    const fixed = own ? mended(placeWedges(m, new Map([...centres].map((c): [number, number] => [c, 1]).concat([...hands])), centres), own, m.atoms.length) : out;
    return fixed !== out && same(fixed) ? fixed : ok ? out : undefined;
  };
  // Atoms on bonds or in line (the structure check's warnings) first, then atoms on atoms, then labels on bonds or
  // labels, then atoms close to them.
  const rank = (m: Mol) => [crowded(m, 0.15, 0, true), crowded(m, 0.15, 0.35), overLabels(m, inkBoxes(m)).length, crowded(m, 0.3, 0.5), crossings(m)];
  // Where only labels lie on bonds or labels, the drawing is only repaired (below), not laid out again.
  const made = fit(first, first), wrong = !made, light = !crowd && !!made;
  if (light && !overLabels(made, inkBoxes(made)).length) return made;
  const at = bondedTo(first), tidy = (m: Mol) => cleanUp(m, undefined, Infinity, Math.ceil(TIDY_WORK / m.atoms.length), false);
  // Indigo's templates are for ring systems (an atom in three rings), and for a drawing that reads wrong.
  const fused = wrong || at.some((n, i) => n.filter((j) => inRing(at, i, j)).length >= 3);
  let other: Mol | undefined;
  const makes: (() => [Mol, Mol])[] = [];
  if (clean && !light) makes.push(() => [tidy(first), first]);
  if (fused && !light) makes.push(() => [other = smart(), other], ...(clean ? [(): [Mol, Mol] => [tidy(other!), other!]] : []));
  if (wrong && clean) makes.push(makes.shift()!);
  const tries = made ? [{ out: made, rank: rank(made) }] : [];
  const order = (p: { rank: number[] }, q: { rank: number[] }) => p.rank.reduce((d, r, k) => d || r - q.rank[k], 0);
  const late = makes.length;
  // A large structure's best layout is cleaned up only where it still has an atom on a bond, in line or on another atom,
  // or where no layout reads right (Indigo's own, if none does).
  if (!clean && !light) makes.push(() => { const best = tries[0]?.out ?? other ?? first; return [tidy(best), best]; });
  // Still an atom on a bond or in line, or on another atom: side groups turned over (flipped), then the atom or the
  // bond moved off (nudged), and the wedges placed again. A large structure is nudged before its clean-up, which takes
  // longer.
  const clear = (t?: { out: Mol; rank: number[] }) => !!t && !t.rank[0] && !crowded(t.out, 0, 0.35) && !t.rank[2];
  // from: a candidate to repair other than the best.
  const repair = (moves: ((m: Mol) => Mol)[], from?: { out: Mol; rank: number[] }) => {
    for (const move of moves) {
      const t = from ?? tries[0];
      if (!t || clear(tries[0])) return;
      const out = fit(move(t.out), t.out);
      if (!out) continue;
      const made = { out, rank: rank(out) };
      tries.push(made), tries.sort(order);
      if (from && order(made, from) < 0) from = made;
    }
  };
  for (const [k, make] of makes.entries()) {
    if (k === late) {
      tries.sort(order);
      repair([nudged]);
      if (clear(tries[0])) break;
    }
    let m: Mol, from: Mol;
    // Indigo's templates fail on some structures ("refinement: too small edge").
    try { [m, from] = make(); } catch { continue; }
    const out = fit(m, from);
    if (!out) continue;
    tries.push({ out, rank: rank(out) });
    if (!tries[tries.length - 1].rank[1] && !tries[tries.length - 1].rank[3]) break;
  }
  tries.sort(order);
  // A cage of three-connected atoms that is still crowded (C60, dodecahedrane) is drawn as a Schlegel diagram.
  const rings = at.map((n, i) => n.filter((j) => inRing(at, i, j)).length);
  if (tries[0]?.rank[0] && rings.includes(3) && rings.every((n) => n === 0 || n === 3)) {
    const out = fit(schlegel(first), first);
    if (out) tries.push({ out, rank: rank(out) }), tries.sort(order);
  }
  // The best, then (if that is still not clear) the next best, which can clear further (endrin aldehyde).
  const next = tries[1];
  repair([flipped, nudged]);
  if (next) repair([flipped, nudged], next);
  return tries[0]?.out ?? first;
}
// Each repair (flipped, nudged) tries at most REPAIR_WORK / atoms moves (a move costs about N), so a large structure is
// drawn in time, and the same on any computer.
const REPAIR_WORK = 100000;
// The drawing with side groups moved, where that lowers crowding: each the smaller side of a bond out of the rings (up
// to three bonds from it), with an atom on a bond or that bond's end in it, an atom on another atom, an atom in line
// with its two bonds, or a label on a bond or a label (by its point or its ink), turned over about its bond or turned
// up to 30° round the bond's other end.
// Three times round at most.
function flipped(m: Mol): Mol {
  const at = bondedTo(m), n = m.atoms.length;
  let best = m, ink = inkBoxes(m), now = crowding(m, inkHits(m, ink)), left = Math.ceil(REPAIR_WORK / n);
  const labelled = nearLabels(ink, at);
  for (let round = 0; round < 3 && now; round++) {
    const was = now;
    // The atoms on a bond, and that bond's atoms; and atoms on each other.
    const hit = new Set<number>();
    besideBonds(best, 0.15, unlabelled(best), (i, _, u, v) => hit.add(i).add(u).add(v));
    // An atom in line with its bonds, and their other ends.
    for (const i of linear(best, at)) hit.add(i), at[i].forEach((j) => hit.add(j));
    if (now < 1000) for (const [i, u, v] of overLabels(best, ink)) { hit.add(i).add(u); if (v >= 0) hit.add(v); }
    best.atoms.forEach((a, i) => best.atoms.forEach((c, j) => { if (j > i && !at[i].includes(j) && Math.hypot(c.location[0] - a.location[0], c.location[1] - a.location[1]) < 0.35) hit.add(i).add(j); }));
    // Only bonds up to three bonds from them, so a long chain is not turned over at each of its bonds.
    const close = new Map([...hit].map((i) => [i, 0]));
    for (const [x, d] of close) if (d < 3) for (const y of at[x]) if (!close.has(y)) close.set(y, d + 1);
    for (const { atoms: [u, v], type } of m.bonds) {
      if (type !== 1 || !close.has(u) || !close.has(v) || inRing(at, u, v)) continue;
      const side = new Set([v]), next = [v];
      for (let x = next.pop(); x !== undefined; x = next.pop()) for (const y of at[x]) if (y !== u && !side.has(y)) { side.add(y); next.push(y); }
      const small = 2 * side.size <= n, group = (i: number) => side.has(i) === small;
      if (![...hit].some(group)) continue;
      // Turned over about the bond, or turned round its end on the rest's side by up to 30°.
      const [p, q] = [best.atoms[u].location, best.atoms[v].location], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      const o = small ? p : q, relabel = [...labelled].some(group);
      for (const turn of [NaN, 10, -10, 20, -20, 30, -30]) {
        if (left-- <= 0) return best;
        const c = Math.cos((turn * Math.PI) / 180), sn = Math.sin((turn * Math.PI) / 180);
        const trial = { ...best, atoms: best.atoms.map((a, i) => {
          if (!group(i)) return a;
          const r = [a.location[0] - o[0], a.location[1] - o[1]], k = 2 * (r[0] * d[0] + r[1] * d[1]);
          const to = Number.isNaN(turn) ? [o[0] + k * d[0] - r[0], o[1] + k * d[1] - r[1]] : [o[0] + c * r[0] - sn * r[1], o[1] + sn * r[0] + c * r[1]];
          return { ...a, location: [to[0], to[1], 0] as [number, number, number] };
        }) };
        const s = crowding(trial, inkHits(trial, ink));
        if (s >= now) continue;
        // Its labels as render() places them once the group has turned: still better?
        const fresh = relabel ? inkBoxes(trial) : ink, sure = relabel ? crowding(trial, inkHits(trial, fresh)) : s;
        if (sure < now) [best, now, ink] = [trial, sure, fresh];
      }
    }
    if (now === was) break;
  }
  return best;
}
// The drawing with each unlabelled carbon that lies on a bond (the structure check's near warning) moved off it, each
// label off a bond or another label (by its point and by its ink, overLabels), and atoms off each other. First the atom
// (with its end atoms) is moved straight away from the bond, or the bond's two atoms away from it, to 0.2, 0.3 or 0.4 of
// a bond length (a label, 0.15 further, or past its ink); two labels or atoms are moved apart. Where none of those helps
// (a cage too tangled to draw flat, such as hypercubane), each of the three atoms is stepped 0.1 or 0.2 of a bond length
// in eight directions. A move is kept where it leaves fewer atoms crowded (crowding, labels counting least), or as many
// but further from the bonds they are near and less deep in labels' ink (slack). Six times round at most.
const MOST_NUDGED = 8, crowding = (m: Mol, hits?: unknown[]) => { const [bare, all, pairs, lines, labels] = crowds(m, 0.15, 0.35, true, hits); return 1000 * (bare + lines) + all + pairs + lines + labels / 1e4; };
// The atoms whose moves can change where render() puts a label's H and charge: the labelled atoms (by ink) and the
// atoms bonded to them.
const nearLabels = (ink: Inks, at: number[][]) => new Set(ink.flatMap((b, i) => (b ? [i, ...at[i]] : [])));
const unlabelled = (m: Mol) => (i: number) => m.atoms[i].label === "C" && !m.atoms[i].text;
// ink: with how far each label would have to move to clear the bonds and labels over its ink (inkHits), so a label
// can be stepped clear.
function slack(m: Mol, ink?: Inks, hits = ink && inkHits(m, ink)): number {
  let sum = 0;
  const plain = unlabelled(m);
  besideBonds(m, LABEL, () => true, (i, gap) => { const reach = plain(i) ? 0.25 : LABEL; if (gap < reach) sum += reach - gap; });
  if (!ink || !hits) return sum;
  const xy = m.atoms.map((a) => a.location);
  for (const [i, u, v] of hits) {
    const p = xy[i];
    if (v < 0) {
      const q = xy[u], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      sum += d < 1e-6 ? 1 : Math.max(0, clearing(ink[i], ink[u], (q[0] - p[0]) / d, (q[1] - p[1]) / d) - d);
      continue;
    }
    const [s, t] = [xy[u], xy[v]], dx = t[0] - s[0], dy = t[1] - s[1], f = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / (dx * dx + dy * dy || 1)));
    const ox = p[0] - s[0] - f * dx, oy = p[1] - s[1] - f * dy, d = Math.hypot(ox, oy);
    sum += d < 1e-6 ? 1 : Math.max(0, toward(ink[i], -ox / d, -oy / d) - d);
  }
  return sum;
}
// How far a label's ink b reaches from its atom in direction (x, y); and how far along (x, y) from label box a label
// box b must sit for the two to clear.
const toward = (b: Box | undefined, x: number, y: number) => (b ? Math.max(b[0] * x, b[2] * x) + Math.max(b[1] * y, b[3] * y) : 0);
function clearing(a: Box | undefined, b: Box | undefined, x: number, y: number): number {
  if (!a || !b) return 0;
  const need = (lo: number, hi: number, blo: number, bhi: number, d: number) => (d > 1e-9 ? (hi - blo) / d : d < -1e-9 ? (bhi - lo) / -d : Infinity);
  return Math.min(need(a[0], a[2], b[0], b[2], x), need(a[1], a[3], b[1], b[3], y));
}
// A label covers about 0.3 of a bond length round its atom. Labels drawn over a bond they are not part of, or over
// another label they are not bonded to: [atom, bond's atom, bond's other atom] for each, or [atom, other atom, -1].
// ink: each label's box as drawn (inkBoxes), whose overlaps (inkHits) count too.
const LABEL = 0.3;
function overLabels(m: Mol, ink?: Inks): [number, number, number][] {
  const xy = m.atoms.map((a) => a.location), shown = (i: number) => !unlabelled(m)(i), at = bondedTo(m), out: [number, number, number][] = [];
  besideBonds(m, LABEL, shown, (i, _, u, v) => out.push([i, u, v]));
  const grid = cells(xy, shown);
  xy.forEach((p, i) => {
    if (!shown(i)) return;
    for (let x = Math.floor(p[0]) - 1; x <= Math.floor(p[0]) + 1; x++) for (let y = Math.floor(p[1]) - 1; y <= Math.floor(p[1]) + 1; y++)
      for (const j of grid.get(cell(x, y)) ?? []) if (j > i && !at[i].includes(j) && Math.hypot(xy[j][0] - p[0], xy[j][1] - p[1]) < 2 * LABEL) out.push([i, j, -1]);
  });
  if (!ink) return out;
  const seen = new Set(out.map((h) => h.join()));
  return out.concat(inkHits(m, ink).filter((h) => !seen.has(h.join())));
}
// A label's ink as render() draws it, in ACS Document 1996 (Arial 10 pt labels on 14.4 pt bonds) with Arial's own
// glyph metrics, so a structure is drawn the same on any computer: for each labelled atom, the box round its element,
// its H atoms and their count, and its charge, on the side render() puts them (OH or HO, the indole NH stacked), in bond
// lengths from its atom, y up, and GAP wider all round, so no bond passes within GAP of a label's ink and no two labels
// come within twice GAP (2 px at 100%). The repairs move atoms a step at a time: a label keeps its box as its atom
// moves, and the boxes are read again after each move that turns a bond at a label. As the editor draws it: a bond
// length (1) is a bond's length in the style, so a label scaled with its atom (scale) is measured at its size.
type Inks = (Box | undefined)[];
const GAP = 0.05;
const PT = 4 / 3, ACS = { bond: 14.4 * PT, line: 0.6 * PT, bold: 2 * PT, spacing: 0.18 * 14.4 * PT, hash: 2.5 * PT, margin: 1.6 * PT, size: 10 * PT }, arial = arialInk(ACS.size);
function inkBoxes(m: Mol): Inks {
  const d = labelInk(m, ACS, arial, ACS.bond), k = d.scale;
  return d.label.map((b, i) => {
    if (!b) return undefined;
    const [x, y] = m.atoms[i].location;
    return [b[0] / k - x - GAP, -b[3] / k - y - GAP, b[2] / k - x + GAP, -b[1] / k - y + GAP];
  });
}
// Labels whose ink a bond they are not part of crosses, [atom, bond's atom, bond's other atom], and labels whose ink
// overlaps another's, [atom, other atom, -1]: as overLabels gives them. Each label's box is filed under the cells (a
// bond length square) it covers, so each bond or label tests only the labels in the cells it covers, each once (seen).
function inkHits(m: Mol, ink: Inks): [number, number, number][] {
  const out: [number, number, number][] = [], shown: number[] = [], box: Box[] = [], grid = new Map<number, number[]>();
  const cover = (b: Box, visit: (key: number) => void) => { for (let x = Math.floor(b[0]); x <= Math.floor(b[2]); x++) for (let y = Math.floor(b[1]); y <= Math.floor(b[3]); y++) visit(cell(x, y)); };
  ink.forEach((b, i) => {
    if (!b) return;
    const [x, y] = m.atoms[i].location, c: Box = [x + b[0], y + b[1], x + b[2], y + b[3]], k = shown.length;
    shown.push(i), box.push(c);
    cover(c, (key) => { grid.get(key)?.push(k) ?? grid.set(key, [k]); });
  });
  if (!shown.length) return out;
  const seen = new Int32Array(shown.length).fill(-1);
  m.bonds.forEach(({ atoms: [u, v] }, n) => {
    const s = m.atoms[u].location, t = m.atoms[v].location, x0 = Math.min(s[0], t[0]), x1 = Math.max(s[0], t[0]), y0 = Math.min(s[1], t[1]), y1 = Math.max(s[1], t[1]);
    cover([x0, y0, x1, y1], (key) => {
      for (const k of grid.get(key) ?? []) {
        if (seen[k] === n) continue;
        seen[k] = n;
        const b = box[k], i = shown[k];
        if (b[0] < x1 && x0 < b[2] && b[1] < y1 && y0 < b[3] && i !== u && i !== v && through(s, t, b)) out.push([i, u, v]);
      }
    });
  });
  seen.fill(-1);
  box.forEach((b, k) => cover(b, (key) => {
    for (const q of grid.get(key) ?? []) {
      if (q <= k || seen[q] === k) continue;
      seen[q] = k;
      const c = box[q];
      if (b[0] < c[2] && c[0] < b[2] && b[1] < c[3] && c[1] < b[3]) out.push([shown[k], shown[q], -1]);
    }
  }));
  return out;
}
// Does the segment from a to b cross the box [x0, y0, x1, y1]?
function through(a: number[], b: number[], [x0, y0, x1, y1]: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (!p) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); }
  }
  return true;
}
// free: the atoms that may move (unset, all).
function nudged(m: Mol, free?: Set<number>): Mol {
  const at = bondedTo(m), steps = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
  let best = m, ink = inkBoxes(m), now = [crowding(m, inkHits(m, ink)), slack(m, ink)], left = Math.ceil(REPAIR_WORK / m.atoms.length);
  // firm (a label's move): no bond it stretches may end up shorter than 0.75 or longer than 1.3 of a bond length, or
  // than the drawing's shortest and longest bonds (but those to a drawn H), unless it was further out before.
  const length = (x: Mol, [u, v]: number[]) => Math.hypot(x.atoms[u].location[0] - x.atoms[v].location[0], x.atoms[u].location[1] - x.atoms[v].location[1]);
  const heavy = m.bonds.filter(({ atoms: b }) => b.every((i) => m.atoms[i].label !== "H")).map((b) => length(m, b.atoms));
  const [lo, hi] = [Math.min(0.75, ...heavy), Math.max(1.3, ...heavy)], out = (l: number) => (l < lo ? lo - l : l > hi ? l - hi : 0);
  const moving = (moved: Set<number>, x: number, y: number) => ({ ...best, atoms: best.atoms.map((a, j) => (moved.has(j) ? { ...a, location: [a.location[0] + x, a.location[1] + y, 0] as [number, number, number] } : a)) });
  const stretched = (moved: Set<number>, trial: Mol) => m.bonds.some(({ atoms: b }) => moved.has(b[0]) !== moved.has(b[1]) && out(length(trial, b)) > out(length(best, b)) + 1e-9);
  const worse = (c: number, sl: number, than = now) => c > than[0] || (c === than[0] && sl >= than[1] - 1e-9);
  // The crowding and slack of a trial drawing with these label boxes.
  const score = (trial: Mol, ink: Inks) => { const hits = inkHits(trial, ink), c = crowding(trial, hits); return [c, c > now[0] ? Infinity : slack(trial, ink, hits)]; };
  const tried = (moved: Set<number>, x: number, y: number, firm = false) => {
    if ((free && [...moved].some((j) => !free.has(j))) || left-- <= 0) return false;
    const trial = moving(moved, x, y);
    if (firm && stretched(moved, trial)) return false;
    let [c, sl] = score(trial, ink), fresh = ink;
    if (worse(c, sl)) return false;
    // A move that turns a bond at a label (moves a label and not all its neighbours, or a neighbour and not the label)
    // can change the side render() puts its H and charge on: the labels are placed again, and the move kept only if it
    // still helps.
    if ([...moved].some((k) => at[k].some((j) => !moved.has(j) && (ink[k] || ink[j])))) {
      fresh = inkBoxes(trial), [c, sl] = score(trial, fresh);
      if (worse(c, sl)) return false;
    }
    [best, now, ink] = [trial, [c, sl], fresh];
    return true;
  };
  const ends = (i: number) => new Set([i, ...at[i].filter((j) => at[j].length === 1)]);
  function* groups(i: number) {
    yield ends(i);
    for (const j of at[i]) {
      if (at[j].length === 1 || inRing(at, i, j)) continue;
      const side = new Set([i]), next = [i];
      for (let x = next.pop(); x !== undefined; x = next.pop()) for (const y of at[x]) if (y !== j && !side.has(y)) { side.add(y); next.push(y); }
      if (2 * side.size <= m.atoms.length) yield side;
    }
  }
  // An atom i within reach of the bond from u to v moved off it. label: i's label, whose ink must clear the bond too.
  const off = (i: number, u: number, v: number, reach: number, label = false) => {
    // The point on the bond nearest the atom, and the atom's offset from it.
    const [s, t, p] = [u, v, i].map((k) => best.atoms[k].location), dx = t[0] - s[0], dy = t[1] - s[1], l = Math.hypot(dx, dy) || 1;
    const f = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / (l * l)));
    const ox = p[0] - s[0] - f * dx, oy = p[1] - s[1] - f * dy, d = Math.hypot(ox, oy);
    // Away from the bond, or either way square to it for an atom right on it; a label as far as its ink reaches back
    // towards the bond, and 0.05 more.
    const ways = (d > 1e-6 ? [[ox / d, oy / d]] : [[-dy / l, dx / l], [dy / l, -dx / l]]).map(([x, y]) => [x, y, label ? Math.max(reach, toward(ink[i], -x, -y) + 0.05) : reach]);
    if (ways.every(([, , r]) => d >= r)) return;
    let moved = false;
    for (const [x, y, r] of ways) for (const to of [0.2, 0.3, 0.4]) for (const [group, k] of [[ends(i), to + r - 0.15 - d], [new Set([u, v]), d - to - r + 0.15]] as const) if (tried(group, k * x, k * y, label)) moved = true;
    if (!moved) for (const k of [i, u, v]) for (const r of [0.1, 0.2]) for (const [x, y] of steps) tried(new Set([k]), r * x, r * y, label);
  };
  // An end atom k turned round the atom it hangs from by up to 45°, its bond keeping its length.
  const swung = (k: number) => at[k].length === 1 && [15, -15, 30, -30, 45, -45].some((turn) => {
    const o = best.atoms[at[k][0]].location, p = best.atoms[k].location, c = Math.cos((turn * Math.PI) / 180), sn = Math.sin((turn * Math.PI) / 180);
    return tried(new Set([k]), o[0] + c * (p[0] - o[0]) - sn * (p[1] - o[1]) - p[0], o[1] + sn * (p[0] - o[0]) + c * (p[1] - o[1]) - p[1], true);
  });
  // Atoms i and j within reach of each other moved apart: either one, with its end atoms or with the side group it hangs
  // on (the smaller side of a bond out of the rings), or else stepped as above, or else (two labels side by side on
  // short bonds, as in a cyclodextrin) turned (swung). label: two labels, whose inks must clear too, by 0.05.
  const apart = (i: number, j: number, reach: number, label = false) => {
    const [p, q] = [i, j].map((k) => best.atoms[k].location), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < 1e-6) return;
    const [x, y] = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    if (label) reach = Math.max(reach, clearing(ink[i], ink[j], x, y) + 0.05);
    if (d >= reach) return;
    if ([0.05, 0.15].some((to) => [...groups(j)].some((g) => tried(g, (reach + to - d) * x, (reach + to - d) * y, true)) || [...groups(i)].some((g) => tried(g, (d - reach - to) * x, (d - reach - to) * y, true)))) return;
    for (const k of [i, j]) for (const r of [0.1, 0.2]) for (const [x, y] of steps) tried(ends(k), r * x, r * y, true);
    const [a, b, u, v] = [ink[i], ink[j], best.atoms[i].location, best.atoms[j].location];
    if (label && a && b && u[0] + a[0] < v[0] + b[2] && v[0] + b[0] < u[0] + a[2] && u[1] + a[1] < v[1] + b[3] && v[1] + b[1] < u[1] + a[3]) void (swung(j) || swung(i));
  };
  // Stuck with a label's ink still on a bond: the label stepped (as above) to where, as render() then places it, it lies
  // on the fewest bonds and labels, though no better yet (its H can change sides there, and the next round clear it).
  // Once for each label; the drawing from before is kept unless the rounds end better.
  const kicked = new Set<number>();
  let held: [Mol, Inks, number[]] | undefined;
  const kick = () => {
    for (const [i, , v] of inkHits(best, ink)) {
      if (v < 0 || kicked.has(i) || (free && !free.has(i))) continue;
      kicked.add(i);
      let pick: [Mol, Inks, number[]] | undefined;
      for (const r of [0.1, 0.2]) for (const [x, y] of steps) {
        const moved = new Set([i]), trial = moving(moved, r * x, r * y);
        if (left-- <= 0) continue;
        const fresh = inkBoxes(trial), hits = inkHits(trial, fresh), c = crowding(trial, hits);
        if (c <= now[0]) { const sl = slack(trial, fresh, hits); if (!pick || !worse(c, sl, pick[2])) pick = [trial, fresh, [c, sl]]; }
      }
      if (!pick) continue;
      held ??= [best, ink, now];
      [best, ink, now] = pick;
      return true;
    }
    return false;
  };
  // Six rounds at most, and one more for each kick.
  for (let round = 0; round < 6 + kicked.size; round++) {
    const was = now[1] + 1000 * now[0], hits: [number, number, number][] = [];
    besideBonds(best, 0.15, unlabelled(best), (i, _, u, v) => hits.push([i, u, v]));
    for (const [i, u, v] of hits) off(i, u, v, 0.15);
    // An atom in line with its two bonds stepped square to the line, either way, so its bonds bend and it shows.
    for (const i of linear(best, at)) {
      const [q, r] = at[i].map((k) => best.atoms[k].location), dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy) || 1;
      [0.15, 0.25, 0.35].some((d) => [1, -1].some((side) => tried(ends(i), (-side * d * dy) / l, (side * d * dx) / l)));
    }
    // Labels, and atoms on atoms, once no carbon is left on a bond or in line (the structure check's warnings): labels
    // apart to 0.65 or 0.75 of a bond length, atoms to 0.4 or 0.5.
    if (now[0] < 1000) {
      const labels = overLabels(best, ink), pairs: [number, number, number, boolean][] = labels.filter(([, , v]) => v < 0).map(([i, j]) => [i, j, 2 * LABEL, true]);
      best.atoms.forEach((a, i) => best.atoms.forEach((c, j) => { if (j > i && !at[i].includes(j) && Math.hypot(c.location[0] - a.location[0], c.location[1] - a.location[1]) < 0.35) pairs.push([i, j, 0.35, false]); }));
      for (const [i, u, v] of labels) if (v >= 0) off(i, u, v, LABEL, true);
      for (const [i, j, reach, label] of pairs) apart(i, j, reach, label);
    }
    if (now[1] + 1000 * now[0] === was && !(now[0] < 1000 && kick())) break;
  }
  return held && worse(now[0], now[1], held[2]) ? held[0] : best;
}
// A drawing whose wedges set some centres the other way from InChI ref, or set centres ref leaves open (its InChI
// differs from ref only in its /t, /m and /s layers): those wedges turned round, or made plain, and an H drawn for one
// (an atom after base) taken away. Centres are matched to the drawing's atoms through InChI's AuxInfo.
function mended(m: Mol, ref: string, base: number): Mol {
  const [inchi, aux] = toInchiAux(m)?.split("\n") ?? [], flat = (i: string) => i.replace(/\/[tms][^/]*/g, "");
  if (!inchi || !aux || flat(inchi) !== flat(ref)) return m;
  // By component: InChI's atom number to + or - as drawn (the /m layer applied), or ? where it is open.
  const order = (/\/N:([^/]*)/.exec(aux)?.[1] ?? "").split(";").map((c) => c.split(","));
  const parities = (i: string) => {
    const t = (/\/t([^/]*)/.exec(i)?.[1] ?? "").split(";"), mirror = (/\/m([^/]*)/.exec(i)?.[1] ?? "").split(".");
    return order.map((_, k) => new Map((t[k] ?? "").split(",").filter(Boolean).map((e): [number, string] => {
      const p = e.slice(-1);
      return [parseInt(e, 10), mirror[k] === "1" && p !== "?" ? (p === "+" ? "-" : "+") : p];
    })));
  };
  const want = parities(ref), got = parities(inchi), turn = new Set<number>(), plain = new Set<number>();
  got.forEach((g, k) => g.forEach((p, n) => {
    const atom = Number(order[k][n - 1]) - 1, w = want[k].get(n);
    if (p === "?" || !(atom >= 0)) return;
    if (w === "+" || w === "-") { if (w !== p) turn.add(atom); } else plain.add(atom);
  }));
  if (!turn.size && !plain.size) return m;
  const bonds = m.bonds.map((b) => (b.stereo !== 1 && b.stereo !== 6 ? b : turn.has(b.atoms[0]) ? { ...b, stereo: b.stereo === 1 ? 6 : 1 } : plain.has(b.atoms[0]) ? { ...b, stereo: undefined } : b));
  const gone = new Set(bonds.flatMap((b) => (!b.stereo && plain.has(b.atoms[0]) && b.atoms[1] >= base && m.atoms[b.atoms[1]].label === "H" ? [b.atoms[1]] : [])));
  const to = m.atoms.map((_, i) => i - [...gone].filter((g) => g < i).length);
  return { ...m, atoms: m.atoms.filter((_, i) => !gone.has(i)), bonds: bonds.filter((b) => !b.atoms.some((i) => gone.has(i))).map((b) => ({ ...b, atoms: [to[b.atoms[0]], to[b.atoms[1]]] as [number, number] })) };
}
// A cage's Schlegel diagram: its largest smallest ring as a regular polygon round the outside, every other ring atom at
// the centre of its neighbours (Tutte's drawing, which crosses no bonds), then once more with each bond pulling as hard
// as it is long, which evens out the bond lengths. Scaled to a median bond of 1; atoms out of the rings move with the
// ring atom they hang from.
function schlegel(m: Mol): Mol {
  const at = bondedTo(m), ringed = m.atoms.map((_, i) => at[i].some((j) => inRing(at, i, j)));
  let outer: number[] = [];
  for (const { atoms: [u, v] } of m.bonds) {
    const from = new Map([[u, -1]]), next = [u];
    for (let k = 0; k < next.length && !from.has(v); k++) for (const w of at[next[k]]) if (!from.has(w) && !(next[k] === u && w === v)) { from.set(w, next[k]); next.push(w); }
    const ring: number[] = [];
    if (from.has(v)) for (let x = v; x !== -1; x = from.get(x)!) ring.push(x);
    if (ring.length > outer.length) outer = ring;
  }
  const xy = m.atoms.map((a) => [a.location[0], a.location[1]]), r = 1 / (2 * Math.sin(Math.PI / outer.length));
  outer.forEach((i, k) => { xy[i] = [r * Math.cos((2 * Math.PI * k) / outer.length), r * Math.sin((2 * Math.PI * k) / outer.length)]; });
  const inner = m.atoms.map((_, i) => i).filter((i) => ringed[i] && !outer.includes(i));
  const settle = (pull: (i: number, j: number) => number) => {
    for (let k = 0; k < 500; k++) for (const i of inner) {
      let x = 0, y = 0, sum = 0;
      for (const j of at[i]) if (ringed[j]) { const w = pull(i, j); x += w * xy[j][0]; y += w * xy[j][1]; sum += w; }
      xy[i] = [x / sum, y / sum];
    }
  };
  settle(() => 1);
  const was = new Map(m.bonds.map((b) => [b.atoms.join(), Math.hypot(xy[b.atoms[0]][0] - xy[b.atoms[1]][0], xy[b.atoms[0]][1] - xy[b.atoms[1]][1])]));
  settle((i, j) => was.get(`${i},${j}`) ?? was.get(`${j},${i}`)!);
  const lengths = m.bonds.filter((b) => b.atoms.every((i) => ringed[i])).map((b) => Math.hypot(xy[b.atoms[0]][0] - xy[b.atoms[1]][0], xy[b.atoms[0]][1] - xy[b.atoms[1]][1])).sort((p, q) => p - q);
  const scale = 1 / (lengths[lengths.length >> 1] || 1), place = m.atoms.map((_, i) => (ringed[i] ? [xy[i][0] * scale, xy[i][1] * scale] : undefined));
  // Each atom out of the rings moves as the ring atom it hangs from does.
  for (let changed = true; changed;) {
    changed = false;
    m.atoms.forEach((a, i) => {
      if (place[i]) return;
      const j = at[i].find((k) => place[k]);
      if (j === undefined) return;
      place[i] = [place[j]![0] + a.location[0] - m.atoms[j].location[0], place[j]![1] + a.location[1] - m.atoms[j].location[1]];
      changed = true;
    });
  }
  return { ...m, atoms: m.atoms.map((a, i) => ({ ...a, location: [...(place[i] ?? [a.location[0], a.location[1]]), 0] as [number, number, number] })) };
}
// A double bond the text leaves open (E or Z not given, by a SMILES that sets other stereochemistry) is drawn crossed,
// so the drawing leaves it open too. A double bond in a ring of fewer than 8 atoms can only be Z, and stays plain, as
// does one in an aromatic ring (alternating).
function crossed(m: Mol, text: string): Mol {
  const own = toInchi(text), aux = toInchiAux(m)?.split("\n");
  if (!own || !aux || own === aux[0] || /\*/.test(aux[0])) return m;
  // A layer's entries by component (a structure of several molecules has one list each, between semicolons).
  const layer = (x: string, l: string) => (new RegExp(`/${l}([^/]*)`).exec(x)?.[1] ?? "").split(";").map((c) => c.split(",").filter(Boolean));
  const want = layer(own, "b"), got = layer(aux[0], "b"), order = layer(aux[1], "N:");
  const at = bondedTo(m), ends = new Set<string>();
  got.forEach((list, k) => {
    for (const e of list) {
      const pair = e.replace(/[-+?]$/, "");
      if (want[k]?.some((w) => w.replace(/[-+?]$/, "") === pair && !w.endsWith("?"))) continue;
      const [i, j] = pair.split("-").map((n) => Number(order[k]?.[Number(n) - 1]) - 1);
      if (i >= 0 && j >= 0) ends.add([i, j].sort((p, q) => p - q).join());
    }
  });
  // The fewest bonds from i to j other than the bond between them.
  const around = (i: number, j: number) => {
    const far = new Map([[i, 0]]), next = [i];
    for (let k = 0; k < next.length; k++) for (const y of at[next[k]]) if (!far.has(y) && !(next[k] === i && y === j)) { far.set(y, far.get(next[k])! + 1); next.push(y); }
    return far.get(j) ?? Infinity;
  };
  // Is the double bond from i to j on a ring of bonds alternately single and double (a porphyrin's, whose E or Z its
  // aromatic ring fixes)? A path from j back to i, single bond first, alternating, ending on a single bond.
  const kind = new Map(m.bonds.map((b) => [[...b.atoms].sort((p, q) => p - q).join(), b.type]));
  const alternating = (i: number, j: number) => {
    const seen = new Set([`${j},1`]), next: [number, number][] = [[j, 1]];
    for (let k = 0; k < next.length && k < 4000; k++) {
      const [x, want] = next[k];
      for (const y of at[x]) {
        if (kind.get([x, y].sort((p, q) => p - q).join()) !== want || (x === j && y === i)) continue;
        if (y === i) { if (want === 1) return true; continue; }
        const key = `${y},${3 - want}`;
        if (!seen.has(key)) { seen.add(key); next.push([y, 3 - want]); }
      }
    }
    return false;
  };
  const bonds = m.bonds.map((b) => (b.type === 2 && ends.has([...b.atoms].sort((p, q) => p - q).join()) && around(b.atoms[0], b.atoms[1]) + 1 >= 8 && !alternating(b.atoms[0], b.atoms[1]) ? { ...b, display: "either" as const } : b));
  const out = { ...m, bonds };
  return bonds.some((b, k) => b !== m.bonds[k]) && toInchi(out) === own ? out : m;
}
// Does InChI i differ from r only in double bonds r leaves open (a ? in its b layer, or no entry)?
function opened(r: string, i?: string): boolean {
  if (!i) return false;
  const b = (x: string) => /\/b([^/]*)/.exec(x)?.[1].split(",") ?? [], rest = (x: string) => x.replace(/\/b[^/]*/, "");
  return rest(r) === rest(i) && b(r).filter((e) => !e.endsWith("?")).every((e) => b(i).includes(e));
}
// How many atoms lie within near of a bond they are not part of, or within close of another atom, plus the unlabelled
// carbons between two single bonds in a straight line (the structure check's warnings: an atom drawn so it cannot be
// seen). plain: only unlabelled carbons count as on a bond (a label is drawn over the bond).
function crowded(m: Mol, near: number, close: number, plain = false): number {
  const [bare, all, pairs, lines] = crowds(m, near, close);
  return (plain ? bare : all) + pairs + lines;
}
// crowded's counts: unlabelled carbons within near of a bond, all atoms so, pairs of atoms within close, atoms in line,
// and (labels) how many labels lie on bonds or labels (as overLabels counts them, and hits: those by ink, inkHits).
function crowds(m: Mol, near: number, close: number, labels = false, hits?: unknown[]): [number, number, number, number, number] {
  const xy = m.atoms.map((a) => a.location), bonded = bondedTo(m), single = m.atoms.map(() => true), on = new Set<number>(), plain = unlabelled(m);
  for (const b of m.bonds) if (b.type !== 1) single[b.atoms[0]] = single[b.atoms[1]] = false;
  let pairs = 0, lines = 0, over = 0;
  const reach0 = Math.max(near, labels ? LABEL : 0), far = Math.max(close, labels ? 2 * LABEL : 0);
  const grid = cells(xy, () => true), reach = Math.ceil(far);
  if (reach0) besideBonds(m, reach0, () => true, (i, gap) => { if (gap < near) on.add(i); if (labels && gap < LABEL && !plain(i)) over++; }, grid);
  xy.forEach((p, i) => {
    const cx = Math.floor(p[0]), cy = Math.floor(p[1]);
    if (far) for (let x = cx - reach; x <= cx + reach; x++) for (let y = cy - reach; y <= cy + reach; y++)
      for (const j of grid.get(cell(x, y)) ?? []) {
        if (j <= i) continue;
        const d = Math.hypot(xy[j][0] - p[0], xy[j][1] - p[1]);
        if (d < close) pairs++;
        if (labels && d < 2 * LABEL && !plain(i) && !plain(j) && !bonded[i].includes(j)) over++;
      }
  });
  lines = linear(m, bonded).length;
  if (labels && hits) over += hits.length;
  return [[...on].filter(plain).length, on.size, pairs, lines, over];
}
// The unlabelled carbons with two single bonds in a straight line (within 5°), which do not show (check.ts).
function linear(m: Mol, bonded = bondedTo(m)): number[] {
  const xy = m.atoms.map((a) => a.location), plain = unlabelled(m), single = m.atoms.map(() => true);
  for (const b of m.bonds) if (b.type !== 1) single[b.atoms[0]] = single[b.atoms[1]] = false;
  return xy.flatMap((p, i) => {
    if (bonded[i].length !== 2 || !plain(i) || m.atoms[i].charge || !single[i]) return [];
    const [q, r] = bonded[i], u = [xy[q][0] - p[0], xy[q][1] - p[1]], v = [xy[r][0] - p[0], xy[r][1] - p[1]];
    return (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1) < Math.cos((175 * Math.PI) / 180) ? [i] : [];
  });
}
// The atoms (those keep allows) by square cells a bond long, so each bond or atom tests only the atoms round it.
const cell = (x: number, y: number) => x * 4194304 + y;
function cells(xy: number[][], keep: (i: number) => boolean): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  xy.forEach((p, i) => { if (!keep(i)) return; const k = cell(Math.floor(p[0]), Math.floor(p[1])); grid.get(k)?.push(i) ?? grid.set(k, [i]); });
  return grid;
}
// Each atom that keep allows within reach of a bond it is not part of, with its distance from the bond and the bond.
// grid: the atoms keep allows by cell (cells), where the caller has them.
function besideBonds(m: Mol, reach: number, keep: (i: number) => boolean, visit: (i: number, gap: number, u: number, v: number) => void, grid?: Map<number, number[]>) {
  const xy = m.atoms.map((a) => a.location);
  grid ??= cells(xy, keep);
  for (const { atoms: [u, v] } of m.bonds) {
    const [s, t] = [xy[u], xy[v]], dx = t[0] - s[0], dy = t[1] - s[1];
    for (let x = Math.floor(Math.min(s[0], t[0]) - reach); x <= Math.floor(Math.max(s[0], t[0]) + reach); x++)
      for (let y = Math.floor(Math.min(s[1], t[1]) - reach); y <= Math.floor(Math.max(s[1], t[1]) + reach); y++)
        for (const i of grid.get(cell(x, y)) ?? []) {
          if (i === u || i === v) continue;
          const p = xy[i], f = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / (dx * dx + dy * dy || 1)));
          const gap = Math.hypot(s[0] + f * dx - p[0], s[1] + f * dy - p[1]);
          if (gap < reach) visit(i, gap, u, v);
        }
  }
}
// Pairs of bonds that cross (and share no atom).
function crossings(m: Mol): number {
  const xy = m.atoms.map((a) => a.location), side = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  let n = 0;
  m.bonds.forEach((b, k) => {
    const [p, q] = [xy[b.atoms[0]], xy[b.atoms[1]]];
    for (const c of m.bonds.slice(k + 1)) {
      if (c.atoms.some((i) => b.atoms.includes(i))) continue;
      const [r, s] = [xy[c.atoms[0]], xy[c.atoms[1]]];
      if (side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0) n++;
    }
  });
  return n;
}

// Is the bond from i to j in a ring (its ends joined without it)? at: each atom's neighbours.
function inRing(at: number[][], i: number, j: number): boolean {
  const next = at[i].filter((k) => k !== j), seen = new Set([i, ...next]);
  while (next.length) {
    const k = next.pop()!;
    if (k === j) return true;
    for (const l of at[k]) if (!seen.has(l)) { seen.add(l); next.push(l); }
  }
  return false;
}
// The handedness a drawing gives a tetrahedral centre: the signed volume its neighbours make, in atom order (with the
// centre itself in place of an implicit H, which lies on the same side of the other three), each raised by z: a
// bond length towards the viewer at a wedge's wide end, away at a hash's. Near 0 when the drawing does not set it.
function handed(m: Mol, c: number, around: number[], z: (j: number) => number): number {
  const [a, b, d, e] = (around.length === 3 ? [...around, c] : around).map((j) => [m.atoms[j].location[0], m.atoms[j].location[1], j === c ? 0 : z(j)]);
  const [u, v, w] = [b, d, e].map((p) => [p[0] - a[0], p[1] - a[1], p[2] - a[2]]);
  return u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
}
// A centre whose wedges placeWedges may move: single bonds to three or four atoms, and a wedge or hash that starts at it.
const tetrahedral = (c: number, bonds: Mol["bonds"]) => bonds.length >= 3 && bonds.length <= 4 && bonds.every((b) => b.type === 1) && bonds.some((b) => b.atoms[0] === c && (b.stereo === 1 || b.stereo === 6));
// Each such centre's handedness as its wedges and hashes draw it (1 or -1), by atom.
function wedgeHands(m: Mol): Map<number, number> {
  const out = new Map<number, number>(), at = bondedTo(m);
  m.atoms.forEach((_, c) => {
    const bonds = m.bonds.filter((b) => b.atoms.includes(c));
    if (!tetrahedral(c, bonds)) return;
    const z = (j: number) => { const b = bonds.find((x) => x.atoms[0] === c && x.atoms[1] === j); return b?.stereo === 1 ? 1 : b?.stereo === 6 ? -1 : 0; };
    const h = handed(m, c, [...at[c]].sort((p, q) => p - q), z);
    if (Math.abs(h) > 1e-6) out.set(c, Math.sign(h));
  });
  return out;
}
// Room for a new atom at q bonded to c: no atom within half a bond of it (a labelled atom, 0.7 of a bond), no bond
// within 0.4 of a bond of it (its H label would sit on the bond), and its bond near no other atom and across no bond.
function roomy(atoms: Mol["atoms"], bonds: Mol["bonds"], c: number, q: number[]): boolean {
  const p = atoms[c].location, side = (a: number[], b: number[], r: number[]) => (b[0] - a[0]) * (r[1] - a[1]) - (b[1] - a[1]) * (r[0] - a[0]);
  // The distance from r to the segment from a to b.
  const gap = (r: number[], a = p, b = q) => { const dx = b[0] - a[0], dy = b[1] - a[1], f = Math.max(0, Math.min(1, ((r[0] - a[0]) * dx + (r[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(a[0] + f * dx - r[0], a[1] + f * dy - r[1]); };
  return atoms.every((a, i) => i === c || (Math.hypot(a.location[0] - q[0], a.location[1] - q[1]) >= (a.label === "C" && !a.text ? 0.5 : 0.7) && gap(a.location) >= 0.3))
    && bonds.every((b) => { const [r, s] = b.atoms.map((i) => atoms[i].location); return b.atoms.includes(c) || (gap(q, r, s) >= 0.4 && !(side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0)); });
}
// One wedge or hash for each centre, where ChemDraw puts it: on a bond out of the rings to an atom that is not a
// stereocentre, else on an H drawn on the centre (the centre's own), else on a ring bond to an atom that is not a
// stereocentre. Only where there is no other choice does it join two stereocentres, which does not show which one it
// sets. Its narrow end is always at the centre, and it draws the hand the centre had (hands, by atom). A centre that
// cannot be a stereocentre (a CH2 a SMILES marks @) loses its wedge.
function placeWedges(m: Mol, hands: Map<number, number>, stereo = stereoFacts(m).centres): Mol {
  if (!hands.size) return m;
  const atoms = [...m.atoms], at = bondedTo(m);
  const was = new Set(hands.keys()), own = (b: Mol["bonds"][number]) => was.has(b.atoms[0]) && (b.stereo === 1 || b.stereo === 6);
  hands = new Map([...hands].filter(([c]) => stereo.has(c)));
  const bonds = m.bonds.map((b) => (own(b) ? { ...b, stereo: undefined } : b));
  const taken = new Set(bonds.filter((b) => b.stereo).flatMap((b) => [b.atoms.join(), [...b.atoms].reverse().join()]));
  const ring = (i: number, j: number) => inRing(at, i, j);
  const xy = (i: number) => atoms[i].location;
  // The centres bonded only to other centres choose first, as they have the fewest choices.
  const free = (c: number) => at[c].filter((j) => !stereo.has(j)).length;
  for (const [c, hand] of [...hands].sort((p, q) => free(p[0]) - free(q[0]) || p[0] - q[0])) {
    const around = [...at[c]].sort((p, q) => p - q), kept = m.bonds.filter((b) => b.atoms[0] === c && own(b));
    // Indigo's own wedge stays where it is one ChemDraw would draw.
    if (kept.length === 1 && !stereo.has(kept[0].atoms[1]) && !ring(c, kept[0].atoms[1])) { bonds[m.bonds.indexOf(kept[0])] = kept[0]; continue; }
    // A wide end on a stereocentre that gets no wedge of its own would also read as setting that centre: it goes last.
    const options = around.filter((j) => !taken.has(`${c},${j}`)).map((j) => ({ j, rank: stereo.has(j) ? (hands.has(j) ? 3 : 4) : ring(c, j) ? 2 : 0, ends: at[j].length }));
    // The H goes out into the widest gap between the centre's bonds that has room for it (no atom near it, and its bond
    // near no atom and across no bond), shorter where it needs to be. With no room, there is no H. A centre with no H
    // of its own (a three-bonded N) gets none: a drawn H would give it a fourth bond.
    let h: [number, number, number] | undefined;
    if (around.length === 3 && hydrogens(atoms[c].label, atoms[c].charge ?? 0, 3) > 0) {
      const turns = around.map((j) => Math.atan2(xy(j)[1] - xy(c)[1], xy(j)[0] - xy(c)[0])).sort((p, q) => p - q);
      const ways = turns.map((t, k) => [(k < 2 ? turns[k + 1] : turns[0] + 2 * Math.PI) - t, t]).sort((p, q) => q[0] - p[0]);
      h = ways.flatMap(([gap, t]) => [0.8, 0.6].map((r): [number, number, number] => [xy(c)[0] + r * Math.cos(t + gap / 2), xy(c)[1] + r * Math.sin(t + gap / 2), 0])).find((q) => roomy(atoms, bonds, c, q));
      // Two of the bonds in line (a T): InChI reads a wedge on any bond as setting nothing, so the H goes first.
      if (h) options.push({ j: atoms.length, rank: ways[0][0] > (170 * Math.PI) / 180 ? -1 : 1, ends: 1 });
    }
    options.sort((p, q) => p.rank - q.rank || p.ends - q.ends);
    const set = options.some(({ j }) => {
      const added = j === atoms.length;
      if (added) atoms.push({ label: "H", location: h! });
      const v = handed({ ...m, atoms }, c, added ? [...around, j] : around, (k) => (k === j ? 1 : 0));
      if (Math.abs(v) < 0.1) { if (added) atoms.pop(); return false; }
      if (added) bonds.push({ type: 1, atoms: [c, j] });
      const k = added ? bonds.length - 1 : bonds.findIndex((b) => b.atoms.includes(c) && b.atoms.includes(j));
      bonds[k] = { ...bonds[k], atoms: [c, j], stereo: Math.sign(v) === hand ? 1 : 6 };
      taken.add(`${c},${j}`).add(`${j},${c}`);
      return true;
    });
    // No bond sets the centre clearly: Indigo's wedges stay.
    if (!set) for (const b of kept) bonds[m.bonds.indexOf(b)] = b;
  }
  return { ...m, atoms, bonds };
}

// Each label's group as Indigo reads it, kept by the label's text, so each label is read once. Not kept while Indigo
// is loading. Cleared when it grows large.
const labelGroups = new Map<string, Mol | undefined>();
function labelGroup(text: string): Mol | undefined {
  if (labelGroups.has(text)) return labelGroups.get(text);
  let frag: Mol | undefined;
  try { const smiles = labelSmiles(text); frag = smiles ? parseStructure(smiles) : undefined; } catch { frag = undefined; }
  if (!indigo) return frag;
  if (labelGroups.size >= 1000) labelGroups.clear();
  labelGroups.set(text, frag);
  return frag;
}
// Written labels (OMe, CO2Et, Ph) as real atoms, for chemistry. Each label's group is read by Indigo and joined
// where the label atom was. A label Octet cannot read (or Indigo cannot) stays as a pseudo-atom ("*"), so no label
// text can stop the drawing's chemistry.
export const expandLabels = (mol: Mol): Mol => expandWithOrigins(mol).mol;
// The same, with the drawn atom each expanded atom came from (a label's atoms all come from the label).
// bonded: a metallocene keeps a bond from its metal to each ring atom, as any other η ring does (for NMR prediction).
// A residue's kept atoms moved as they are, its first atom onto the label at `here`.
const shiftOnto = (frag: Mol, here: readonly number[]) => { const o = frag.atoms[0].location; return (q: [number, number, number]): [number, number, number] => [q[0] - o[0] + here[0], q[1] - o[1] + here[1], 0]; };
export function expandWithOrigins(mol: Mol, bonded = false): { mol: Mol; from: number[] } {
  // A metallocene drawn with multi-centre attachments goes as its ions (metals.ts sandwichIons), as OPSIN draws it and
  // as its standard InChI has it: Fe2+ and two cyclopentadienide rings.
  const centres = mol.atoms.some((a) => a.centre), ions = centres && !bonded ? sandwichIons(mol) : undefined;
  if (ions) {
    const kept = mol.atoms.flatMap((a, i) => (a.centre ? [] : [i])), inner = expandWithOrigins(ions);
    return { mol: inner.mol, from: inner.from.map((j) => kept[j]) };
  }
  // A ring drawn in perspective (a chair's or a Haworth projection's bold and wedged edges) sets no stereocentre, and a
  // chair drawn flat sets its ring's centres by where each substituent points (edit.ts chairHydrogens): each such
  // centre gets an H with a wedge or hash, drawn from the centre (issue 46).
  const flat = perspectiveBonds(mol), hs = chairHydrogens(mol);
  if (flat.size || hs.length) mol = {
    ...mol, atoms: [...mol.atoms, ...hs.map((h): Mol["atoms"][number] => ({ label: "H", location: [h.at[0], h.at[1], 0] }))],
    bonds: [...mol.bonds.map((b, k) => (flat.has(k) ? { ...b, stereo: undefined } : b)), ...hs.map((h, n) => ({ type: 1, atoms: [h.centre, mol.atoms.length + n] as [number, number], stereo: h.stereo }))],
  };
  // The bonds are copied at the end, so no change below reaches the drawing's.
  let out: Mol = { atoms: mol.atoms.map((a) => ({ ...a })), bonds: [...mol.bonds] };
  const drawn = mol.atoms.length - hs.length, origin = mol.atoms.map((_, i) => (i < drawn ? i : hs[i - drawn].centre)), replaced = new Map<number, number>();
  // A multi-centre attachment (an η bond) is a bond from the atom bonded to it to each of its atoms (IR-10.2.5.1, as
  // complexes.ts names η ligands). Each of those atoms keeps the hydrogens it has without that bond, and the ring's
  // wedges and hashes, which draw it in perspective, set no stereocentre. A variable attachment's substituent is
  // joined to the first of its atoms: every positional isomer has the same formula.
  const used = centres ? mol.atoms.map(() => 0) : [];
  let dropped = false;
  if (centres) for (const b of mol.bonds) for (const k of b.atoms) if (!mol.atoms[b.atoms[0]].centre && !mol.atoms[b.atoms[1]].centre) used[k] += orderOf(b.type);
  mol.atoms.forEach((a, i) => {
    if (!a.centre) return;
    const ring = a.centre.atoms.filter((j) => mol.atoms[j] && !mol.atoms[j].centre), to = a.centre.variable ? ring[0] : undefined;
    if (to === undefined) {
      const partners = mol.bonds.flatMap((b) => (b.atoms.includes(i) ? [b.atoms[0] === i ? b.atoms[1] : b.atoms[0]] : [])).filter((j) => !mol.atoms[j].centre && !ring.includes(j));
      if (partners.length) {
        for (const r of ring) {
          const x = out.atoms[r];
          if (!x.text && x.implicitHCount === undefined) out.atoms[r] = { ...x, implicitHCount: hydrogens(x.label, x.charge ?? 0, used[r], x.radical) };
        }
        // A delocalised ring takes single and double bonds, as many doubles as fit (a Cp ring two, one CH left with
        // four bonds), so its atoms keep their hydrogens beside the bonds to the metal.
        const own = new Set(ring), inRing = (b: Mol["bonds"][number]) => own.has(b.atoms[0]) && own.has(b.atoms[1]);
        const delocalised = out.bonds.filter((b) => inRing(b) && b.type === AROMATIC), doubles = kekulise(delocalised.map((b) => b.atoms), ring);
        out.bonds = out.bonds.map((b) => {
          if (!inRing(b)) return b;
          const k = delocalised.indexOf(b), { stereo: _, ...flat } = b;
          return { ...flat, ...(k >= 0 ? { type: doubles[k] ? 2 : 1 } : {}) };
        });
        for (const j of partners) for (const r of ring) out.bonds.push({ type: 1, atoms: [j, r] });
      }
    }
    out.bonds = out.bonds.flatMap((b) => (!b.atoms.includes(i) ? [b] : to === undefined ? [] : [{ ...b, atoms: b.atoms.map((k) => (k === i ? to : k)) as [number, number] }]));
    out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined, centre: undefined, removed: true } as Mol["atoms"][number];
    dropped = true;
  });
  // Labels whose bonds say which of their kept atoms each one joins (a residue label): their kept atoms are the group.
  const ported = new Set<number>();
  for (const b of mol.bonds) if (b.ports) for (let e = 0; e < 2; e++) { const k = b.atoms[e]; if (b.ports[e] >= 0 && mol.atoms[k]?.inner?.atoms.length) ported.add(k); }
  mol.atoms.forEach((a, i) => {
    // A multi-centre point (an η ligand's) is not an atom: it and its bond are left out.
    if (a.centre) { out.atoms[i] = { ...out.atoms[i], removed: true } as Mol["atoms"][number]; dropped = true; return; }
    // An attachment point (wavy, diamond or star) or a polymer bead is not an atom either, but its bond takes up its
    // neighbour's valence: it is a pseudo-atom ("*"), which counts in no formula, mass or analysis.
    if (a.attach || a.bead) { out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined, isotope: undefined, charge: undefined }; return; }
    if (!a.text) return;
    // Characters raised or lowered by hand (Fe with III raised) are drawn, not read (chemicalText).
    const text = chemicalText(a.text, a.runs)!;
    const own = ported.has(i), frag = own ? a.inner : a.chemical === false ? undefined : labelGroup(text);
    if (!frag?.atoms.length) { out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined }; return; }
    // A residue's kept atoms go where they were drawn, moved so its first atom is on the label: its stereocentres stay
    // as drawn.
    const base = out.atoms.length, place = own ? shiftOnto(frag, mol.atoms[i].location) : labelPlacer(mol, i, frag);
    const port = (b: Mol["bonds"][number], e: number) => (own && b.ports && b.ports[e] >= 0 && b.ports[e] < frag.atoms.length ? b.ports[e] : 0);
    replaced.set(i, base);
    origin.push(...frag.atoms.map(() => i));
    // The group's first atom takes the label atom's place: bonds to the label atom move to it, and the group points
    // away from the rest as Expand Label draws it, so a wedge beside a label reads right. The kept group's atoms are
    // copied, so no change to the result can change it.
    out = {
      atoms: [...out.atoms, ...frag.atoms.map((x) => ({ ...x, location: place(x.location) }))],
      bonds: [
        ...(own ? out.bonds.map((b) => ({ ...b, atoms: b.atoms.map((k, e) => (k === i ? base + port(b, e) : k)) as [number, number] })) : out.bonds.map((b) => ({ ...b, atoms: b.atoms.map((k) => (k === i ? base : k)) as [number, number] }))),
        ...frag.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })),
      ],
    };
    out.atoms[base] = { ...out.atoms[base], charge: (out.atoms[base].charge ?? 0) + (a.charge ?? 0) || undefined };
    // A label of one element and its hydrogens (NH3, H2O) bonded to a metal keeps the hydrogens it shows: counted by
    // valence, the bond to the metal would leave NH2 and OH, where the drawing shows ammine and aqua ligands.
    const hx = /^(?:([A-Z][a-z]?)H(\d*)|H(\d*)([A-Z][a-z]?))$/.exec(text);
    if (hx && frag.atoms.length === 1 && frag.atoms[0].label === (hx[1] ?? hx[4]) && mol.bonds.some((b) => b.atoms.includes(i) && !NONMETAL.has(mol.atoms[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]].label)))
      out.atoms[base] = { ...out.atoms[base], implicitHCount: Number((hx[2] ?? hx[3]) || 1) };
    // A label with an oxidation state, Os(II), is the element; the state goes with the atom for its name.
    const ox = writtenOxidation(text);
    if (ox && frag.atoms.length === 1) out.atoms[base] = { ...out.atoms[base], ox: ox.ox };
    out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined, removed: true } as Mol["atoms"][number];
    dropped = true;
  });
  // Drop the label atoms that were replaced, renumbering bonds (and a kept stereo configuration's neighbours: a label's
  // is its group's first atom).
  // Nothing dropped (no label, multi-centre point or attachment): the numbers stay as they are (a bond to no atom
  // still goes).
  if (!dropped) {
    const count = out.atoms.length, at = (j: number) => (j >>> 0 === j && j < count ? j : undefined);
    return { mol: { atoms: out.atoms.map((a) => (a.kept ? renumberCentre(a, at) : a)), bonds: out.bonds.filter((b) => at(b.atoms[0]) !== undefined && at(b.atoms[1]) !== undefined).map((b) => ({ ...b, atoms: [b.atoms[0], b.atoms[1]] as [number, number] })) }, from: origin };
  }
  const keep = out.atoms.map((a) => !(a as { removed?: boolean }).removed), map: number[] = [];
  let next = 0;
  out.atoms.forEach((_, k) => { if (keep[k]) map[k] = next++; });
  const to = (j: number) => map[replaced.get(j) ?? j];
  return {
    mol: { atoms: out.atoms.filter((_, k) => keep[k]).map((a) => (a.kept ? renumberCentre(a, to) : a)), bonds: out.bonds.filter((b) => keep[b.atoms[0]] && keep[b.atoms[1]]).map((b) => ({ ...b, atoms: [map[b.atoms[0]], map[b.atoms[1]]] as [number, number] })) },
    from: origin.filter((_, k) => keep[k]),
  };
}

// The drawing as SMILES. Throws if Indigo can't read it (for example, a valence it rejects).
// A drawing as KET, with labels expanded into atoms. KET has no bond display styles (bold, wavy and so on).
// Hydrogen bonds are left out (they are not chemistry Indigo works out), unless hbonds asks for them; a quadruple
// bond, which Indigo has no type for, goes as a single bond. Without wedges (wedges false), Indigo also reads a
// drawing whose wedges it rejects: formulas and masses do not need them. keep: each atom's map number and enhanced
// stereo flag, and each bond's Rxn mark, go too, for MDL and reaction files. mol: the molecule with its labels
// expanded already.
type KetOptions = { wedges?: boolean; keep?: boolean; hbonds?: boolean; mol?: Mol };
function ketOf(drawn: Mol, { wedges = true, keep = false, hbonds = false, mol }: KetOptions = {}): string {
  const expanded = mol ?? expandLabels(hbonds || !drawn.bonds.some((b) => b.type === HBOND) ? drawn : { ...drawn, bonds: drawn.bonds.filter((b) => b.type !== HBOND) });
  return JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: ketMol(expanded, wedges, keep) });
}
function ketMol(mol: Mol, wedges: boolean, keep: boolean) {
  // A crossed double bond (E or Z not given) goes as KET's stereo 3, so its InChI, SMILES and molfile leave it open too.
  const bonds = mol.bonds.map(({ type, atoms, stereo, rxn, display }) => ({ type: type === QUADRUPLE ? 1 : type, atoms, ...(stereo && wedges ? { stereo } : type === 2 && display === "either" ? { stereo: 3 } : {}), ...(keep && rxn && RXCTR[rxn] !== undefined ? { center: RXCTR[rxn] } : {}) }));
  // An atom bonded to a metal keeps the hydrogens Octet draws on it (as render.ts counts them): Indigo would count the P
  // of a PPh3 bonded to Pd as PH (valence 5), where the drawing shows P. It goes to Indigo as the atom's valence: as a
  // hydrogen count, a drawing with an R group (a query) would write it into a molfile as a query feature.
  const used = mol.atoms.map(() => 0), metalled = mol.atoms.map(() => false);
  for (const b of mol.bonds) for (const [i, j] of [b.atoms, [b.atoms[1], b.atoms[0]]]) { used[i] += orderOf(b.type); if (b.type !== HBOND && !NONMETAL.has(mol.atoms[j].label)) metalled[i] = true; }
  const valence = (i: number, a: Mol["atoms"][number]) => Math.round(used[i]) + (a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical === 3 ? 2 : a.radical));
  // KET radicals: 1 a singlet, 2 one unpaired electron (doublet), 3 two (triplet). KET's stereo labels are Octet's
  // flags ("abs", "&1", "or1"). An atom with its hydrogens set (a caption read as an element, edit.ts withCaptionAtoms)
  // goes with its valence too, so Bi stays Bi and is not BiH3.
  const atoms = mol.atoms.map((a, i) => ({ label: a.label, location: a.location, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical === 3 ? 1 : a.radical + 1 } : {}), ...(a.isotope ? { isotope: a.isotope } : {}),
    ...((metalled[i] && NONMETAL.has(a.label)) || a.implicitHCount !== undefined ? { explicitValence: valence(i, a) } : {}),
    ...(keep && a.map ? { mapping: a.map } : {}), ...(keep && /^(abs|&\d+|or\d+)$/.test(a.enhanced ?? "") ? { stereoLabel: a.enhanced } : {}) }));
  return { type: "molecule", atoms, bonds };
}
// Only the end is trimmed: a molfile's first line (its name) is blank, and without it no program reads the file.
function convert(input: string, format: string, options: Record<string, string> = {}): string {
  const ind = engine(), opts = new ind.MapStringString();
  try {
    for (const [k, v] of Object.entries(options)) opts.set(k, v);
    return ind.convert(input, format, opts).trimEnd();
  } finally {
    opts.delete();
  }
}
export const toSmiles = (drawn: Mol): string => convert(ketOf(drawn), "smiles");
// The drawing's molecules as a molfile: V3000, as ChemDraw 26.1 saves it and Edit > Copy As MOL Text gives it, or
// V2000 (as ChemDraw puts it on the clipboard). A hydrogen bond is bond type 10 and a quadruple bond single, as
// ChemDraw writes them. Map numbers and enhanced stereo go too; V2000 has no enhanced stereo. A query or Markush structure is
// written as V3000 by Octet itself (molv3.ts), with its written labels drawn out as Indigo reads them; its V2000 is
// Indigo's, read from that.
export function toMolfile(drawn: Mol, v2000 = false): string {
  const mode = { "molfile-saving-mode": v2000 ? "2000" : "3000" };
  if (!hasQuery(drawn)) return convert(ketOf(drawn, { keep: true, hbonds: true }), "molfile", mode);
  const v3 = writeV3000(drawn, labelGroup);
  return v2000 ? convert(v3, "molfile", mode) : v3;
}
export const toInchiKey = (drawn: Mol): string => convert(ketOf(drawn), "inchi-key");
// An SD file: one record for each structure, as ChemDraw saves one. A drawing with R-group definitions is one record,
// so its definitions stay with it. A lone atom (methane, a label such as MeOH) is a record too; polymer brackets go
// with each record, where they enclose its atoms.
export function toSdf(drawn: Mol, v2000 = false): string {
  const parts = drawn.shapes?.some((sh) => sh.rgroup) ? [drawn] : fragments(drawn).map((g) => ({ ...pickAtoms(drawn, g), ...(drawn.shapes ? { shapes: drawn.shapes } : {}) }));
  return parts.map((p) => `${toMolfile(p, v2000)}\n$$$$\n`).join("");
}

// One step of a reaction, for RXN, RDF and reaction SMILES: its reactants, its products, and its agents (the structures
// drawn above and below its arrow), each a structure's atoms.
export type RxnStep = { reactants: number[][]; products: number[][]; agents: number[][] };
// A step as a KET reaction for Indigo: each structure keeps its own drawing, set in a row with plus signs between, the
// arrow after the reactants with the agents over it, then the products, so Indigo reads each part as the step says.
function reactionKet(drawn: Mol, step: RxnStep): string {
  const out: Record<string, unknown> = {}, nodes: unknown[] = [];
  let x = 0, k = 0;
  // A structure at x (its left edge), its middle at y; returns its width.
  const put = (atoms: number[], at: number, y = 0) => {
    const m = ketMol(expandLabels(pickAtoms(drawn, atoms)), true, true), xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
    const dx = at - Math.min(...xs), dy = y - (Math.min(...ys) + Math.max(...ys)) / 2;
    m.atoms = m.atoms.map((a) => ({ ...a, location: [a.location[0] + dx, a.location[1] + dy, 0] as [number, number, number] }));
    out[`mol${k}`] = m;
    nodes.push({ $ref: `mol${k++}` });
    return Math.max(...xs) - Math.min(...xs);
  };
  const row = (list: number[][]) => list.forEach((atoms, j) => { if (j) { nodes.push({ type: "plus", location: [x + 0.75, 0, 0] }); x += 1.5; } x += put(atoms, x) + 1.5; });
  row(step.reactants);
  const widths = step.agents.map((atoms) => { const xs = atoms.map((i) => drawn.atoms[i].location[0]); return Math.max(...xs) - Math.min(...xs); });
  const span = Math.max(3, widths.reduce((s, w) => s + w + 1, 1));
  let ax = x + (span - widths.reduce((s, w) => s + w + 1, -1)) / 2;
  step.agents.forEach((atoms, j) => { put(atoms, ax, 1.5); ax += widths[j] + 1; });
  nodes.push({ type: "arrow", data: { mode: "open-angle", pos: [{ x, y: 0, z: 0 }, { x: x + span, y: 0, z: 0 }] } });
  x += span + 1.5;
  row(step.products);
  return JSON.stringify({ root: { nodes }, ...out });
}
// Reactions as an RXN file (the first step), an RD file (every step, one record each) or reaction SMILES (one line
// for each step), with their map numbers. RXN and RD files are V3000, as ChemDraw 26.1 saves them, or V2000.
export function toReaction(drawn: Mol, steps: RxnStep[], kind: "rxn" | "rdf" | "smiles", v2000 = false): string {
  const mode = { "molfile-saving-mode": v2000 ? "2000" : "3000" };
  if (kind === "smiles") return steps.map((s) => convert(reactionKet(drawn, s), "smiles")).join("\n");
  if (kind === "rxn") return convert(reactionKet(drawn, steps[0]), "rxnfile", mode);
  const d = new Date(), two = (n: number) => String(n).padStart(2, "0");
  const date = `${two(d.getMonth() + 1)}/${two(d.getDate())}/${two(d.getFullYear() % 100)} ${two(d.getHours())}:${two(d.getMinutes())}`;
  return [`$RDFILE 1`, `$DATM    ${date}`, ...steps.flatMap((s) => ["$RFMT", convert(reactionKet(drawn, s), "rxnfile", mode)])].join("\n") + "\n";
}
// Generic labels as query atoms (any atom A, heteroatom Q, metal M, halogen X, and each with H, as ChemDraw's).
// SMILES cannot keep them; a molfile can, for a Reaxys search. undefined when the drawing has none.
// As ChemDraw 26.1 writes a molfile (CoreChemistry IsAcceptableGeneric): A, Q and X go as the atom symbol; the
// others go as a carbon with the label as its alias ("A  n" and the label on the next line).
const GENERIC = new Set(["A", "AH", "Q", "QH", "M", "MH", "X", "XH"]), SYMBOL = new Set(["A", "Q", "X"]);
export function toQueryMolfile(drawn: Mol): string | undefined {
  if (!drawn.atoms.some((a) => a.text && GENERIC.has(a.text))) return undefined;
  const generic = (a: Mol["atoms"][number]) => !!a.text && GENERIC.has(a.text);
  const query = { ...drawn, atoms: drawn.atoms.map((a) => (generic(a) ? { ...a, label: SYMBOL.has(a.text!) ? a.text! : "C", text: undefined } : a)) };
  const { mol, from } = expandWithOrigins(query);
  const aliases = drawn.atoms.flatMap((a, i) => (generic(a) && !SYMBOL.has(a.text!) ? [`A  ${String(from.indexOf(i) + 1).padStart(3)}`, a.text!] : []));
  // From the counts line on, under the header Reaxys was seen to read: a name, the program, a blank line.
  // (A V3000 molfile, for 1000 atoms or more, goes whole: no search link can hold it, and the app says so.)
  const lines = convert(ketOf(query, { hbonds: true, mol }), "molfile").split("\n"), at = lines.findIndex((l) => l.endsWith("V2000")), end = lines.lastIndexOf("M  END");
  return ["Octet", "  Octet", "", ...lines.slice(Math.max(0, at), end), ...aliases, ...lines.slice(end), ""].join("\n");
}
// CIP labels for a drawing's stereocentres (R, S, r, s) and double bonds (E, Z), in its atom and bond order, from
// Octet's own labeller (src/cip.ts). The namer takes these.
export function cipOf(drawn: Mol): Labels {
  const { mol, from } = expandWithOrigins(drawn);
  return onDrawing(drawn, mol, from, cipLabels(mol));
}
// Labels of a structure with its written labels expanded, on the drawn atoms and bonds. Atoms and bonds inside a
// written label (OMe, CO2Et) have no drawn place and are left out, and so is a double bond to a label.
function onDrawing(part: Mol, expanded: Mol, from: number[], labels: Labels, into?: Labels): Labels {
  const out = into ?? { atoms: part.atoms.map(() => undefined), bonds: part.bonds.map(() => undefined) };
  const drawn = (i: number) => !!part.atoms[i] && !part.atoms[i].text;
  labels.atoms.forEach((c, k) => { if (c && drawn(from[k])) out.atoms[from[k]] = c; });
  if (!labels.bonds.some(Boolean)) return out;
  const index = new Map(part.bonds.map((b, j) => [`${Math.min(...b.atoms)} ${Math.max(...b.atoms)}`, j]));
  labels.bonds.forEach((c, k) => {
    const [p, q] = expanded.bonds[k].atoms.map((i) => from[i]), j = index.get(`${Math.min(p, q)} ${Math.max(p, q)}`);
    if (c && j !== undefined && p !== q && drawn(p) && drawn(q)) out.bonds[j] = c;
  });
  return out;
}
// The structures (connected atoms) of a drawing, each with its atoms in order, its bonds, and a key for what its
// stereo labels depend on: its atoms (element, label, charge, radical, isotope, hydrogens set by hand, how the label
// reads, a configuration kept from ChemDraw, and place relative to its first atom) and bonds (with their stereo and display: a wavy bond or a crossed
// double bond has no label). Two structures with one key give the same labels, so labels kept by key are worked out
// again only for the structures an edit changes, wherever they are on the page.
function keyed(mol: Mol): { ids: number[]; bonds: number[]; key: string; part: () => Mol }[] {
  const groups = fragments(mol).map((g) => g.sort((a, b) => a - b)), of: number[] = [];
  groups.forEach((g, k) => g.forEach((i) => { of[i] = k; }));
  const bonds: number[][] = groups.map(() => []);
  mol.bonds.forEach((b, k) => bonds[of[b.atoms[0]]]?.push(k));
  return groups.map((ids, k) => {
    const local = new Map(ids.map((i, n) => [i, n])), o = mol.atoms[ids[0]].location;
    const atoms = ids.map((i) => {
      const a = mol.atoms[i];
      return [a.label, chemicalText(a.text, a.runs) ?? "", a.charge ?? 0, a.radical ?? 0, a.isotope ?? 0, a.implicitHCount ?? "", a.chemical === false ? 0 : 1, a.attach || a.bead ? 1 : 0, a.kept ? `${a.kept.atoms.map((j) => local.get(j) ?? j).join("/")}/${a.kept.marks}` : "", ...[0, 1, 2].map((d) => Math.round(((a.location[d] ?? 0) - (o[d] ?? 0)) * 1e4))].join(" ");
    });
    const bs = bonds[k].map((n) => { const b = mol.bonds[n]; return [b.type, b.stereo ?? 0, b.display ?? "", local.get(b.atoms[0]), local.get(b.atoms[1])].join(" "); });
    const part = (): Mol => ({ atoms: ids.map((i) => renumberCentre(mol.atoms[i], local)), bonds: bonds[k].map((n) => ({ ...mol.bonds[n], atoms: mol.bonds[n].atoms.map((i) => local.get(i)!) as [number, number] })) });
    return { ids, bonds: bonds[k], key: `${atoms.join(",")};${bs.join(",")}`, part };
  });
}
// Show Stereochemistry's labels, in the drawing's own atom and bond order: R, S (and r, s) on stereocentres, E, Z on
// double bonds (src/cip.ts), and M, P on the middle atom of an allene and on a biaryl's axis bond (src/axial.ts). Each
// structure is labelled on its own, and only once while it does not change. Written labels (OMe, CO2Et) are expanded
// first; stereocentres inside a label have no drawn atom and are left out.
type Labels = { atoms: (string | undefined)[]; bonds: (string | undefined)[] };
const labelled = new Map<string, Labels | null>(), STEREO_DISPLAYS = new Set(["hashed", "dashed", "bold", "hollow"]);
export function stereoLabels(drawn: Mol): Labels | undefined {
  const atoms: (string | undefined)[] = drawn.atoms.map(() => undefined), bonds: (string | undefined)[] = drawn.bonds.map(() => undefined);
  for (const { ids, bonds: own, key, part } of keyed(drawn)) {
    // A structure with no stereo bond (a wedge or hash, or a hashed, dashed or bold bond), double bond, depth, kept
    // configuration (from a ChemDraw file) or chair drawn flat (edit.ts chairHydrogens) has no R, S, E or Z.
    if (ids.length < 3 || !(own.some((k) => drawn.bonds[k].stereo || drawn.bonds[k].type === 2 || STEREO_DISPLAYS.has(drawn.bonds[k].display ?? "")) || ids.some((i) => drawn.atoms[i].kept || drawn.atoms[i].location[2])
      || (ids.length >= 7 && chairHydrogens(part()).length))) continue;
    const found = remembered(labelled, key, () => labelsOf(part()));
    found?.atoms.forEach((c, n) => { atoms[ids[n]] = c; });
    found?.bonds.forEach((c, n) => { bonds[own[n]] = c; });
  }
  return atoms.some(Boolean) || bonds.some(Boolean) ? { atoms, bonds } : undefined;
}
// One structure's labels, in its own atom and bond order.
function labelsOf(part: Mol): Labels | null {
  try {
    const { mol: expanded, from } = expandWithOrigins(part);
    const out = onDrawing(part, expanded, from, cipLabels(expanded), onDrawing(part, expanded, from, axialLabels(expanded)));
    return out.atoms.some(Boolean) || out.bonds.some(Boolean) ? out : null;
  } catch {
    return null;
  }
}
// Standard InChI, for telling whether two structures are the same. Undefined if Indigo cannot make one.
// A text's InChI is kept: parseStructure asks for it more than once.
const textInchis = new Map<string, string>();
export function toInchi(drawn: Mol | string): string | undefined {
  try {
    // An aromatic SMILES is made Kekulé as indigoLayout makes it (in a second, not a millisecond, for a fullerene).
    if (typeof drawn === "string") return lastUsed(textInchis, 8, drawn, () => convert(drawn, "inchi", { "dearomatize-on-load": "true", "dearomatize-verification": "false" })) || undefined;
    return convert(ketOf(drawn), "inchi") || undefined;
  } catch {
    return undefined;
  }
}
// Standard InChI and, on the next line, its AuxInfo (/N: InChI's atoms by the drawing's), for complexes.ts.
export function toInchiAux(drawn: Mol): string | undefined {
  try {
    return convert(ketOf(drawn), "inchi-aux") || undefined;
  } catch {
    return undefined;
  }
}

// A bond's type for a layout: a hydrogen or quadruple bond as a single bond, as Indigo has no type for them.
const shapeType = (type: number) => (type === HBOND || type === QUADRUPLE ? 1 : Math.min(type, 3));
// What Indigo knows of a drawing's stereocentres, for the stereochemistry warnings (check.ts), by drawn atom: the atoms
// that can be stereocentres (read with no wedges), those whose configuration the wedges and hashes do not set, and
// those whose wedges conflict (Indigo cannot read them). A wedge that starts at an atom that cannot be a stereocentre
// is left out of the second reading, as Indigo then lists no atoms. Only structures with a wedge or hash, Show
// Stereochemistry on, or an enhanced stereo flag are read. With `chiral`, structures with an and or or flag are also
// tested for chirality: one whose mirror image (each wedge made a hash) has the same InChI is not chiral. Each
// structure's answer is kept by its atoms and bonds, so an edit reads again only the structures it changed.
type Facts = { centres: number[]; unset: number[]; conflict: number[]; achiral: boolean };
const factsKept = new Map<string, Facts>();
export function stereoFacts(drawn: Mol, chiral = false): StereoFacts {
  const out: StereoFacts = { centres: new Set(), unset: new Set(), conflict: new Set(), achiral: new Set() };
  const wedge = (b: Mol["bonds"][number]) => b.stereo === 1 || b.stereo === 6, wedged = new Set(drawn.bonds.filter(wedge).flatMap((b) => b.atoms));
  const groups = fragments(drawn), groupOf = new Int32Array(drawn.atoms.length), bondsOf: Mol["bonds"][] = groups.map(() => []);
  groups.forEach((g, k) => { for (const i of g) groupOf[i] = k; });
  for (const b of drawn.bonds) bondsOf[groupOf[b.atoms[0]]].push(b);
  groups.forEach((group, k) => {
    if (!group.some((i) => wedged.has(i) || drawn.atoms[i].cip || drawn.atoms[i].enhanced)) return;
    const flagged = chiral && group.some((i) => /^(&|or)/.test(drawn.atoms[i].enhanced ?? ""));
    // The structure on its own (atoms in drawing order), and its key: what Indigo's answer depends on.
    const ids = [...group].sort((a, b) => a - b), local = new Map(ids.map((d, j) => [d, j]));
    const part: Mol = { atoms: ids.map((i) => renumberCentre(drawn.atoms[i], local)), bonds: bondsOf[k].map((b) => ({ ...b, atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!] as [number, number] })) };
    const key = JSON.stringify([part.atoms.map((a) => [a.label, chemicalText(a.text, a.runs), a.charge, a.isotope, a.radical, a.location[0], a.location[1]]), part.bonds.map((b) => [b.type, b.atoms, b.stereo]), flagged]);
    let f = factsKept.get(key);
    if (!f) {
      // Read with labels expanded; kept by the structure's own atoms (an atom inside a label is left out).
      const { mol, from } = expandWithOrigins(part), read = readFacts(mol, flagged);
      const own = (list: number[]) => list.flatMap((j) => (part.atoms[from[j]] && !part.atoms[from[j]].text ? [from[j]] : []));
      f = { centres: own(read.centres), unset: own(read.unset), conflict: own(read.conflict), achiral: read.achiral };
      if (factsKept.size > 500) factsKept.clear();
      factsKept.set(key, f);
    }
    for (const [list, set] of [[f.centres, out.centres], [f.unset, out.unset], [f.conflict, out.conflict]] as const) for (const j of list) set.add(ids[j]);
    if (f.achiral) for (const i of ids) out.achiral.add(i);
  });
  // A centre Show Stereochemistry labels is not unset or conflicting, whatever Indigo reads: Octet's labeller also
  // reads ChemDraw's other stereo bonds (a hashed, dashed or bold bond, a wedge's wide end; src/cip.ts).
  if ([...out.unset, ...out.conflict].some((i) => drawn.atoms[i]?.cip)) {
    const shown = stereoLabels(drawn);
    for (const set of [out.unset, out.conflict]) for (const i of set) if (drawn.atoms[i].cip && shown?.atoms[i]) set.delete(i);
  }
  return out;
}
// Each atom's symmetry class (atoms alike in the structure share one): element, charge and bonds, refined by neighbours.
// loose: element and bonds only, so atoms alike but for where a ring's double bonds and charge are drawn (a triazolium's
// two N) share one.
function classes(m: Mol, loose = false): number[] {
  const at = bondedTo(m), ord = m.atoms.map(() => 0);
  for (const b of m.bonds) for (const i of b.atoms) ord[i] += orderOf(b.type);
  let cls = m.atoms.map((a, i) => (loose ? `${a.label}:${at[i].length}` : `${a.label}${a.charge ?? 0}:${at[i].length}:${ord[i]}`)), count = new Set(cls).size;
  for (let k = 0; k < m.atoms.length; k++) {
    const next = cls.map((c, i) => `${c}|${at[i].map((j) => cls[j]).sort().join(",")}`), ids = new Map([...new Set(next)].map((x, q) => [x, String(q)]));
    cls = next.map((x) => ids.get(x)!);
    if (new Set(cls).size === count) break;
    count = new Set(cls).size;
  }
  return cls.map(Number);
}
function readFacts(mol: Mol, chiral: boolean): Facts {
  const ind = engine(), at = bondedTo(mol);
  // The atoms Indigo lists as stereocentres with no set configuration. Throws when the wedges conflict.
  const unsetOf = (m: Mol): number[] => {
    const opts = new ind.MapStringString();
    try {
      const said = JSON.parse(ind.check(ketOf(m), "stereo", opts)).stereo as string | undefined, list = said && /\(([\d,\s]+)\)/.exec(said);
      return list ? list[1].split(",").map(Number) : [];
    } finally {
      opts.delete();
    }
  };
  let centres: number[] = [];
  try { centres = unsetOf({ ...mol, bonds: mol.bonds.map((b) => ({ ...b, stereo: undefined })) }); } catch { /* no centres read */ }
  // Indigo also lists a planar N (an amide's, an aniline's, a nucleoside base's: N with a multiple bond, or next to an
  // atom with one), which is no stereocentre, so a wedge from a carbon to it gave a false "between" warning (issue #9).
  const multiple = (i: number) => mol.bonds.some((b) => b.atoms.includes(i) && orderOf(b.type) > 1);
  const planar = (i: number) => mol.atoms[i].label === "N" && mol.bonds.some((b) => b.atoms.includes(i) && (orderOf(b.type) > 1 || multiple(b.atoms[0] === i ? b.atoms[1] : b.atoms[0])));
  // A neutral amine N with three bonds inverts quickly, so it is no stereocentre either (LSD's N6, a tropane's N-methyl,
  // a ring fusion such as an indolizidine's), unless it is the bridgehead of a bridged ring system and cannot invert
  // (strychnine's N4, quinine's N1, Tröger's base). At a bridgehead, each two of its neighbours stay joined with the
  // third removed; at a ring fusion, the shared neighbour is the only way between the other two.
  const near = (i: number) => mol.bonds.flatMap((b) => (b.atoms.includes(i) ? [b.atoms[0] === i ? b.atoms[1] : b.atoms[0]] : []));
  // Are a and c joined other than through the atoms not, in at most most bonds, through atoms that pass via?
  const joined = (a: number, c: number, not: number[], most = Infinity, via = (_: number) => true) => {
    const far = new Map([[a, 0], ...not.map((x): [number, number] => [x, 0])]), next = [a];
    for (let k = 0; k < next.length; k++) {
      const x = next[k], d = far.get(x)! + 1;
      if (d > most) break;
      for (const y of near(x)) if (!far.has(y)) { if (y === c) return true; if (!via(y)) continue; far.set(y, d); next.push(y); }
    }
    return false;
  };
  // An ammonium N with an H (protonated) inverts as fast, through the amine.
  const amine = (i: number) => mol.atoms[i].label === "N" && (!mol.atoms[i].charge || mol.atoms[i].charge === 1) && near(i).length === 3;
  // A bridgehead of small rings (7 bonds round at most), which keeps its shape: a large ring's can turn in or out.
  // Three of its bonds are in rings, and each two of those neighbours stay joined with the third left out.
  const bridgehead = (i: number) => {
    const r = at[i].filter((j) => inRing(at, i, j));
    return r.length >= 3 && r.every((b) => { const [a, c] = r.filter((x) => x !== b); return joined(a, c, [i, b], 7); });
  };
  // A bridgehead N next to an aryl ring (Tröger's base) is still pyramidal; next to C=O (strychnine's lactam N1) it is
  // not, and nor is one in a ring of double bonds (a pyrrole's or an indole's N, as in K-252a).
  const ringed = (i: number) => near(i).filter(multiple).some((a, k, list) => list.slice(k + 1).some((c) => joined(a, c, [i], 4, multiple)));
  const amide = (i: number) => multiple(i) || ringed(i) || near(i).some((j) => mol.bonds.some((b) => b.atoms.includes(j) && orderOf(b.type) > 1 && mol.atoms[b.atoms[0] === j ? b.atoms[1] : b.atoms[0]].label !== "C"));
  centres = centres.filter((i) => (amine(i) ? bridgehead(i) && !amide(i) : !planar(i)));
  const can = new Set(centres), conflict: number[] = [];
  let kept: Mol = { ...mol, bonds: mol.bonds.map((b) => ((b.stereo === 1 || b.stereo === 6) && !can.has(b.atoms[0]) ? { ...b, stereo: undefined } : b)) }, unset: number[] = [];
  for (let k = 0; k < 8; k++) {
    try { unset = unsetOf(kept); break; } catch (err) {
      // "stereocenters: all 3 bonds up near stereoatom 0", "one bond up, one bond down -- indefinite case near atom 0"
      const at = /near (?:stereo)?atom (\d+)/.exec(String(err));
      if (!at) { unset = []; break; }
      const i = Number(at[1]);
      conflict.push(i);
      kept = { ...kept, bonds: kept.bonds.map((b) => (b.atoms[0] === i ? { ...b, stereo: undefined } : b)) };
    }
  }
  unset = unset.filter((i) => can.has(i));
  // Not unset after all. A P or S whose end O atoms (two or more) differ only by where the H or charge is (a phosphate's
  // P; a sulfoxide's S, with one, stays). An atom with three neighbours alike (a sarcophagine's bridgehead CH, whose
  // other choice is only to turn in, inside the cage). A ring atom with two ring neighbours alike and no other stereocentre in its
  // ring system (a 4-arylpiperidine's C4, whose N inverts). A bridgehead N with no wedge of its own, in a ring system
  // whose other set stereocentres set it (strychnine's N4, quinine's N1). In a ring system with nothing set, whose unset
  // centres are all bridgeheads or have two neighbours alike, every one when a bridgehead has two neighbours alike
  // (adamantane, cubane, DABCO, memantine, an adamantan-2-yl). Tröger's base, twistane, a tropane and camphor drawn with
  // no wedges stay unset.
  if (unset.length) {
    const rank = classes(mol), wedgedAt = new Set(mol.bonds.filter((b) => b.stereo === 1 || b.stereo === 6).map((b) => b.atoms[0]));
    const system = (i: number) => {
      const seen = new Set([i]), next = [i];
      for (let x = next.pop(); x !== undefined; x = next.pop()) for (const y of at[x]) if (!seen.has(y) && inRing(at, x, y)) { seen.add(y); next.push(y); }
      return seen;
    };
    const ends = (i: number) => at[i].filter((j) => at[j].length === 1 && /^(O|S|Se)$/.test(mol.atoms[j].label));
    const alike = (i: number) => new Set(at[i].map((j) => rank[j])).size < at[i].length;
    const heads = new Set(unset.filter(bridgehead)), drop = new Set<number>();
    for (const i of unset) {
      const e = ends(i), sys = system(i);
      if (/^(P|S|As|Se)$/.test(mol.atoms[i].label) && e.length >= 2 && new Set(e.map((j) => mol.atoms[j].label)).size < e.length) drop.add(i);
      else if (at[i].some((j) => at[i].filter((k) => rank[k] === rank[j]).length >= 3)) drop.add(i);
      else if (alike(i) && sys.size > 1 && centres.every((j) => j === i || !sys.has(j))) drop.add(i);
      else if (heads.has(i) || alike(i)) {
        const set = [...sys].some((j) => can.has(j) && !unset.includes(j));
        if (set ? heads.has(i) && mol.atoms[i].label === "N" && !wedgedAt.has(i) : unset.every((j) => !sys.has(j) || heads.has(j) || alike(j)) && [...heads].some((j) => sys.has(j) && alike(j))) drop.add(i);
      }
    }
    unset = unset.filter((i) => !drop.has(i));
    // Of the bridgeheads and atoms with two neighbours alike (or alike but for where the double bonds and charge are
    // drawn, as biapenem's C6' between a triazolium's two N) still left, those InChI reads no differently with a wedge
    // or a hash: alone and, for an atom that is not a bridgehead, with a wedge at each other unset atom (4-methyl-
    // cyclohexanol's C1 is a stereocentre once C4 is set). InChI does not know a cage holds its bridgeheads, so a
    // bridgehead is turned only alone, or with the others all at once (a tropane's). This leaves out a 3-substituted
    // quinuclidine's C4 and N1 and a symmetric dimer's middle carbon; Indigo lists them, but nothing can be set there.
    // InChI gives a three-bonded N no configuration, so an N asked about is read as a C (Tröger's base's stay).
    const loose = classes(mol, true), ask = unset.filter((i) => heads.has(i) || alike(i) || new Set(at[i].map((j) => loose[j])).size < at[i].length);
    if (ask.length) {
      const probe = { ...kept, atoms: kept.atoms.map((a, i) => (a.label === "N" && ask.includes(i) ? { ...a, label: "C" } : a)) };
      const as = (these: number[], flip: number[]) => {
        const bonds = [...kept.bonds], used = new Set<number>();
        for (const c of these) {
          const k = bonds.findIndex((b, j) => b.type === 1 && b.atoms.includes(c) && !b.stereo && !used.has(j));
          if (k < 0) continue;
          used.add(k);
          bonds[k] = { ...bonds[k], atoms: [c, bonds[k].atoms[0] === c ? bonds[k].atoms[1] : bonds[k].atoms[0]], stereo: flip.includes(c) ? 6 : 1 };
        }
        return toInchi({ ...probe, bonds });
      };
      const all = unset.filter((i) => heads.has(i)), together = all.length > 1 && as(unset, []) !== as(unset, all);
      const none = (i: number) => as([i], []) === as([i], [i]) && (heads.has(i) ? !together : as(unset, []) === as(unset, [i]));
      unset = unset.filter((i) => !ask.includes(i) || !none(i));
    }
    // The two bridgeheads of a bicyclic ring system with nothing else in it set or unset. A cage holds them: seen from
    // outside each one, its three bridges run one way round at one and the other way round at the other. Where that
    // reads as its own mirror image (norbornene, tropinone), there is nothing to set. A chiral one (norcamphor, camphor,
    // a 2,5-disubstituted bicyclo[2.2.2]octadiene) stays unset, as does any with another centre left open (tropine's C3).
    const pair = unset.filter((i) => heads.has(i)), [x, y] = pair, sys = pair.length === 2 ? system(x) : undefined;
    if (sys?.has(y) && !at[x].includes(y) && unset.every((i) => pair.includes(i) || !sys.has(i)) && ![...sys].some((j) => can.has(j) && !unset.includes(j))) {
      const rx = at[x].filter((j) => inRing(at, x, j));
      // The atom next to y on each bridge from x.
      const across = rx.map((r) => {
        if (at[y].includes(r)) return r;
        const from = new Map([[r, r]]), next = [r];
        for (let k = 0; k < next.length; k++) for (const z of at[next[k]]) if (!from.has(z) && z !== x && !rx.includes(z)) { if (z === y) return next[k]; from.set(z, next[k]); next.push(z); }
        return -1;
      });
      if (rx.length === 3 && new Set(across).size === 3 && !across.includes(-1)) {
        // The way round the three bridges go as drawn (each centre's out bond, its H or other atom, away from the viewer).
        const turn = (c: number, ns: number[]) => { const p = mol.atoms[c].location, a = ns.map((n) => Math.atan2(mol.atoms[n].location[1] - p[1], mol.atoms[n].location[0] - p[0])); return (a[1] - a[0] + 2 * Math.PI) % (2 * Math.PI) < (a[2] - a[0] + 2 * Math.PI) % (2 * Math.PI); };
        const out = (c: number, ring: number, away: boolean) => {
          const o = at[c].find((j) => !inRing(at, c, j)), b = mol.bonds.findIndex((q) => q.atoms.includes(c) && q.atoms.includes(o ?? ring));
          return { b, bond: { ...mol.bonds[b], atoms: [c, o ?? ring] as [number, number], stereo: (o === undefined) === away ? 1 : 6 } };
        };
        const ends = [out(x, rx[0], true), out(y, across[0], turn(x, rx) !== turn(y, across))];
        const bonds = kept.bonds.map((q, k) => ends.find((e) => e.b === k)?.bond ?? q), read = toInchi({ ...kept, bonds });
        const flipped = toInchi({ ...kept, bonds: bonds.map((q) => (q.stereo === 1 ? { ...q, stereo: 6 as const } : q.stereo === 6 ? { ...q, stereo: 1 as const } : q)) });
        if (read && /\/t[^/?]*\//.test(`${read}/`) && read === flipped) unset = unset.filter((i) => !pair.includes(i));
      }
    }
  }
  const mirror = (m: Mol): Mol => ({ ...m, bonds: m.bonds.map((b) => (b.stereo === 1 ? { ...b, stereo: 6 } : b.stereo === 6 ? { ...b, stereo: 1 } : b)) });
  const inchi = chiral ? toInchi(kept) : undefined;
  return { centres, unset, conflict, achiral: !!inchi && inchi === toInchi(mirror(kept)) };
}

// Clean Up's time. Indigo's clean-up (two passes of up to 1,000 rounds) costs about N^3 a round, from 0.27 s at 120
// atoms to 3 to 5 minutes at 1,000, and Indigo stops a pass only after 2 s. So Octet runs its own port of it
// (src/clean2d.ts): the same rounds at about N a round. Structures of up to about 40 atoms are cleaned as Indigo cleans
// them, to the end, in under 0.1 s. Each pass of a larger structure stops after WORK energy terms (40 to 90 ms on an
// M1 Pro), and several structures share 2 × WORK a pass. A count of work, not a time, so a drawing always cleans up
// the same, however busy the computer is (cleanup-geometry.check.ts failed under load when each pass stopped at 100 ms).
// A large structure drawn by hand may come out rougher than Indigo's would, and Clean Up again tidies it further, as in
// ChemDraw. SAFETY ms a pass is a last resort, for a structure whose work clean2d.ts misjudges (more than 10 times as
// slow as the count says): only then can the output change from run to run. A structure of more than MOST_CLEAN atoms
// is left as drawn (src/cleanup.check.ts).
const WORK = 7e6, SAFETY = 1000;
export const MOST_CLEAN = MOST_ATOMS;

// Clean Up Structure: bond lengths and angles straightened, structure by structure. Each structure the selection
// touches (or every structure, with nothing selected) is cleaned whole, scaled to one bond length per bond at the
// structure's own scale (the median of its atoms' scales, decision 0007), and kept centred where it was. A structure
// of more than MOST_CLEAN atoms is left as drawn.
// work: the energy terms each of the two passes may work out for one structure (see clean2d.ts); rounds: the rounds
// each may take. labels: then, as
// Name to Structure draws a structure, the labels whose ink a bond crosses or another label's touches are moved clear
// (nudged), structure by structure in bond lengths (its scale taken out), where it keeps its InChI. Name to Structure
// repairs its own drawings later (tidied), so it cleans up without.
export function cleanUp(mol: Mol, ids?: Set<number>, work = WORK, rounds?: number, labels = true): Mol {
  const atoms = mol.atoms.map((a) => ({ ...a }));
  // Structures joined by bonds alone; one with a multi-centre or variable attachment keeps its place (the attachment
  // sits at the centre of its atoms), and so does its ring (a π ligand drawn in perspective, not bonded to the point),
  // and so does one drawn in perspective (with depth: a chair, a Newman projection, a paddlewheel), as it is never
  // messy (check.ts). Flatten first to clean one up.
  const pi = new Set(mol.atoms.flatMap((a) => a.centre?.atoms ?? []));
  const groups = fragments(mol, false).filter((frag) => frag.length > 1 && frag.length <= MOST_CLEAN && (!ids?.size || frag.some((i) => ids.has(i))) && !frag.some((i) => mol.atoms[i].centre || mol.atoms[i].location[2] || pi.has(i)));
  for (const frag of groups) {
    const local = new Map(frag.map((i, k) => [i, k]));
    const bonds = mol.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1]));
    const out = clean2d(frag.map((i) => mol.atoms[i].location), bonds.map((b) => ({ atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!], order: shapeType(b.type) })), work * Math.min(1, 2 / groups.length), SAFETY * Math.min(1, 2 / groups.length), rounds);
    const lengths = bonds.map((b) => {
      const [p, q] = [out[local.get(b.atoms[0])!], out[local.get(b.atoms[1])!]];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    }).sort((a, b) => a - b);
    const scale = ownScale(frag) / (lengths[Math.floor(lengths.length / 2)] || 1);
    const centre = (pts: readonly (readonly number[])[]) => [0, 1].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length);
    const [ox, oy] = centre(frag.map((i) => mol.atoms[i].location)), [nx, ny] = centre(out);
    frag.forEach((i, k) => {
      const [x, y] = out[k];
      atoms[i] = { ...atoms[i], location: [ox + (x - nx) * scale, oy + (y - ny) * scale, 0] };
    });
    // As ChemDraw's clean up leaves it: a ring structure turned so its bottom ring bond is level, and a structure
    // without rings turned so the most bonds lie at a multiple of 30°.
    const turn = levelTurn({ ...mol, atoms }, frag);
    if (turn) {
      const c = Math.cos((turn * Math.PI) / 180), s = Math.sin((turn * Math.PI) / 180);
      frag.forEach((i) => { const [x, y] = atoms[i].location; atoms[i] = { ...atoms[i], location: [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c, 0] }; });
    }
  }
  if (labels) for (const frag of groups) {
    const own = ownScale(frag), local = new Map(frag.map((i, k) => [i, k]));
    const piece: Mol = { atoms: frag.map((i) => ({ ...atoms[i], location: [atoms[i].location[0] / own, atoms[i].location[1] / own, 0], scale: scaleOf(atoms[i]) / own })),
      bonds: mol.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ ...b, atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!] })) };
    if (!inkHits(piece, inkBoxes(piece)).length) continue;
    const moved = nudged(piece), was = toInchi(piece);
    if (was && moved !== piece && toInchi(moved) === was) frag.forEach((i, k) => { atoms[i] = { ...atoms[i], location: [moved.atoms[k].location[0] * own, moved.atoms[k].location[1] * own, 0] }; });
  }
  return { ...mol, atoms };
  function ownScale(frag: number[]) { return frag.map((i) => scaleOf(mol.atoms[i])).sort((a, b) => a - b)[Math.floor(frag.length / 2)]; }
}

// The pieces a mass-fragmentation cut makes: the cut bonds are taken out and every atom keeps the hydrogens it had
// in the whole molecule (a homolytic cleavage). Each piece that a cut bond touched, with its formula and exact mass.
export function fragmentMasses(mol: Mol, cut: number[]): { atoms: number[]; formula: string; exact: number }[] | undefined {
  if (!indigo || !cut.length) return undefined;
  const ind = indigo, full = expandLabels(mol), cutSet = new Set(cut);
  const used = full.atoms.map(() => 0);
  full.bonds.forEach((b) => b.atoms.forEach((i) => (used[i] += orderOf(b.type))));
  const h = full.atoms.map((a, i) => a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical));
  // Pieces: atoms joined by the bonds that are not cut.
  const root = full.atoms.map((_, i) => i), find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  full.bonds.forEach((b, k) => { if (!cutSet.has(k)) root[find(b.atoms[0])] = find(b.atoms[1]); });
  const touched = new Set(cut.flatMap((k) => full.bonds[k] ? full.bonds[k].atoms.map(find) : []));
  const out: { atoms: number[]; formula: string; exact: number }[] = [];
  for (const r of touched) {
    const atoms = full.atoms.map((_, i) => i).filter((i) => find(i) === r), local = new Map(atoms.map((i, k) => [i, k]));
    const ket = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule",
      atoms: atoms.map((i) => ({ label: full.atoms[i].label, location: full.atoms[i].location, implicitHCount: h[i], ...(full.atoms[i].charge ? { charge: full.atoms[i].charge } : {}) })),
      bonds: full.bonds.filter((b, k) => !cutSet.has(k) && local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ type: b.type === QUADRUPLE ? 1 : b.type, atoms: [local.get(b.atoms[0]), local.get(b.atoms[1])] })) } });
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try {
      const res = JSON.parse(ind.calculate(ket, opts, sel));
      out.push({ atoms: atoms.filter((i) => i < mol.atoms.length), formula: String(res["gross-formula"]).replace(/\s+/g, ""), exact: Number(res["monoisotopic-mass"]) });
    } catch {
      return undefined;
    } finally {
      opts.delete();
      sel.delete();
    }
  }
  return out;
}

// Atom map numbers for one reaction step, from Indigo's automapper: for each reactant and product (in order), each
// atom's number, or undefined where an atom has no partner. Written labels count as the element they attach by.
// keep: the atoms' map numbers (pairs mapped by hand) stay, and only the rest are mapped (Indigo's keep mode).
export function mapReaction(reactants: Mol[], products: Mol[], keep = false): { reactants: (number | undefined)[][]; products: (number | undefined)[][] } | undefined {
  if (!indigo || !reactants.length || !products.length) return undefined;
  const ind = indigo, opts = new ind.MapStringString();
  try {
    // A molfile keeps its first (name) line, so it is not trimmed.
    const molfile = (m: Mol) => {
      const o = new ind.MapStringString();
      try {
        return ind.convert(JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule",
          atoms: m.atoms.map((a) => ({ label: /^[A-Z][a-z]?$/.test(a.label) ? a.label : "C", location: a.location, ...(a.charge ? { charge: a.charge } : {}), ...(keep && a.map ? { mapping: a.map } : {}) })),
          bonds: m.bonds.filter((b) => b.type !== HBOND).map((b) => ({ type: shapeType(b.type), atoms: b.atoms })) } }), "molfile", o).replace(/\s+$/, "");
      } finally { o.delete(); }
    };
    const rxn = ["$RXN", "", "  Octet", "", `${String(reactants.length).padStart(3)}${String(products.length).padStart(3)}`, ...[...reactants, ...products].flatMap((m) => ["$MOL", molfile(m)])].join("\n");
    opts.set("output-content-type", "application/json");
    const ket = JSON.parse(JSON.parse(ind.automap(rxn, keep ? "keep" : "discard", "ket", opts)).struct);
    const mols = (ket.root.nodes as { $ref?: string }[]).flatMap((n) => (n.$ref && ket[n.$ref]?.type === "molecule" ? [ket[n.$ref].atoms.map((a: { mapping?: number }) => a.mapping)] : []));
    if (mols.length !== reactants.length + products.length) return undefined;
    return { reactants: mols.slice(0, reactants.length), products: mols.slice(reactants.length) };
  } catch {
    return undefined;
  } finally {
    opts.delete();
  }
}

// The Chemical Properties panel's values for each structure in a drawing (or a selection): formula, masses and
// composition from Indigo; Wildman–Crippen logP and molar refractivity from Indigo, one structure at a time (it adds
// a mixture's together); and the structure's graph for Octet's own calculators (props.ts).
export type Structure = { formula: string; weight: number; exact: number; composition: string; logP?: number; mr?: number; graph?: Graph; repeat?: Repeat };
const structured = new Map<string, Structure | undefined>();
export function structures(mol: Mol, groups = fragments(mol)): (Structure | undefined)[] | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const ind = indigo, opts = new ind.MapStringString(), sel = new ind.VectorInt(), out: (Structure | undefined)[] = [];
  // Indigo reports a failed logP or MR as -1.
  const num = (s: string) => (s.trim() === "-1.000000" ? undefined : Number(s));
  try {
    for (const ids of groups.slice(0, 12)) {
      const part = subset(mol, new Set(ids));
      // A polymer: its repeat units counted as its brackets say (no logP or properties for a polymer).
      const polymer = polymerValues(part);
      if (polymer) { out.push(polymer); continue; }
      out.push(remembered(structured, contentOf(part), () => {
        try {
          const ket = ketOf(part, { wedges: false }), calc = JSON.parse(ind.calculate(ket, opts, sel));
          const heavy = expandLabels(part).atoms.filter((a) => a.label !== "H").length;
          // Ferrocene's pieces (its multi-centre attachments are left out of the chemistry) as one compound.
          const one = summed(calc);
          return {
            formula: one.formula, weight: one.weight, exact: one.exact, composition: one.composition,
            // ChemDraw stops at 150 heavy atoms for logP and 1,000 atoms for the rest; so does Octet.
            ...(heavy <= 150 ? { logP: num(ind.logp(ket, opts)), mr: num(ind.molarRefractivity(ket, opts)) } : {}),
            graph: heavy <= 1000 ? graphOf(expandLabels(part)) : undefined,
          };
        } catch { return undefined; } // a structure Indigo cannot read has no values
      }));
    }
    return out.some(Boolean) ? out : undefined;
  } finally {
    opts.delete();
    sel.delete();
  }
}

// Formula and masses for the drawing or a selection, one entry for each structure in it (the first limit of them),
// with written labels counted as their atoms. Each structure is worked out on its own and kept by its content.
// Undefined while Indigo is loading or if it cannot read any structure. cite: the abbreviation for a structure's
// standard InChI (names.ts abbreviationOf), given as each structure's abbreviation (TREN).
export type Analysis = { formula: string; weight: number; exact: number; repeat?: Repeat; abbreviation?: string }[];
const analysed = new Map<string, Analysis | undefined>(), inchis = new Map<string, string | undefined>();
export function analyse(mol: Mol, limit = Infinity, cite?: (inchi: string | undefined) => string | undefined): Analysis | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const out: Analysis = [], parts = pieces(mol);
  // Pieces that are one compound together, as a salt ([Ru(bpy)3]Cl2), a complex with its ligands apart (Ni(cod)2) or
  // ferrocene's ions (dppf), are one entry when they are all there is and have an abbreviation.
  if (cite && parts.length > 1 && parts.length <= 12 && mol.atoms.length <= 300 && !mol.shapes?.some((sh) => sh.polymer)) {
    const abbreviation = cite(remembered(inchis, contentOf(mol), () => toInchi(mol)));
    const entries = abbreviation ? parts.flatMap((part) => remembered(analysed, contentOf(part), () => analyseAll(part)) ?? []) : [];
    if (abbreviation && entries.length) {
      const total: Record<string, number> = {};
      for (const e of entries) for (const [el, n] of Object.entries(counts(e.formula) ?? {})) total[el] = (total[el] ?? 0) + n;
      return [{ formula: hill(total), weight: entries.reduce((t, e) => t + e.weight, 0), exact: entries.reduce((t, e) => t + e.exact, 0), abbreviation }];
    }
  }
  for (const part of parts) {
    if (out.length >= limit) break;
    const polymer = mol.shapes?.some((sh) => sh.polymer) ? polymerValues({ ...part, shapes: mol.shapes }) : undefined;
    if (polymer) { out.push(polymer); continue; }
    const entries = remembered(analysed, contentOf(part), () => analyseAll(part)) ?? [];
    const abbreviation = cite && entries.length === 1 ? cite(remembered(inchis, contentOf(part), () => toInchi(part))) : undefined;
    // A structure held together by multi-centre attachments (ferrocene) is one compound, not its pieces.
    if (entries.length > 1 && part.atoms.some((a) => a.centre)) {
      const total: Record<string, number> = {};
      for (const e of entries) for (const [el, n] of Object.entries(counts(e.formula) ?? {})) total[el] = (total[el] ?? 0) + n;
      out.push({ formula: hill(total), weight: entries.reduce((t, e) => t + e.weight, 0), exact: entries.reduce((t, e) => t + e.exact, 0) });
    } else out.push(...(abbreviation ? [{ ...entries[0], abbreviation }] : entries));
  }
  return out.length ? out.slice(0, limit) : undefined;
}
// Indigo's values for a molecule as one compound: its pieces ("C5 H5; C5 H5; Fe") added together.
function summed(calc: Record<string, unknown>): { formula: string; weight: number; exact: number; composition: string } {
  const split = (key: string) => String(calc[key]).split(";").map((v) => v.trim());
  const formulas = split("gross-formula");
  if (formulas.length === 1) return { formula: formulas[0].replace(/\s+/g, ""), weight: Number(calc["molecular-weight"]), exact: Number(calc["monoisotopic-mass"]), composition: String(calc["mass-composition"]) };
  const weights = split("molecular-weight").map(Number), counts: Record<string, number> = {}, masses: Record<string, number> = {};
  for (const f of formulas) for (const [el, n] of Object.entries(formulaCounts(f) ?? {})) counts[el] = (counts[el] ?? 0) + n;
  split("mass-composition").forEach((c, j) => { const t = c.split(/\s+/); for (let k = 0; k + 1 < t.length; k += 2) masses[t[k]] = (masses[t[k]] ?? 0) + (Number(t[k + 1]) * weights[j]) / 100; });
  const weight = weights.reduce((a, b) => a + b, 0);
  return { formula: hill(counts), weight, exact: split("monoisotopic-mass").map(Number).reduce((a, b) => a + b, 0), composition: Object.entries(masses).map(([el, w]) => `${el} ${((100 * w) / (weight || 1)).toFixed(2)}`).join(" ") };
}

// A polymer's formula and masses (ChemDraw's Bracket Properties): a multiple group's or parameterizable bracket's atoms
// counted as many times as it repeats (a parameterizable bracket's Mw sets its count), and an SRU's repeat unit apart
// from the end groups, as C2H6(C2H4)n. Where a bond crosses an SRU's bracket to a bare carbon with no other bond, the
// chain goes on: that carbon is not an end group (polyethylene drawn as –[CH2CH2]n– is (C2H4)n, not C4H10).
// Undefined for a structure with no such brackets. Each atom keeps the hydrogens it has in the whole structure.
export type Repeat = { label: string; weight: number; exact: number; ends?: { weight: number; exact: number } };
type Values = { formula: string; weight: number; exact: number; composition: string; repeat?: Repeat };
function polymerValues(part: Mol): Values | undefined {
  const brackets = polymerBrackets(part).filter((b) => ["sru", "mult", "param"].includes(b.sh.polymer!.usage));
  if (!brackets.length || !indigo) return undefined;
  const ind = indigo, { mol: x, from } = expandWithOrigins(part), used = x.atoms.map(() => 0), deg = part.atoms.map(() => 0);
  x.bonds.forEach((b) => b.atoms.forEach((i) => (used[i] += orderOf(b.type))));
  part.bonds.forEach((b) => b.atoms.forEach((i) => deg[i]++));
  const h = x.atoms.map((a, i) => a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical === 3 ? 2 : a.radical));
  const inOf = new Map<number, number>();
  brackets.forEach((b, k) => b.atoms.forEach((i) => { if (!inOf.has(i)) inOf.set(i, k); }));
  // Open ends: only at a repeat with no number (an SRU's n); a multiple group's end carbons are methyl groups.
  const numbered = brackets.map((b) => b.sh.polymer!.usage === "param" && !!b.sh.polymer!.mw || repeatCount(b.sh.polymer!) !== undefined);
  const open = new Set(part.atoms.flatMap((a, i) => (!inOf.has(i) && a.label === "C" && !a.text && !a.charge && !a.isotope && deg[i] === 1
    && part.bonds.some((b) => { const j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0]; return b.atoms.includes(i) && inOf.has(j) && !numbered[inOf.get(j)!]; }) ? [i] : [])));
  // Formula, masses and composition of some of the expanded atoms, from Indigo.
  const calc = (atoms: number[]) => {
    if (!atoms.length) return { counts: {} as Record<string, number>, weight: 0, exact: 0, masses: {} as Record<string, number> };
    const local = new Map(atoms.map((i, k) => [i, k]));
    const ket = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule",
      atoms: atoms.map((i) => ({ label: x.atoms[i].label, location: x.atoms[i].location, implicitHCount: h[i], ...(x.atoms[i].charge ? { charge: x.atoms[i].charge } : {}), ...(x.atoms[i].isotope ? { isotope: x.atoms[i].isotope } : {}) })),
      bonds: x.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ type: Math.min(3, b.type), atoms: [local.get(b.atoms[0]), local.get(b.atoms[1])] })) } });
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try {
      // Indigo gives each piece apart ("C H3; C H3"): their sums.
      const r = JSON.parse(ind.calculate(ket, opts, sel)), split = (key: string) => String(r[key]).split(";").map((v) => v.trim());
      const weights = split("molecular-weight").map(Number), exacts = split("monoisotopic-mass").map(Number), masses: Record<string, number> = {}, counts: Record<string, number> = {};
      split("mass-composition").forEach((c, j) => { const t = c.split(/\s+/); for (let k = 0; k + 1 < t.length; k += 2) masses[t[k]] = (masses[t[k]] ?? 0) + (Number(t[k + 1]) * weights[j]) / 100; });
      for (const f of split("gross-formula")) { const c = formulaCounts(f); if (!c) return undefined; for (const [el, n] of Object.entries(c)) counts[el] = (counts[el] ?? 0) + n; }
      const weight = weights.reduce((a, b) => a + b, 0), exact = exacts.reduce((a, b) => a + b, 0);
      return Number.isFinite(weight) ? { counts, weight, exact, masses } : undefined;
    } catch { return undefined; } finally { opts.delete(); sel.delete(); }
  };
  const ends = calc(x.atoms.map((_, j) => j).filter((j) => !inOf.has(from[j]) && !open.has(from[j])));
  const units = brackets.map((b, k) => ({ p: b.sh.polymer!, v: calc(x.atoms.map((_, j) => j).filter((j) => inOf.get(from[j]) === k)) }));
  if (!ends || units.some((u) => !u.v)) return undefined;
  // Numbered repeats are counted into the rest; the first SRU or label repeat stays as its unit and label.
  const rest = { counts: { ...ends.counts }, weight: ends.weight, exact: ends.exact, masses: { ...ends.masses } };
  let symbolic: { label: string; v: NonNullable<ReturnType<typeof calc>> } | undefined, more = "";
  for (const u of units) {
    const k = repeatCount(u.p, u.v!.weight);
    if (k === undefined) {
      const label = polymerLabel(u.p) || "n";
      if (!symbolic) symbolic = { label, v: u.v! }; else more += `(${hill(u.v!.counts)})${label}`;
      continue;
    }
    for (const [el, c] of Object.entries(u.v!.counts)) rest.counts[el] = (rest.counts[el] ?? 0) + k * c;
    for (const [el, w] of Object.entries(u.v!.masses)) rest.masses[el] = (rest.masses[el] ?? 0) + k * w;
    rest.weight += k * u.v!.weight;
    rest.exact += k * u.v!.exact;
  }
  const compose = (masses: Record<string, number>, weight: number) => Object.entries(masses).map(([el, w]) => `${el} ${((100 * w) / (weight || 1)).toFixed(2)}`).join(" ");
  if (!symbolic) return { formula: hill(rest.counts), weight: rest.weight, exact: rest.exact, composition: compose(rest.masses, rest.weight) };
  const hasRest = Object.keys(rest.counts).length > 0;
  return {
    formula: `${hasRest ? hill(rest.counts) : ""}(${hill(symbolic.v.counts)})${symbolic.label}${more}`, weight: rest.weight + symbolic.v.weight, exact: rest.exact + symbolic.v.exact,
    composition: compose(symbolic.v.masses, symbolic.v.weight),
    repeat: { label: symbolic.label, weight: symbolic.v.weight, exact: symbolic.v.exact, ...(hasRest ? { ends: { weight: rest.weight, exact: rest.exact } } : {}) },
  };
}
// "C2 H4" as element counts.
function formulaCounts(f: string): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const t of f.trim().split(/\s+/)) {
    const m = /^([A-Z][a-z]?)(\d*)$/.exec(t);
    if (!m) return t ? undefined : out;
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? Number(m[2]) : 1);
  }
  return out;
}
// Element counts in Hill order (C, H, then by symbol; by symbol alone with no carbon), fractional counts to 2 places.
function hill(counts: Record<string, number>): string {
  const els = Object.keys(counts).filter((el) => counts[el] > 1e-9).sort((a, b) => a.localeCompare(b, "en"));
  const order = counts.C ? ["C", ...(counts.H ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H")] : els;
  return order.map((el) => { const n = counts[el], t = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(+n.toFixed(2)); return el + (t === "1" ? "" : t); }).join("");
}
// Each structure (atoms joined by bonds) on its own, in the drawing's order, with no atom left out.
function pieces(mol: Mol): Mol[] {
  const at: [number, number][] = [];
  const groups = fragments(mol).map((group, k) => {
    const ids = [...group].sort((a, b) => a - b);
    ids.forEach((i, j) => { at[i] = [k, j]; });
    return ids;
  });
  // A multi-centre or variable attachment's atoms, by their number in the piece.
  const parts = groups.map((ids, k) => ({ atoms: ids.map((i) => renumberCentre(mol.atoms[i], (j) => (at[j]?.[0] === k ? at[j][1] : undefined))), bonds: [] as Mol["bonds"] }));
  for (const b of mol.bonds) {
    const [p, q] = [at[b.atoms[0]], at[b.atoms[1]]];
    if (p && q) parts[p[0]].bonds.push({ ...b, atoms: [p[1], q[1]] });
  }
  return parts;
}
// A structure's content as text: what its formula, masses and properties come from (not where it is drawn).
const contentOf = (m: Mol) => JSON.stringify([m.atoms.map((a) => [a.label, chemicalText(a.text, a.runs), a.charge, a.isotope, a.radical, a.implicitHCount, a.chemical, a.attach, a.bead, a.centre]), m.bonds.map((b) => [b.type, b.stereo, b.atoms])]);
// A value kept by its key, so it is worked out only once. The store is cleared when it grows large.
function remembered<T>(store: Map<string, T>, key: string, make: () => T): T {
  if (store.has(key)) return store.get(key) as T;
  if (store.size >= 500) store.clear();
  const value = make();
  store.set(key, value);
  return value;
}
// Formula and masses for each structure Indigo finds in a molecule, in one call. A structure with no formula or no
// weight (a label Indigo cannot read, alone) has no entry. Indigo gives no exact mass for a structure it reads as a
// bad valence: its exact mass is then not a number.
function analyseAll(mol: Mol): Analysis | undefined {
  const ind = engine(), opts = new ind.MapStringString(), sel = new ind.VectorInt();
  try {
    // A hydrogen bond goes too, so two molecules joined by one are one structure, as drawn.
    const ket = ketOf(mol, { wedges: false, hbonds: true });
    // Indigo reports each structure separately ("C8 H9 N O2; C4 H12 N"): one entry per structure.
    const out = JSON.parse(ind.calculate(ket, opts, sel));
    const split = (key: string) => String(out[key]).split(";").map((x) => x.trim());
    const formulas = split("gross-formula").map((f) => f.replace(/\s+/g, "")), weights = split("molecular-weight").map(Number), exacts = split("monoisotopic-mass").map(Number);
    return formulas.map((formula, k) => ({ formula, weight: weights[k], exact: exacts[k] })).filter((a) => a.formula && Number.isFinite(a.weight));
  } catch {
    return undefined;
  } finally {
    opts.delete();
    sel.delete();
  }
}

// A reagent's formula and molar mass from its SMILES (a reagent written as an abbreviation, such as MeOH or Et3N, read
// by labels.ts), kept by the SMILES. Undefined while Indigo is loading or if it cannot read it.
const reagents = new Map<string, { formula: string; weight: number } | undefined>();
export function smilesWeight(smiles: string): { formula: string; weight: number } | undefined {
  if (!indigo) return undefined;
  const ind = indigo;
  return remembered(reagents, smiles, () => {
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try { const one = summed(JSON.parse(ind.calculate(smiles, opts, sel))); return Number.isFinite(one.weight) && one.weight > 0 ? { formula: one.formula, weight: one.weight } : undefined; } catch { return undefined; } finally { opts.delete(); sel.delete(); }
  });
}
