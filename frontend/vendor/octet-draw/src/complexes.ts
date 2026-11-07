// Names for coordination compounds by additive nomenclature (IUPAC 2005 Red Book IR-9, IR-10): the ligands in
// alphabetical order, then the metal, then the charge number of a complex ion or the oxidation number of a neutral
// complex. κ cites donor atoms (IR-9.2.4.2), μ bridging ligands (IR-9.2.5.2), and (M—M) a metal-metal bond
// (IR-9.2.5.3): tris(2,2'-bipyridine-κ2N1,N1')ruthenium(2+), chloridotris(triphenylphosphane)rhodium(I),
// potassium hexacyanidoferrate(3-), tetrakis(μ-acetato-κO:κO')dirhodium(Rh—Rh).
//
// OPSIN reads no κ, so a name here cannot be checked as naming.ts checks the namer's names, by reading it back whole.
// It is checked in parts, and it is given only if every part agrees with the drawing:
// 1. Each ligand, cut from the metal, is a molecule or ion of its own. Its name (the namer's; a ring assembly's, as
//    2,2':6',2''-terpyridine; or a multiplicative name, as 3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoate)) must read
//    back by OPSIN as the same structure (same standard InChI, stereochemistry included). A carbon ligand is named as
//    a substituent (methyl, phenylmethylidene), and OPSIN must read it on silane in the metal's place.
// 2. Each κ term must cite exactly the donor atoms. A κ term follows the part of the ligand's name that holds its atoms
//    (the whole name, or a group in enclosing marks, IR-9.2.4.2) and cites them by OPSIN's locants there (κ2N1,N1',
//    κO''). OPSIN reads the name with an isotope descriptor before that part's last component in place of each term
//    ((1,1'-15N2)-2,2'-bipyridine), and the structure must be the drawn ligand with its donor atoms marked (same
//    InChI). A term with primes counting on from none (κ2O,O') may instead cite every atom of its element, or one atom
//    of an element whose atoms are all alike.
// 3. The finished name is parsed again, term by term, and each part read again as in 1 and 2: the ligands with their
//    counts and donor atoms, the metal and how many, the bridging ligands, the metal-metal bond, the counter-ions,
//    and the charge number or oxidation number must all match the drawing.
// A main-group atom (P, Si, B and others) is a central atom in a chelate when the namer has no name (IR-7.1):
// dimethanolato(5,10,15,20-tetraphenylporphyrin-21,23-diido-κ4N21,N22,N23,N24)phosphorus(1+). The E or Z that a chelate
// ring fixes is left out of the check of a ligand's name (Ligand.fixed): a porphyrin's name cites none.
// Also named and checked here: the configuration the drawing fixes at one metal (cis, trans, fac, mer, (SP-4-3),
// (OC-6-43), (T-4-R), (TBPY-5-12), (SPY-5-12), and Δ or Λ for a tris(bidentate) complex); complexes of unlike metals
// and of three to six metals (rheniumcobalt(Re—Co), triangulo-triosmium); and η ligands drawn with a bond to each
// bonded atom ((η6-benzene)tricarbonylchromium, [(1,2,5,6-η)-(1Z,5Z)-cycloocta-1,5-diene]).
// Names are not given for what is not checked here: the chirality symbols C and A, other polyhedra, configuration
// indexes that need the priming convention or CIP rules past the donor's neighbours, η ligands that bridge metals, and
// donor atoms that no κ term above can cite.
import { graphOf, type Cip, type Graph } from "./naming.ts";
import { alphaKey, assemblePrefixes, enclose as encloseName, iupacNameWhy, joinPrefixes, Namer, type Name } from "./namer.ts";
import { ELEMENTS, isMetal } from "./metals.ts";
import { substitutively } from "./namer-multiplicative.ts";
import { handOf } from "./cip.ts";
import type { Mol } from "./render.ts";

// What the checks need from outside: OPSIN (a name's SMILES, and its atoms with their locants), InChI and CIP labels.
export type ComplexApi = {
  read: (name: string) => string | undefined;
  atoms: (name: string) => string | undefined; // OPSIN's parseToAtoms JSON
  inchi: (s: Mol | string) => string | undefined;
  aux?: (m: Mol) => string | undefined; // the InChI and its AuxInfo, for Ligand.fixed
  cip?: (m: Mol) => Cip | undefined;
};

// Limits, as every opened file is hostile: atoms in the drawing, metal atoms in one complex, enclosing marks deep.
const MOST_ATOMS = 600, MOST_METALS = 6, MOST_DEPTH = 24, MOST_NAME = 3000;

const MULT = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca", "undeca", "dodeca"];
const MULTK = ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis", "heptakis", "octakis", "nonakis", "decakis", "undecakis", "dodecakis"];
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
// Central atoms in anions (IR-9.2.2, Table X): ferrate, cuprate; else -ium, -um and -ese become -ate (cobaltate).
const ATE: Record<string, string> = {
  Fe: "ferrate", Cu: "cuprate", Ag: "argentate", Au: "aurate", Pb: "plumbate", Sn: "stannate", Hg: "mercurate", Mo: "molybdate",
  W: "tungstate", Mn: "manganate", Sb: "antimonate", B: "borate", Si: "silicate", P: "phosphate", As: "arsenate",
};
const ateOf = (el: string) => ATE[el] ?? ELEMENTS.get(el)!.replace(/(ium|um|ese)$/, "") + "ate";
// Main-group central atoms (IR-7.1 allows additive names for them), with their group's oxidation number. One is a
// central atom only in a chelate, bonded by single bonds to donor atoms alone (centresOf): phosphorus in a porphyrin,
// boron in a BODIPY dye. With a bond to carbon (a silyl ether, a boronic ester, a phosphonium salt) it is not: the
// namer names those. Structure to Name asks this file only when the namer has no name (naming.ts).
const GROUP: Record<string, number> = { B: 3, Al: 3, Ga: 3, In: 3, Si: 4, Ge: 4, Sn: 4, Pb: 4, P: 5, As: 5, Sb: 5 }, MAIN = new Set(Object.keys(GROUP));
const NAMES = new Map<string, { el: string; ate: boolean }>();
for (const [el, name] of ELEMENTS) if (isMetal(el) || MAIN.has(el)) { NAMES.set(name, { el, ate: false }); NAMES.set(ateOf(el), { el, ate: true }); }

// Marks on donor atoms for the checks: an isotope no drawing needs, one set for each metal of a complex.
const MARK: Record<string, [number, number]> = {
  H: [3, 4], B: [9, 12], C: [13, 14], N: [15, 13], O: [18, 17], F: [18, 17], Si: [29, 30], P: [32, 33], S: [34, 33],
  Cl: [37, 36], As: [74, 73], Se: [77, 78], Br: [81, 82], Sb: [123, 125], Te: [125, 123], I: [129, 131],
};
// Elements whose atoms can donate a lone pair: a ligand with one of them needs no κ (IR-9.2.4.1).
const DONORS = new Set(["N", "P", "As", "Sb", "O", "S", "Se", "Te", "F", "Cl", "Br", "I"]);
// Usual valences by charge, for the atom a bond to the metal is cut from.
const NORMAL: Record<string, Record<number, number[]>> = {
  H: { 0: [1], [-1]: [0], 1: [0] }, B: { 0: [3], [-1]: [4] }, C: { 0: [4], [-1]: [3], 1: [3] }, Si: { 0: [4] },
  N: { 0: [3], 1: [4], [-1]: [2], [-2]: [1], [-3]: [0] }, P: { 0: [3, 5], 1: [4], [-1]: [2], [-2]: [1], [-3]: [0] },
  As: { 0: [3, 5], 1: [4], [-1]: [2] }, Sb: { 0: [3, 5], 1: [4], [-1]: [2] },
  O: { 0: [2], 1: [3], [-1]: [1], [-2]: [0] }, S: { 0: [2, 4, 6], 1: [3], [-1]: [1], [-2]: [0] },
  Se: { 0: [2, 4, 6], 1: [3], [-1]: [1], [-2]: [0] }, Te: { 0: [2, 4, 6], 1: [3], [-1]: [1], [-2]: [0] },
  F: { 0: [1], [-1]: [0] }, Cl: { 0: [1], [-1]: [0] }, Br: { 0: [1], [-1]: [0] }, I: { 0: [1], [-1]: [0] },
};

// Ligands with names of their own (IR-9.2.2.3, Table IX): by shape, with their charge as free ligands.
type Lex = { form: string; charge: number; ox: boolean };
const LEX: Record<string, Lex> = {
  F: { form: "fluorido", charge: -1, ox: true }, Cl: { form: "chlorido", charge: -1, ox: true }, Br: { form: "bromido", charge: -1, ox: true },
  I: { form: "iodido", charge: -1, ox: true }, H: { form: "hydrido", charge: -1, ox: true }, O: { form: "oxido", charge: -2, ox: true },
  S: { form: "sulfido", charge: -2, ox: true }, N: { form: "nitrido", charge: -3, ox: true }, OH: { form: "hydroxido", charge: -1, ox: true },
  OH2: { form: "aqua", charge: 0, ox: true }, NH3: { form: "ammine", charge: 0, ox: true }, NH2: { form: "azanido", charge: -1, ox: true },
  CO: { form: "carbonyl", charge: 0, ox: false }, CN: { form: "cyanido", charge: -1, ox: true }, NO: { form: "nitrosyl", charge: 0, ox: false },
  N3: { form: "azido", charge: -1, ox: true },
};
const LEX_FORMS = new Map(Object.entries(LEX).map(([k, v]) => [v.form, k]));

// ——— The drawing as complexes, ligands and other ions ———
type Bound = { metal: number; atom: number; order: number };
type Ligand = {
  atoms: number[]; // the ligand's atoms in the drawing, explicit hydrogens included
  q: Map<number, number>; // charges of its donor atoms as a free ligand, where they differ from the drawing's
  bonds: Bound[]; // its bonds to metal atoms
  lex?: string; // a LEX key
  carbon?: boolean; // bonded through one carbon atom, named as a substituent (methyl, phenylmethylidene)
  charge: number; // as a free ligand (a carbon ligand: unused)
  // Double bonds in a chelate ring and in no ring of the ligand alone (the C=N of a salen, the C=C of an acac): their
  // E or Z is the chelate's, so the ligand's name does not cite it.
  chelated?: Set<string>;
  // Bonds of any order in a ring of 8 or more atoms of the ligand alone and in no smaller one, but in a chelate ring
  // of at most 7: the chelate fixes their E or Z (the meso C-C bonds of a porphyrin). InChI gives those bonds E or Z
  // in the free ligand, single bonds too where it moves charges or hydrogens along the ring, so the check of the
  // ligand's name leaves them out (unfixed).
  fixed?: Set<string>;
  eta?: number; // an η ligand: how many contiguous atoms bond to the metal
};
// written: the oxidation state written in the metal's label (Os(II)), for a complex of one metal atom.
type Entity = { metals: number[]; ligands: Ligand[]; hydrides: number; mm: [number, number][]; charge: number; atoms: number[]; written?: number };
type Shape = { g: Graph; adj: number[][]; ord: Map<string, number> };
const key = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`);

function shapeOf(g: Graph): Shape {
  const adj: number[][] = g.atoms.map(() => []), ord = new Map<string, number>();
  for (const b of g.bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); ord.set(key(b.a, b.b), b.order); }
  return { g, adj, ord };
}
const valence = (s: Shape, i: number) => s.adj[i].reduce((t, j) => t + s.ord.get(key(i, j))!, 0) + s.g.atoms[i].h;
const parts = (n: number, adj: number[][], keep: (i: number) => boolean) => {
  const seen = new Set<number>(), out: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen.has(s) || !keep(s)) continue;
    const part = [s];
    seen.add(s);
    for (let k = 0; k < part.length; k++) for (const j of adj[part[k]]) if (!seen.has(j) && keep(j)) { seen.add(j); part.push(j); }
    out.push(part.sort((a, b) => a - b));
  }
  return out;
};

// Whether u and v are joined other than by their own bond, through atoms that pass keep.
function linked(adj: number[][], u: number, v: number, keep: (i: number) => boolean): boolean {
  const seen = new Set([u]), stack = [u];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of adj[i]) {
      if ((i === u && j === v) || seen.has(j) || !keep(j)) continue;
      if (j === v) return true;
      seen.add(j);
      stack.push(j);
    }
  }
  return false;
}
// Whether the bond u-v is in a ring of at most 7 atoms through atoms that pass keep. InChI gives E or Z only to double
// bonds in no such ring.
function smallRing(adj: number[][], u: number, v: number, keep: (i: number) => boolean): boolean {
  const far = new Map([[u, 0]]);
  for (let front = [u], d = 1; d < 7 && front.length; d++) {
    const next: number[] = [];
    for (const i of front) for (const j of adj[i]) {
      if ((i === u && j === v) || far.has(j) || !keep(j)) continue;
      if (j === v) return true;
      far.set(j, d);
      next.push(j);
    }
    front = next;
  }
  return false;
}
// The central atoms of a piece of the drawing: its metal atoms; else one main-group atom (MAIN) that a ligand
// chelates, bonded by single bonds to donor atoms and hydrogen alone.
function centresOf(s: Shape, atoms: number[]): number[] {
  const { g, adj, ord } = s, metals = atoms.filter((i) => isMetal(g.atoms[i].el));
  if (metals.length) return metals;
  const inside = new Set(atoms), found = atoms.filter((x) => {
    if (!MAIN.has(g.atoms[x].el) || adj[x].some((j) => ord.get(key(x, j)) !== 1 || !(DONORS.has(g.atoms[j].el) || g.atoms[j].el === "H"))) return false;
    // A chelate: two of its neighbours joined other than through it.
    const piece = new Map<number, number>();
    parts(g.atoms.length, adj, (i) => inside.has(i) && i !== x).forEach((p, k) => p.forEach((i) => piece.set(i, k)));
    return new Set(adj[x].map((j) => piece.get(j))).size < adj[x].length;
  });
  return found.length === 1 ? found : [];
}
// A complex's ligands, each with the charges its donor atoms have once the bonds to the metal are cut: a dative bond
// leaves the donor as it was (the N of a pyridine), a covalent one leaves it negative (the O of a phenolate). Which
// one is decided by valence: the donor must be left in a usual valence state, and only one may fit.
function entityOf(s: Shape, atoms: number[]): Entity | undefined {
  const { g, adj, ord } = s, inside = new Set(atoms);
  const metals = centresOf(s, atoms);
  if (!metals.length || metals.length > MOST_METALS) return undefined;
  const metal = new Set(metals), mm: [number, number][] = [];
  for (const m of metals) for (const j of adj[m]) if (metal.has(j) && m < j) mm.push([m, j]);
  const ligands: Ligand[] = [];
  for (const part of parts(g.atoms.length, adj, (i) => inside.has(i) && !metal.has(i))) {
    const bonds = part.flatMap((i) => adj[i].filter((j) => metal.has(j)).map((m) => ({ metal: m, atom: i, order: ord.get(key(i, m))! })));
    if (!bonds.length) return undefined; // a piece of the complex not bonded to a metal cannot be
    const lig: Ligand = { atoms: part, q: new Map(), bonds, charge: 0 };
    const donors = [...new Set(bonds.map((b) => b.atom))];
    // An η ligand (IR-10.2.5.1): two or more donor atoms bonded to each other, all to one metal, each once, joined
    // through the ligand into runs of at least two atoms (one run, as in benzene; or several, as the two C=C bonds of
    // cycloocta-1,5-diene). It is the drawn molecule or ion with the bonds to the metal cut, its hydrogens as drawn.
    if (donors.some((d) => adj[d].some((j) => donors.includes(j)))) {
      const runs = parts(g.atoms.length, adj, (i) => donors.includes(i));
      if (runs.some((r) => r.length < 2) || bonds.length !== donors.length || new Set(bonds.map((b) => b.metal)).size !== 1 || bonds.some((b) => b.order !== 1) || donors.length > 8) return undefined;
      Object.assign(lig, { eta: donors.length, charge: part.reduce((t, i) => t + g.atoms[i].charge, 0) });
      ligands.push(lig);
      continue;
    }
    const lex = lexOf(s, part, donors);
    if (lex) { Object.assign(lig, { lex, charge: LEX[lex].charge }); ligands.push(lig); continue; }
    if (donors.some((d) => g.atoms[d].el === "C")) {
      // A carbon ligand: one carbon atom, bonded to one metal, named by a prefix (yl, ylidene, ylidyne).
      if (donors.length !== 1 || bonds.length !== 1 || bonds[0].order > 3) return undefined;
      Object.assign(lig, { carbon: true });
      ligands.push(lig);
      continue;
    }
    for (const d of donors) {
      const a = g.atoms[d], k = bonds.filter((b) => b.atom === d).reduce((t, b) => t + b.order, 0), left = valence(s, d) - k, states = NORMAL[a.el];
      const fits = states ? Object.entries(states).filter(([q, vs]) => vs.includes(left) && a.charge - Number(q) >= 0 && a.charge - Number(q) <= k).map(([q]) => Number(q)) : [];
      if (fits.length !== 1) return undefined;
      if (fits[0] !== a.charge) lig.q.set(d, fits[0]);
    }
    lig.charge = part.reduce((t, i) => t + (lig.q.get(i) ?? g.atoms[i].charge), 0);
    // Bonds whose E or Z the chelate fixes (chelated, fixed): in no ring of the ligand alone but in a chelate ring (the
    // C=N of a salen), or in rings of 8 or more atoms of the ligand alone but in a chelate ring of fewer (the meso C-C
    // bonds of a porphyrin, each in a six-membered ring with the central atom).
    const own = new Set(part), chelated = new Set<string>(), fixed = new Set<string>(), mine = (i: number) => own.has(i), all = (i: number) => inside.has(i);
    for (const u of part) for (const v of adj[u]) {
      if (u > v || !own.has(v) || smallRing(adj, u, v, mine)) continue;
      const ring = smallRing(adj, u, v, all), cyclic = linked(adj, u, v, mine);
      if (ring && cyclic) fixed.add(key(u, v));
      if (ord.get(key(u, v)) === 2 && (ring || (!cyclic && linked(adj, u, v, all)))) chelated.add(key(u, v));
    }
    if (chelated.size) lig.chelated = chelated;
    if (fixed.size) lig.fixed = fixed;
    ligands.push(lig);
  }
  const hydrides = metals.reduce((t, m) => t + g.atoms[m].h, 0), charge = atoms.reduce((t, i) => t + g.atoms[i].charge, 0);
  if (!ligands.length && !hydrides) return undefined;
  // A main-group central atom has an oxidation number its group allows: at most the group's, in steps of two
  // (phosphorus(V) or (III), tin(IV) or (II)). Another (a charge left off the drawing) gives no name.
  const top = GROUP[g.atoms[metals[0]].el], ox = charge + hydrides - ligands.reduce((t, l) => t + l.charge, 0);
  if (top && (ox <= 0 || ox > top || (top - ox) % 2)) return undefined;
  return { metals, ligands, hydrides, mm, charge, atoms };
}

// A ligand with a name of its own (LEX), by shape: one atom (by its charge once cut), water, ammonia, hydroxide,
// amide, carbon monoxide and cyanide bonded through C, nitrogen monoxide through N, and azide through an end N.
function lexOf(s: Shape, part: number[], donors: number[]): string | undefined {
  const { g, adj, ord } = s, a = (i: number) => g.atoms[i];
  if (part.length === 1) {
    const i = part[0], k = adj[i].reduce((t, j) => t + (part.includes(j) ? 0 : ord.get(key(i, j))!), 0), left = valence(s, i) - k;
    const states = NORMAL[a(i).el], fits = states ? Object.entries(states).filter(([q, vs]) => vs.includes(left) && a(i).charge - Number(q) >= 0 && a(i).charge - Number(q) <= k) : [];
    if (fits.length !== 1) return undefined;
    const h = a(i).h, id = `${a(i).el}${h ? `H${h > 1 ? h : ""}` : ""}`;
    return LEX[id]?.charge === Number(fits[0][0]) && !["CO", "CN", "NO", "N3"].includes(id) ? id : undefined;
  }
  if (part.some((i) => a(i).h || part.length > 3)) return undefined;
  const els = part.map((i) => a(i).el).sort().join("");
  const d = donors.length === 1 ? donors[0] : -1, other = part.find((i) => i !== d);
  if (part.length === 2 && d >= 0 && other !== undefined && ord.get(key(d, other))! >= 2) {
    if (els === "CO" && a(d).el === "C" && a(d).charge + a(other).charge === 0) return "CO";
    if (els === "CN" && a(d).el === "C" && ord.get(key(d, other)) === 3 && a(d).charge + a(other).charge === 0) return "CN";
    if (els === "NO" && a(d).el === "N" && a(d).charge + a(other).charge === 0) return "NO";
  }
  if (els === "NNN" && d >= 0 && adj[d].filter((j) => part.includes(j)).length === 1 && part.reduce((t, i) => t + a(i).charge, 0) === 0) return "N3";
  return undefined;
}

// ——— Structures for the checks ———
// The ligand as a molecule of its own (its free charges, its drawn hydrogens and stereo bonds), with marked atoms
// (isotopes by atom) and, for a carbon ligand, silane in the metal's place.
function ligandMol(m: Mol, g: Graph, lig: Ligand, marks = new Map<number, number>(), silane = false): Mol {
  const at = new Map(lig.atoms.map((i, k) => [i, k]));
  const atoms: Mol["atoms"] = lig.atoms.map((i) => ({
    label: m.atoms[i].label, location: m.atoms[i].location, implicitHCount: g.atoms[i].h,
    ...((lig.q.get(i) ?? g.atoms[i].charge) ? { charge: lig.q.get(i) ?? g.atoms[i].charge } : {}), ...(marks.has(i) ? { isotope: marks.get(i) } : {}),
  }));
  // A chelate's double bond as a crossed one, E or Z not given: KET's stereo 3 for InChI, display either for the CIP
  // labels (cip.ts).
  const bonds: Mol["bonds"] = m.bonds.filter((b) => at.has(b.atoms[0]) && at.has(b.atoms[1])).map((b) => {
    const either = lig.chelated?.has(key(b.atoms[0], b.atoms[1])), stereo = either ? 3 : b.stereo;
    return { type: b.type, atoms: [at.get(b.atoms[0])!, at.get(b.atoms[1])!] as [number, number], ...(stereo ? { stereo } : {}), ...(either ? { display: "either" as const } : b.display ? { display: b.display } : {}) };
  });
  if (silane) {
    const b = lig.bonds[0];
    atoms.push({ label: "Si", location: m.atoms[b.metal].location, implicitHCount: 4 - b.order });
    bonds.push({ type: b.order, atoms: [at.get(b.atom)!, atoms.length - 1] });
  }
  return { atoms, bonds };
}
// An InChI without its stereo layers, for the checks of marked atoms (OPSIN's atoms carry no stereo).
const flat = (inchi: string | undefined) => inchi?.split("/").filter((l, k) => k < 2 || !/^[btms]/.test(l)).join("/");
// The free ligand's InChI for the check of its name, and the bonds whose E or Z the chelate fixes (Ligand.fixed) by
// InChI's numbering (larger number first, as in its /b layer), from the AuxInfo's /N (InChI's atoms by the ligand's).
function fixedInchi(free: Mol, lig: Ligand, api: ComplexApi): { inchi: string; pairs: Set<string> } | undefined {
  const text = api.aux?.(free), lines = text?.split("\n"), n = lines && /\/N:([\d,]+)(?:\/|$)/.exec(lines[1] ?? "");
  if (!lines || !n || !lines[0].startsWith("InChI=")) return undefined;
  const at = new Map(n[1].split(",").map((x, k) => [lig.atoms[Number(x) - 1], k + 1])), pairs = new Set<string>();
  for (const b of lig.fixed!) {
    const [x, y] = b.split(" ").map((i) => at.get(Number(i)));
    if (!x || !y) return undefined;
    pairs.add(`${Math.max(x, y)}-${Math.min(x, y)}`);
  }
  return { inchi: unfixed(lines[0], pairs)!, pairs };
}
// An InChI with no E or Z for those bonds, nor for any whose E or Z is not given (?), in its /b layers: as the name
// cites none for them, the drawn ligand and OPSIN's structure for the name then compare. Every other E and Z counts.
function unfixed(inchi: string | undefined, pairs?: Set<string>): string | undefined {
  if (!inchi || !pairs) return inchi;
  return inchi.split("/").flatMap((l, k) => {
    if (k < 2 || l[0] !== "b") return [l];
    const kept = l.slice(1).split(",").filter((x) => { const y = /^(\d+-\d+)([-+?])$/.exec(x); return !y || (y[2] !== "?" && !pairs.has(y[1])); });
    return kept.length ? [`b${kept.join(",")}`] : [];
  }).join("/");
}

// OPSIN's structure for a name, from parseToAtoms: its SMILES, its heavy atoms with hydrogen counts and locants, and
// its bonds. Undefined for a name OPSIN does not read.
type Built = { smiles: string; el: string[]; q: number[]; iso: number[]; h: number[]; locs: string[][]; adj: number[][]; bonds: [number, number, number][] };
// OPSIN's structure as a graph, and as a structure for InChI with marked atoms (no stereo).
const asGraph = (b: Built): Graph => ({ atoms: b.el.map((el, i) => ({ el, charge: b.q[i], h: b.h[i] })), bonds: b.bonds.map(([a, c, o]) => ({ a, b: c, order: o as 1 | 2 | 3 })) });
const builtMol = (b: Built, marks: Map<number, number>): Mol => ({
  atoms: b.el.map((el, i) => ({ label: el, location: [0, 0, 0] as [number, number, number], implicitHCount: b.h[i], ...(b.q[i] ? { charge: b.q[i] } : {}), ...(marks.get(i) ?? b.iso[i] ? { isotope: marks.get(i) ?? b.iso[i] } : {}) })),
  bonds: b.bonds.map(([a, c, o]) => ({ type: o, atoms: [a, c] as [number, number] })),
});
const opsinOf = (name: string, api: ComplexApi) => (name.length <= 1000 && !/\s/.test(name) ? built(api.atoms(name)) : undefined);
function built(json: string | undefined): Built | undefined {
  if (!json || json.length > 2_000_000) return undefined;
  let raw: { smiles: string; atoms: [string, number, number, string][]; bonds: [number, number, number][] };
  try { raw = JSON.parse(json); } catch { return undefined; }
  if (typeof raw?.smiles !== "string" || !Array.isArray(raw.atoms) || !Array.isArray(raw.bonds) || raw.atoms.length > 4 * MOST_ATOMS) return undefined;
  const n = raw.atoms.length, nbr: number[][] = raw.atoms.map(() => []);
  for (const [a, b] of raw.bonds) { if (!(a >= 0 && a < n && b >= 0 && b < n)) return undefined; nbr[a].push(b); nbr[b].push(a); }
  // Plain hydrogens bonded to one heavy atom are counted on it.
  const folded = raw.atoms.map(([el, q, iso], i) => el === "H" && !q && !iso && nbr[i].length === 1 && raw.atoms[nbr[i][0]][0] !== "H");
  const index: number[] = [], out: Built = { smiles: raw.smiles, el: [], q: [], iso: [], h: [], locs: [], adj: [], bonds: [] };
  raw.atoms.forEach(([el, q, iso, locs], i) => {
    if (folded[i]) return;
    index[i] = out.el.length;
    out.el.push(el); out.q.push(q); out.iso.push(iso); out.h.push(0); out.locs.push(locs ? locs.split(" ") : []); out.adj.push([]);
  });
  raw.atoms.forEach((_, i) => { if (folded[i]) out.h[index[nbr[i][0]]]++; });
  for (const [a, b, o] of raw.bonds) {
    if (folded[a] || folded[b]) continue;
    out.adj[index[a]].push(index[b]); out.adj[index[b]].push(index[a]); out.bonds.push([index[a], index[b], o]);
  }
  return out;
}

// Atom maps from OPSIN's structure b onto the drawn ligand (its heavy atoms, by the graph): element, charge,
// hydrogens and neighbours must agree. Bond orders may not (Kekulé structures differ), so every use of a map is
// checked again by InChI. At most limit maps.
function maps(b: Built, g: Graph, atoms: number[], limit = 24): number[][] {
  // Hydrogens drawn as atoms count with the hydrogens of the atom they are bonded to, as OPSIN's do.
  const inside = new Set(atoms), nb = (i: number) => g.bonds.flatMap((x) => (x.a === i ? [x.b] : x.b === i ? [x.a] : [])).filter((j) => inside.has(j));
  const plainH = (i: number) => g.atoms[i].el === "H" && !g.atoms[i].charge && nb(i).length === 1 && g.atoms[nb(i)[0]].el !== "H";
  const heavy = atoms.filter((i) => !plainH(i)), at = new Map(heavy.map((i, k) => [i, k])), n = heavy.length;
  if (n !== b.el.length) return [];
  const h = heavy.map((i) => g.atoms[i].h + nb(i).filter(plainH).length), adj: number[][] = heavy.map((i) => nb(i).filter((j) => at.has(j)).map((j) => at.get(j)!));
  // Colours by refinement, shared by both graphs.
  const names = new Map<string, number>(), colour = (s: string) => { if (!names.has(s)) names.set(s, names.size); return names.get(s)!; };
  let ca = b.el.map((el, i) => colour(`${el} ${b.q[i]} ${b.h[i]} ${b.adj[i].length}`));
  let cb = heavy.map((i, k) => colour(`${g.atoms[i].el} ${g.atoms[i].charge} ${h[k]} ${adj[k].length}`));
  for (let round = 0; round < n; round++) {
    names.clear();
    const na = ca.map((c, i) => colour(`${c}|${b.adj[i].map((j) => ca[j]).sort((x, y) => x - y).join(",")}`));
    const nb = cb.map((c, k) => colour(`${c}|${adj[k].map((j) => cb[j]).sort((x, y) => x - y).join(",")}`));
    const same = new Set([...na, ...nb]).size === new Set([...ca, ...cb]).size;
    ca = na; cb = nb;
    if (same) break;
  }
  if ([...ca].sort((x, y) => x - y).join() !== [...cb].sort((x, y) => x - y).join()) return [];
  // Backtracking in breadth-first order of b.
  const order: number[] = [], seen = new Set<number>();
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    seen.add(s); order.push(s);
    for (let k = order.length - 1; k < order.length; k++) for (const j of b.adj[order[k]]) if (!seen.has(j)) { seen.add(j); order.push(j); }
  }
  const out: number[][] = [], to = Array<number>(n).fill(-1), used = Array<boolean>(n).fill(false);
  let steps = 0;
  const go = (k: number): void => {
    if (out.length >= limit || ++steps > 200_000) return;
    if (k === n) { out.push(to.map((t) => heavy[t])); return; }
    const i = order[k];
    for (let t = 0; t < n; t++) {
      if (used[t] || cb[t] !== ca[i]) continue;
      if (b.adj[i].some((j) => to[j] >= 0 && !adj[t].includes(to[j]))) continue;
      to[i] = t; used[t] = true;
      go(k + 1);
      to[i] = -1; used[t] = false;
    }
  };
  go(0);
  return out;
}

// ——— Ligand names ———
// A ligand's name in the complex (form), the InChI of the free ligand it names (key; for a carbon ligand, on silane),
// its charge as a free ligand, and for a carbon ligand the order of its bond to the metal. pairs: the bonds whose E or
// Z the chelate fixes, left out of key and of every InChI compared with it (fixedInchi).
type Named = { form: string; key: string; flat: string; charge: number; carbon?: number; pairs?: Set<string> };
// Enclosing marks as the namer nests them (P-16.5.4, IR-2.2): {[({[( )]})]}.
const enclose = (t: string) => encloseName({ text: t, compound: true });

// A locant as a sort key: 1 < 1' < 2 < 4a < 10.
const locKey = (l: string) => { const m = /^(\d+)([a-z]?)('*)$/.exec(l)!; return Number(m[1]) * 1000 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) * 10 + m[3].length; };
const primes = (k: number) => "'".repeat(k);
// A locant cited after an element in κ, as a sort key: numerals, then primes alone (O, O', O'').
const locScore = (l: string) => (/^\d/.test(l) ? locKey(l) : 1e6 + l.length);

// The name of a ligand as a free molecule or ion, checked by OPSIN, and its form in the complex (IR-9.2.2.3): an anion's
// -ate, -ide and -ite become -ato, -ido and -ito.
function nameLigand(m: Mol, g: Graph, lig: Ligand, api: ComplexApi): Named | undefined {
  if (lig.lex) return { form: LEX[lig.lex].form, key: `lex ${lig.lex}`, flat: `lex ${lig.lex}`, charge: LEX[lig.lex].charge };
  if (lig.carbon) {
    // A carbon ligand: the namer's prefix for the ligand on a placeholder in the metal's place (yl, ylidene).
    const b = lig.bonds[0], probe = ligandMol(m, g, lig, new Map(), true), want = api.inchi(probe);
    const graph = graphOf(probe, api.cip?.(probe));
    if (!graph || !want) return undefined;
    const si = graph.atoms.length - 1, d = lig.atoms.indexOf(b.atom);
    graph.atoms[si] = { el: "C", charge: 0, h: 0 };
    let text: string;
    try { const f = fold(graph), n = new Namer(f.g); n.perceive(); text = n.substituent(f.index[d], f.index[si]).text; } catch { return undefined; }
    if (!/(yl|ylidene|ylidyne)$/.test(text) || /\s/.test(text) || order(text) !== b.order) return undefined;
    const back = opsinOf(`(${text})silane`, api)?.smiles;
    if (!back || api.inchi(back) !== want) return undefined;
    return { form: text, key: want, flat: flat(want)!, charge: 0, carbon: b.order };
  }
  const free = ligandMol(m, g, lig), fx = lig.fixed && fixedInchi(free, lig, api), want = lig.fixed ? fx?.inchi : api.inchi(free);
  // The CIP labels of the free ligand, but none on the bonds whose E or Z the chelate fixes (Ligand.fixed).
  const cip = api.cip?.(free), at = (k: number) => key(lig.atoms[free.bonds[k].atoms[0]], lig.atoms[free.bonds[k].atoms[1]]);
  const graph = want && graphOf(free, cip && lig.fixed ? { ...cip, bonds: cip.bonds.map((l, k) => (lig.fixed!.has(at(k)) ? undefined : l)) } : cip);
  if (!graph) return undefined;
  // A ring assembly of three or more pyridine rings by its own name (terpyridine), or identical anionic units on a
  // benzene ring by a multiplicative name; else the namer's.
  const reads = (n: string | undefined) => { const back = n ? opsinOf(n, api)?.smiles : undefined; return !!back && unfixed(api.inchi(back), fx?.pairs) === want; };
  // The namer's name without multiplication (namer-multiplicative.ts): κ cites atoms of a parent and its substituents.
  const own = (!lig.charge ? assemblyName(graph) : multiplicativeName(graph, reads)) ?? undefined;
  let name = own && reads(own) ? own : substitutively(() => iupacNameWhy(graph).name);
  if (!name || (name !== own && !reads(name))) return undefined;
  // A porphyrin's anion as the Red Book names it (IR-9 Table VII: tpp, 5,10,15,20-tetraphenylporphyrin-21,23-diido;
  // pc, phthalocyanine-29,31-diido), with no indicated hydrogen at the anionic N atoms; a corrole's the same way
  // (corrole-21,22,23-triido).
  const book = name.replace(/-?(\d+H(?:,\d+H)*)-(porphyrin|phthalocyanine|corrole)-([\d,]+)-((?:di|tri)ide)$/, (all, h: string, parent: string, at: string, ide: string) => (h.replace(/H/g, "") === at ? `${parent}-${at}-${ide}` : all));
  if (book !== name && reads(book)) name = book;
  // An anion's ending, before any closing marks of a multiplied unit (bis(2,2-dimethylpropanoato)).
  const form = lig.charge < 0 ? (/(ate|ide|ite)[)\]}]*$/.test(name) ? name.replace(/e([)\]}]*)$/, "o$1") : undefined) : name;
  return form ? { form, key: want, flat: flat(want)!, charge: lig.charge, ...(fx ? { pairs: fx.pairs } : {}) } : undefined;
}

// Two identical anionic units on a benzene ring, with nothing else on the ring: a multiplicative name (P-15.3),
// 3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoate) for the ligand of Rh2(esp)2. Each unit is the namer's name for it
// with hydrogen where it was attached; the attachment's locant is the lowest for which the whole name reads back as
// the ligand (reads).
function multiplicativeName(g0: Graph, reads: (name: string) => boolean): string | undefined {
  const { g } = fold(g0), n = g.atoms.length;
  if (n > 200 || g.atoms.some((a) => a.cip) || g.bonds.some((b) => b.cip)) return undefined;
  const { adj, ord } = shapeOf(g);
  for (const start of g.atoms.keys()) {
    if (g.atoms[start].el !== "C") continue;
    // A benzene ring through start, in cycle order.
    const walk = (path: number[]): number[] | undefined => {
      if (path.length === 6) return adj[path[5]].includes(start) ? path : undefined;
      for (const j of adj[path[path.length - 1]]) if (!path.includes(j) && g.atoms[j].el === "C" && !g.atoms[j].charge && j > start) { const r = walk([...path, j]); if (r) return r; }
      return undefined;
    };
    const ring = walk([start]);
    if (!ring || ring.map((a, k) => ord.get(key(a, ring[(k + 1) % 6]))).filter((o) => o === 2).length !== 3) continue;
    const hangs = ring.flatMap((a, k) => adj[a].filter((j) => !ring.includes(j)).map((r) => ({ k, root: r })));
    if (hangs.length !== 2 || hangs.some((x) => ord.get(key(ring[x.k], x.root)) !== 1)) continue;
    const units = hangs.map((x) => parts(n, adj, (i) => !ring.includes(i)).find((p) => p.includes(x.root))!);
    if (units[0] === units[1] || units[0].length + units[1].length + 6 !== n) continue;
    // Each unit with hydrogen in the ring's place, named by the namer: alike units have one name.
    const names = units.map((u, k) => {
      const at = new Map(u.map((i, j) => [i, j]));
      const h: Graph = { atoms: u.map((i) => ({ ...g.atoms[i], ...(i === hangs[k].root ? { h: g.atoms[i].h + 1 } : {}) })), bonds: g.bonds.filter((b) => at.has(b.a) && at.has(b.b)).map((b) => ({ ...b, a: at.get(b.a)!, b: at.get(b.b)! })) };
      return iupacNameWhy(h).name;
    });
    if (!names[0] || names[0] !== names[1] || !/ate$/.test(names[0]) || /\s/.test(names[0])) return undefined;
    const d = Math.min((hangs[1].k - hangs[0].k + 6) % 6, (hangs[0].k - hangs[1].k + 6) % 6), linker = `1,${d + 1}-phenylene`;
    const unit = /^[a-z]+$/.test(names[0]) ? `di${names[0]}` : `bis${enclose(names[0])}`;
    for (let loc = 1; loc <= 12; loc++) { const name = `${loc},${loc}'-(${linker})${unit}`; if (reads(name)) return name; }
    return undefined;
  }
  return undefined;
}

// An unbranched ring assembly of three or more pyridine rings (P-28.2): 2,2':6',2''-terpyridine, with the rings
// primed in turn and its junctions as low as possible, then its substituents as prefixes with locants as low as
// possible (P-31.1.4): 4'-(4-methoxyphenyl)-2,2':6',2''-terpyridine. Undefined for anything else; the namer names
// those (6-(pyridin-2-yl)-2,2'-bipyridine is right too, but not the assembly's name).
const ASSEMBLY = ["", "", "bi", "ter", "quater", "quinque", "sexi"];
function assemblyName(g0: Graph): string | undefined {
  const { g } = fold(g0), n = g.atoms.length;
  if (n > 200 || g.atoms.some((a) => a.cip) || g.bonds.some((b) => b.cip)) return undefined;
  const s = shapeOf(g), { adj, ord } = s, el = (i: number) => g.atoms[i].el;
  // Pyridine rings: six atoms, one N, alternating single and double bonds, no charge.
  const rings: number[][] = [];
  for (const nAtom of g.atoms.keys()) {
    if (el(nAtom) !== "N" || g.atoms[nAtom].charge || adj[nAtom].length !== 2) continue;
    const walk = (path: number[]): number[] | undefined => {
      const last = path[path.length - 1];
      if (path.length === 6) return adj[last].includes(nAtom) ? path : undefined;
      for (const j of adj[last]) if (!path.includes(j) && el(j) === "C" && !g.atoms[j].charge) { const r = walk([...path, j]); if (r) return r; }
      return undefined;
    };
    const ring = walk([nAtom]);
    if (!ring) continue;
    const orders = ring.map((a, k) => ord.get(key(a, ring[(k + 1) % 6])));
    if (orders.filter((o) => o === 2).length === 3 && orders.every((o, k) => o !== orders[(k + 1) % 6])) rings.push(ring);
  }
  // Joined in a chain by single bonds between ring atoms.
  const ringOf = new Map(rings.flatMap((r, k) => r.map((a) => [a, k] as [number, number])));
  const links = rings.map(() => [] as { to: number; a: number; b: number }[]);
  for (const b of g.bonds) {
    const [ra, rb] = [ringOf.get(b.a), ringOf.get(b.b)];
    if (ra !== undefined && rb !== undefined && ra !== rb) { if (b.order !== 1) return undefined; links[ra].push({ to: rb, a: b.a, b: b.b }); links[rb].push({ to: ra, a: b.b, b: b.a }); }
  }
  const used = rings.map((_, k) => k).filter((k) => links[k].length);
  if (used.length < 3 || used.length >= ASSEMBLY.length || used.some((k) => links[k].length > 2) || new Set(used.flatMap((k) => links[k].map((l) => `${Math.min(k, l.to)} ${Math.max(k, l.to)}`))).size !== used.length - 1) return undefined;
  const ends = used.filter((k) => links[k].length === 1);
  if (ends.length !== 2) return undefined;
  const chain = [ends[0]];
  while (chain.length < used.length) chain.push(links[chain[chain.length - 1]].find((l) => !chain.includes(l.to))!.to);
  // Substituents: what hangs on a ring atom outside the assembly, each a group of its own.
  const inside = new Set(chain.flatMap((k) => rings[k]));
  const subs: { at: number; root: number; atoms: number[] }[] = [];
  for (const a of inside) for (const r of adj[a]) {
    if (inside.has(r)) continue;
    const atoms = parts(n, adj, (i) => !inside.has(i)).find((p) => p.includes(r))!;
    if (atoms.some((i) => i !== r && adj[i].some((j) => inside.has(j)))) return undefined; // a group joined twice
    subs.push({ at: a, root: r, atoms });
  }
  if (inside.size + subs.reduce((t, x) => t + x.atoms.length, 0) !== n) return undefined;
  let names: Name[];
  try {
    names = subs.map((x) => { const piece = shapeSub(g, x.atoms, x.root), nm = new Namer(piece.g); nm.perceive(); return nm.substituent(piece.root, piece.place); });
  } catch { return undefined; }
  const cited = [...new Set(names.map((x) => x.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)));
  // Each numbering: one end ring first, each ring from its N one way round. The lowest junction locants in the order
  // cited, then the lowest substituent locants, then the lowest for the substituent cited first (P-31.1.4).
  let best: { score: number[][]; loc: Map<number, string>; order: number[] } | undefined;
  for (const order of [chain, [...chain].reverse()]) {
    for (let dirs = 0; dirs < 1 << order.length; dirs++) {
      const loc = new Map<number, string>();
      order.forEach((k, r) => { const ring = rings[k], d = (dirs >> r) & 1; ring.forEach((_, p) => loc.set(ring[d ? (6 - p) % 6 : p], `${p + 1}${primes(r)}`)); });
      const junctions = order.slice(1).flatMap((k, r) => { const l = links[order[r]].find((x) => x.to === k)!; return [loc.get(l.a)!, loc.get(l.b)!]; });
      const at = (keep: (i: number) => boolean) => subs.flatMap((x, i) => (keep(i) ? [locKey(loc.get(x.at)!)] : [])).sort((p, q) => p - q);
      const score = [junctions.map(locKey), at(() => true), ...cited.map((t) => at((i) => names[i].text === t))];
      if (!best || score.reduce((d, l, k) => d || compare(l, best!.score[k]), 0) < 0) best = { score, loc, order };
    }
  }
  if (!best) return undefined;
  const { loc, order } = best, prefixes = assemblePrefixes(subs.map((x, i) => ({ loc: loc.get(x.at)!, name: names[i] })), false);
  const junctions = order.slice(1).map((k, r) => { const l = links[order[r]].find((x) => x.to === k)!; return `${loc.get(l.a)},${loc.get(l.b)}`; }).join(":");
  return joinPrefixes(prefixes, `${junctions}-${ASSEMBLY[order.length]}pyridine`);
}
// A substituent group as a graph of its own, with a placeholder atom where it was attached.
function shapeSub(g: Graph, atoms: number[], root: number): { g: Graph; root: number; place: number } {
  const at = new Map(atoms.map((i, k) => [i, k]));
  const out: Graph = { atoms: atoms.map((i) => ({ ...g.atoms[i] })), bonds: g.bonds.filter((b) => at.has(b.a) && at.has(b.b)).map((b) => ({ ...b, a: at.get(b.a)!, b: at.get(b.b)! })) };
  out.atoms.push({ el: "C", charge: 0, h: 0 });
  out.bonds.push({ a: at.get(root)!, b: out.atoms.length - 1, order: 1 });
  return { g: out, root: at.get(root)!, place: out.atoms.length - 1 };
}
const order = (prefix: string) => (prefix.endsWith("ylidyne") ? 3 : prefix.endsWith("ylidene") ? 2 : 1);
// Hydrogens drawn as atoms, counted on the atom they are bonded to (as the namer does), and where each atom went.
function fold(g: Graph): { g: Graph; index: number[] } {
  const deg = g.atoms.map(() => 0);
  for (const b of g.bonds) { deg[b.a]++; deg[b.b]++; }
  const drop = g.atoms.map((a, i) => a.el === "H" && !a.charge && !a.h && deg[i] === 1 && g.bonds.some((b) => (b.a === i && g.atoms[b.b].el !== "H") || (b.b === i && g.atoms[b.a].el !== "H")));
  const index: number[] = [], atoms: Graph["atoms"] = [];
  g.atoms.forEach((a, i) => { if (!drop[i]) { index[i] = atoms.length; atoms.push({ ...a }); } });
  for (const b of g.bonds) { if (drop[b.a]) atoms[index[b.b]].h++; else if (drop[b.b]) atoms[index[b.a]].h++; }
  return { g: { atoms, bonds: g.bonds.filter((b) => !drop[b.a] && !drop[b.b]).map((b) => ({ ...b, a: index[b.a], b: index[b.b] })) }, index };
}

// ——— η ligands (IR-10.2.5.1) ———
// An η ligand's name with η before the part of the name that holds its bonded atoms: η6-benzene, η2-ethene,
// 1,2,3,4,5-pentamethyl-η5-cyclopenta-2,4-dien-1-ido, where the bonded atoms are all the atoms of that part; else η
// before the whole name, or the bonded atoms' locants before η (etaLocants).
function etaForm(c: Context, k: number): string | undefined {
  const form = c.named[k].form, n = c.e.ligands[k].eta!;
  for (const p of starts(form)) {
    const part = form.slice(p);
    if (etaPart(c, k, part)) return p === 0 ? `η${n}-${form}` : `${form.slice(0, p)}${form[p - 1] === "-" ? "" : "-"}η${n}-${part}`;
  }
  // Bonded through all its unsaturated atoms, in one run: η before the name, after its stereodescriptors
  // ((2Z)-η2-but-2-ene, as the Red Book's (E)-η2-but-2-enal).
  const stereo = STEREO_PREFIX.exec(form)?.[0] ?? "";
  if (etaWhole(c, k)) return `${stereo}η${n}-${form.slice(stereo.length)}`;
  return etaLocants(c, k);
}
const STEREO_PREFIX = /^\((?:\d*[EZRS])(?:,\d*[EZRS])*\)-/;
// Whether an η ligand's bonded atoms are exactly its unsaturated atoms (in a multiple bond in the ligand, or
// with a charge) and form one run: IR-10.2.5.1 then needs no locants.
function etaWhole(c: Context, k: number): boolean {
  const { g, e } = c, lig = e.ligands[k], own = new Set(lig.atoms), donors = new Set(lig.bonds.map((b) => b.atom));
  const unsaturated = lig.atoms.filter((i) => g.atoms[i].charge || g.bonds.some((b) => b.order > 1 && (b.a === i || b.b === i) && own.has(b.a) && own.has(b.b)));
  if (unsaturated.length !== donors.size || unsaturated.some((i) => !donors.has(i))) return false;
  const adj = g.atoms.map(() => [] as number[]);
  for (const b of g.bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
  return parts(g.atoms.length, adj, (i) => donors.has(i)).length === 1;
}
// An η ligand bonded through only some of its atoms, or through atoms that are not contiguous: the locants of the bonded
// atoms in the ligand's name, then η, in parentheses before the name (IR-10.2.5.1): [(1,2,5,6-η)-cycloocta-1,5-diene],
// [(1–4-η)-cyclohexa-1,3-diene]. A run of more than two atoms with consecutive locants is cited as a range (1–4).
// Of the locant sets OPSIN's numbering gives the bonded atoms, the lowest that reads back: the name with each cited atom
// marked must be the ligand marked at its bonded atoms.
function etaLocants(c: Context, k: number): string | undefined {
  const { m, g, e, api } = c, lig = e.ligands[k], named = c.named[k], donors = [...new Set(lig.bonds.map((b) => b.atom))];
  const b = opsinOf(nameOfForm(named.form, named.charge), api), drawn = markedInchi(m, g, lig, [donors], api);
  if (!b || !drawn) return undefined;
  const options = new Map<string, number[]>();
  for (const map of maps(b, free(g, lig), lig.atoms)) {
    const back = new Map(map.map((d, i) => [d, i])), locs = donors.map((d) => (back.has(d) ? b.locs[back.get(d)!].find((l) => /^\d+[a-z]?'*$/.test(l)) : undefined));
    if (locs.some((l) => !l)) continue;
    const sorted = (locs as string[]).sort((x, y) => locKey(x) - locKey(y));
    options.set(sorted.join(","), sorted.map(locKey));
  }
  for (const [text] of [...options].sort((x, y) => compare(x[1], y[1])).slice(0, 3)) {
    const locs = text.split(","), cited = etaCited(b, locs);
    if (cited && readKappa(`${named.form}-${kappaText(cited, [...new Set(cited.map((x) => x.el))].sort())}`, named.charge, (el) => MARK[el]?.[0], api) === drawn) return `(${etaRange(b, locs)}-η)-${named.form}`;
  }
  return undefined;
}
// Each locant's atom in OPSIN's structure for a name (exactly one atom with it), as a cited atom for κ.
function etaCited(b: Built, locs: string[]): Cited[] | undefined {
  const out: Cited[] = [];
  for (const l of locs) {
    const at = b.locs.flatMap((ls, i) => (ls.includes(l) ? [i] : []));
    if (at.length !== 1) return undefined;
    out.push({ el: b.el[at[0]], loc: l });
  }
  return out;
}
// Locants in order, a run of three or more consecutive numbers whose atoms are bonded in turn as a range (1–4).
function etaRange(b: Built, locs: string[]): string {
  const at = (l: string) => b.locs.findIndex((ls) => ls.includes(l)), out: string[][] = [];
  for (const l of locs) {
    const run = out[out.length - 1], last = run?.[run.length - 1];
    if (last && /^\d+$/.test(l) && /^\d+$/.test(last) && Number(l) === Number(last) + 1 && b.adj[at(last)].includes(at(l))) run.push(l); else out.push([l]);
  }
  return out.map((r) => (r.length > 2 ? `${r[0]}–${r[r.length - 1]}` : r.join(","))).join(",");
}
// The locants of an η term ((1–4,6-η)): each range written out.
function etaLocs(t: string): string[] | undefined {
  const out: string[] = [];
  for (const x of t.split(",")) {
    const r = /^(\d+)–(\d+)$/.exec(x);
    if (r) { const [a, z] = [Number(r[1]), Number(r[2])]; if (z - a < 2 || z - a > 12) return undefined; for (let n = a; n <= z; n++) out.push(String(n)); }
    else if (/^\d+[a-z]?'*$/.test(x)) out.push(x);
    else return undefined;
  }
  return out.length >= 2 && out.length <= 8 && new Set(out).size === out.length ? out : undefined;
}
// Whether a part of an η ligand's name, read by OPSIN alone, has as many atoms other than hydrogen as the ligand has
// bonded atoms, of the same elements joined the same way.
function etaPart(c: Context, k: number, part: string): boolean {
  const { g, e, api } = c, lig = e.ligands[k], donors = [...new Set(lig.bonds.map((b) => b.atom))];
  const b = opsinOf(nameOfForm(part, /(ato|ido|ito)[)\]}]*$/.test(part) ? -1 : 0), api);
  if (!b || !lig.eta || donors.length !== lig.eta) return false;
  const heavy = b.el.flatMap((el, i) => (el === "H" ? [] : [i]));
  if (heavy.length !== donors.length) return false;
  const nb = (i: number) => g.bonds.flatMap((x) => (x.a === i ? [x.b] : x.b === i ? [x.a] : [])).filter((j) => donors.includes(j));
  const to = new Map<number, number>(), used = new Set<number>();
  const go = (t: number): boolean => {
    if (t === heavy.length) return true;
    const i = heavy[t];
    for (const d of donors) {
      if (used.has(d) || g.atoms[d].el !== b.el[i] || nb(d).length !== b.adj[i].filter((j) => b.el[j] !== "H").length) continue;
      if (b.adj[i].some((j) => to.has(j) && !nb(d).includes(to.get(j)!))) continue;
      to.set(i, d); used.add(d);
      if (go(t + 1)) return true;
      to.delete(i); used.delete(d);
    }
    return false;
  };
  return go(0);
}

// ——— κ terms ———
// A ligand's donor atoms to each metal, in the order of the metals given.
const donorGroups = (lig: Ligand, metals: number[]) => metals.map((x) => [...new Set(lig.bonds.filter((b) => b.metal === x).map((b) => b.atom))]);

// Whether a ligand needs κ (IR-9.2.4.1). Not with one donor atom and no other atom that could be one (pyridine,
// triphenylphosphane), nor for one O of a carboxylate group whose two O atoms are the only atoms that could be
// (acetato), nor for ligands with names of their own or carbon ligands, whose names say how they bond.
function needsKappa(g: Graph, lig: Ligand): boolean {
  if (lig.lex || lig.carbon || lig.eta) return false;
  const donors = [...new Set(lig.bonds.map((b) => b.atom))], potential = lig.atoms.filter((i) => DONORS.has(g.atoms[i].el));
  if (donors.length === 1 && potential.length === 1) return false;
  return !(donors.length === 1 && potential.length === 2 && carboxylate(g, lig, potential));
}
// The two O atoms of one carboxylate group of the ligand (a C bonded to both and to one other atom).
function carboxylate(g: Graph, lig: Ligand, os: number[]): boolean {
  if (os.some((o) => g.atoms[o].el !== "O")) return false;
  const nb = (i: number) => g.bonds.filter((b) => (b.a === i || b.b === i) && lig.atoms.includes(b.a) && lig.atoms.includes(b.b)).map((b) => (b.a === i ? b.b : b.a));
  const c = nb(os[0]);
  return c.length === 1 && nb(os[1]).length === 1 && c[0] === nb(os[1])[0] && g.atoms[c[0]].el === "C" && nb(c[0]).length === 3;
}

// The κ term for each metal (in the order given; "" for a metal the ligand is not bonded to), cited at the end of
// the ligand's name: with OPSIN's locants where it numbers the donor atoms (κ2N1,N1'); else, with one metal, with κ
// in the parts of the name that hold them (form: the name with those terms); else with primes (κ2O,O'). Undefined
// when none cites the donors without doubt.
type Kappas = { parts: string[]; form?: string };
function kappaParts(m: Mol, g: Graph, lig: Ligand, named: Named, metals: number[], api: ComplexApi, located = false): Kappas | undefined {
  const groups = donorGroups(lig, metals), els = [...new Set(groups.flat().map((d) => g.atoms[d].el))].sort();
  if (groups.flat().some((d) => !MARK[g.atoms[d].el])) return undefined;
  // Kept between calls by the ligand marked at its donor atoms, metal by metal (found ones only).
  const k = `${named.key}|${located}|${markedInchi(m, g, lig, groups, api)}`, kept = kappaMemo.get(k);
  if (kept) return kept;
  const numbers = numbered(m, g, lig, named, groups, els, api);
  const portion = numbers ? undefined : (located ? undefined : portioned(m, g, lig, named, groups, els, api)) ?? unitKappa(m, g, lig, named, groups, els, api, located);
  const primes = numbers || portion ? undefined : primed(m, g, lig, groups, els, api);
  const found = numbers ? { parts: numbers } : portion ? { parts: [portion.kappa], form: portion.form } : primes ? { parts: primes } : undefined;
  if (found) { if (kappaMemo.size > 400) kappaMemo.clear(); kappaMemo.set(k, found); }
  return found;
}
const kappaMemo = new Map<string, Kappas>();
// A group's κ: each element in turn, with its count (κ2N1,N1', κN1,κO).
const kappaText = (cited: { el: string; loc: string }[], els: string[]) => els.filter((el) => cited.some((c) => c.el === el)).map((el) => {
  const ls = cited.filter((c) => c.el === el).map((c) => c.loc);
  return `κ${ls.length > 1 ? ls.length : ""}${ls.map((l) => `${el}${l}`).join(",")}`;
}).join(",");

// κ with OPSIN's locants at the end of the ligand's name: each donor atom cited by its element and its locant in
// OPSIN's numbering of the name (κ2N1,N1'). Checked by reading the name with the cited atoms marked (readKappa): it
// must be the drawn ligand marked at its donor atoms.
function numbered(m: Mol, g: Graph, lig: Ligand, named: Named, groups: number[][], els: string[], api: ComplexApi): string[] | undefined {
  const b = opsinOf(nameOfForm(named.form, named.charge), api);
  if (!b) return undefined;
  // A donor atom's locant: its numeral in OPSIN's numbering (N1), else its element locant there (the primes of O''),
  // if no other atom has it.
  const locOf = (i: number, el: string) => b.locs[i].find((l) => /^\d+[a-z]?'*$/.test(l))
    ?? b.locs[i].find((l) => l.startsWith(el) && /^'*$/.test(l.slice(el.length)) && b.locs.filter((x) => x.includes(l)).length === 1)?.slice(el.length);
  // Each way OPSIN's atoms map onto the drawn ligand gives the donors locants; the lowest set first (P-31.1.4).
  const options = new Map<string, { parts: string[]; score: number[] }>();
  for (const map of maps(b, free(g, lig), lig.atoms)) {
    const back = new Map(map.map((d, i) => [d, i]));
    const cited = groups.map((ds) => ds.map((d) => ({ el: g.atoms[d].el, loc: back.has(d) ? locOf(back.get(d)!, g.atoms[d].el) : undefined })));
    if (cited.flat().some((c) => c.loc === undefined)) continue;
    cited.forEach((cs) => cs.sort((x, y) => locScore(x.loc!) - locScore(y.loc!)));
    const parts = cited.map((cs) => kappaText(cs as Cited[], els));
    options.set(parts.join(":"), { parts, score: cited.flatMap((cs) => cs.map((c) => locScore(c.loc!))) });
  }
  const drawn = markedInchi(m, g, lig, groups, api);
  for (const o of [...options.values()].sort((x, y) => compare(x.score, y.score)).slice(0, 3)) {
    // With each group's metal as a locant, so that the marks follow the metals as the groups do.
    const text = `${named.form}-${o.parts.map((p, j) => (p ? p.replace(/(^|,)κ/g, `$1${j + 1}κ`) : "")).filter(Boolean).join(":")}`;
    if (drawn && readKappa(text, named.charge, (el, _, y) => MARK[el]?.[y.metal! - 1], api) === drawn) return o.parts;
  }
  return undefined;
}
// κ in the parts of a ligand's name (IR-9.2.4.2): a donor atom in a substituent group is cited after that group's
// name in its enclosing marks, one of the parent after the whole name: 2-[4-(4-methoxyphenyl)-6-(pyrimidin-2-yl-κN1)
// pyridin-2-yl-κN1]pyrimidine-κN1. One metal only. Gives the name with κ in its parts, and the term for its end.
function portioned(m: Mol, g: Graph, lig: Ligand, named: Named, groups: number[][], els: string[], api: ComplexApi): { form: string; kappa: string } | undefined {
  if (groups.length !== 1) return undefined;
  const donors = groups[0], name = named.form, nodes = nodesOf(name, free(g, lig), lig.atoms, api), b0 = opsinOf(nameOfForm(name, named.charge), api);
  if (!nodes || !b0) return undefined;
  const heavy = (xs: number[]) => xs.filter((i) => g.atoms[i].el !== "H");
  // Each donor's part: the smallest group holding it, else the parent.
  const own = (k: number, side: number[]) => side.filter((i) => !nodes.some((x) => x.parent === k && x.copies.some((y) => y.side.includes(i))));
  const rootOwn = heavy(lig.atoms).filter((i) => !nodes.some((x) => x.parent < 0 && x.copies.some((y) => y.side.includes(i))));
  // The κ text for donor atoms of one part, by OPSIN's locants for that part (map: OPSIN atom to drawn atom), or the
  // element alone where the part's own atoms have one atom of it, or all alike.
  const cite = (ds: number[], ownAtoms: number[], b: Built, map: number[]) => {
    const back = new Map(map.map((d, i) => [d, i])), cited: Cited[] = [];
    for (const d of ds) {
      const el = g.atoms[d].el, same = heavy(ownAtoms).filter((i) => g.atoms[i].el === el);
      const loc = b.locs[back.get(d)!]?.find((l) => /^\d+[a-z]?'*$/.test(l));
      if (loc) cited.push({ el, loc });
      else if (ds.filter((x) => g.atoms[x].el === el).length === 1 && (same.length === 1 || alike(m, g, lig, same, api))) cited.push({ el, loc: "" });
      else return undefined;
    }
    cited.sort((x, y) => (x.el === y.el ? (x.loc && y.loc ? locKey(x.loc) - locKey(y.loc) : 0) : x.el < y.el ? -1 : 1));
    return { text: kappaText(cited, els), score: cited.map((x) => (x.loc ? locKey(x.loc) : 0)) };
  };
  const best = (ds: number[], ownAtoms: number[], b: Built, ms: number[][]) => {
    let out: { text: string; score: number[] } | undefined;
    for (const map of ms) { const c = cite(ds, ownAtoms, b, map); if (c && (!out || compare(c.score, out.score) < 0)) out = c; }
    return out?.text;
  };
  const inserts: { at: number; text: string }[] = [];
  let left = new Set(donors);
  for (const [k, x] of nodes.entries()) {
    const texts = x.copies.map((y) => {
      const mine = own(k, y.side), ds = donors.filter((d) => mine.includes(d));
      ds.forEach((d) => left.delete(d));
      return ds.length ? best(ds, mine, x.b, y.maps) : "";
    });
    if (texts.some((t) => t === undefined) || new Set(texts).size > 1) return undefined;
    if (texts[0]) inserts.push({ at: x.end, text: `-${texts[0]}` });
  }
  const rootDonors = [...left];
  if (rootDonors.some((d) => !rootOwn.includes(d)) || !inserts.length) return undefined;
  const kappa = rootDonors.length ? best(rootDonors, rootOwn, b0, maps(b0, free(g, lig), lig.atoms)) : "";
  if (kappa === undefined) return undefined;
  const form = inserts.sort((p, q) => q.at - p.at).reduce((s, x) => s.slice(0, x.at) + x.text + s.slice(x.at), name);
  // The check: the name with these κ terms read with the cited atoms marked is the ligand marked at its donors.
  const drawn = markedInchi(m, g, lig, groups, api);
  return drawn && readKappa(`${form}${kappa ? `-${kappa}` : ""}`, named.charge, (el) => MARK[el]?.[0], api) === drawn ? { form, kappa } : undefined;
}

// κ in the multiplied unit of a multiplicative name, where every unit bonds alike: one term in the unit's enclosing
// marks, multiplied with it (IR-9.2.4.2), citing the unit's donor atoms metal by metal with primes, which are OPSIN's
// element locants in the unit: 3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoato-κO:κO'), each carboxylate O to one Rh.
function unitKappa(m: Mol, g: Graph, lig: Ligand, named: Named, groups: number[][], els: string[], api: ComplexApi, located = false): { form: string; kappa: string } | undefined {
  const x = /^(.*\))(bis|di)([([{]?)(.*?)([)\]}]?)$/.exec(named.form), units = 2;
  if (!x || (x[3] && closing(named.form, x[1].length + x[2].length) !== named.form.length - 1)) return undefined;
  // Each unit's donors to each metal, element by element, as many as the drawing has over the units.
  const counts = groups.map((ds) => els.map((el) => ds.filter((d) => g.atoms[d].el === el).length / units));
  if (counts.flat().some((c) => !Number.isInteger(c))) return undefined;
  const drawn = markedInchi(m, g, lig, groups, api);
  for (const reverse of [false, true]) {
    const next = new Map<string, number>(), order = reverse ? [...groups.keys()].reverse() : [...groups.keys()], text: string[] = [];
    for (const j of order) text[j] = kappaText(els.flatMap((el, e) => Array.from({ length: counts[j][e] }, () => { const k = next.get(el) ?? 0; next.set(el, k + 1); return { el, loc: primes(k) }; })), els);
    // With unlike metals, each group with its metal's locant (1κO:2κO').
    if (located) text.forEach((t, j) => { if (t) text[j] = t.replace(/(^|,)κ/g, `$1${j + 1}κ`); });
    const kappa = text.filter(Boolean).join(":");
    if (!kappa) return undefined;
    const form = x[3] ? `${x[1]}${x[2]}${x[3]}${x[4]}-${kappa}${x[5]}` : `${x[1]}bis(${x[4]}-${kappa})`;
    if (drawn && readKappa(form, named.charge, (el, j, y) => MARK[el]?.[y.metal !== undefined ? y.metal - 1 : j], api) === drawn) return { form, kappa: "" };
    if (groups.length < 2) break;
  }
  return undefined;
}

// The parts of a ligand's name in enclosing marks that name substituent groups (pyrimidin-2-yl), each with the group
// or groups (bis) of the structure it names: OPSIN's structure for the part on silane must be that group with silane
// where it was attached. The structure is the drawn ligand (g, its atoms) or OPSIN's own for the whole name.
type Part = { start: number; end: number; parent: number; b: Built; copies: { side: number[]; maps: number[][] }[] };
function nodesOf(name: string, g: Graph, atoms: number[], api: ComplexApi): Part[] | undefined {
  const inside = new Set(atoms), nb = atoms.map(() => [] as number[]), at = new Map(atoms.map((i, k) => [i, k]));
  for (const x of g.bonds) if (inside.has(x.a) && inside.has(x.b)) { nb[at.get(x.a)!].push(x.b); nb[at.get(x.b)!].push(x.a); }
  const adj = (i: number) => nb[at.get(i)!];
  const heavyCount = (xs: number[]) => xs.filter((i) => g.atoms[i].el !== "H" || g.atoms[i].charge || adj(i).length !== 1).length;
  // Each single bond in no ring, both ways: the group beyond it.
  const sides: { from: number; side: number[]; heavy: number }[] = [], adjAll = g.atoms.map((_, i) => (inside.has(i) ? adj(i) : []));
  for (const x of g.bonds) {
    if (x.order !== 1 || !inside.has(x.a) || !inside.has(x.b) || g.atoms[x.a].el === "H" || g.atoms[x.b].el === "H") continue;
    if (linked(adjAll, x.a, x.b, (i) => inside.has(i))) continue;
    for (const [u, v] of [[x.a, x.b], [x.b, x.a]]) {
      const side = [v], seen = new Set(side);
      for (let k = 0; k < side.length; k++) for (const j of adj(side[k])) if (j !== u && !seen.has(j)) { seen.add(j); side.push(j); }
      sides.push({ from: u, side, heavy: heavyCount(side) });
    }
  }
  const out: Part[] = [], used = new Set<string>();
  for (let i = 0; i < name.length; i++) {
    if (!"([{".includes(name[i])) continue;
    if (out.length >= 40) return undefined;
    const end = closing(name, i), content = end > 0 ? name.slice(i + 1, end) : "";
    if (!/[a-z]{2}/.test(content)) continue;
    const b = opsinOf(`(${content})silane`, api), si = b ? b.el.lastIndexOf("Si") : -1;
    if (!b || si < 0) continue;
    const count = (/(bis|tris|tetrakis|pentakis|hexakis|di|tri|tetra|penta|hexa)$/.exec(name.slice(0, i))?.[1] ?? "");
    const n = count ? Math.max(MULT.indexOf(count), MULTK.indexOf(count)) : 1;
    let parent = out.length - 1;
    while (parent >= 0 && !(out[parent].start < i && out[parent].end > end)) parent--;
    const within = (side: number[]) => parent < 0 || out[parent].copies.some((y) => side.every((s) => y.side.includes(s)));
    const copies: Part["copies"] = [];
    for (const s of sides) {
      if (copies.length === n || used.has(`${s.from} ${s.side[0]}`) || s.heavy !== b.el.length - 1 || !within(s.side)) continue;
      const gSi: Graph = { atoms: g.atoms.map((a, j) => (j === s.from ? { el: "Si", charge: 0, h: 3 } : a)), bonds: g.bonds };
      const ms = maps(b, gSi, [...s.side, s.from]).filter((map) => map[si] === s.from);
      if (ms.length) copies.push({ side: s.side, maps: ms });
    }
    if (copies.length !== n) return undefined;
    copies.forEach((y) => used.add(`${sides.find((s) => s.side === y.side)!.from} ${y.side[0]}`));
    out.push({ start: i, end, parent, b, copies });
  }
  return out;
}

// The drawing's graph with the ligand's donor atoms charged as in the free ligand.
const free = (g: Graph, lig: Ligand): Graph => (lig.q.size ? { atoms: g.atoms.map((a, i) => (lig.q.has(i) ? { ...a, charge: lig.q.get(i)! } : a)), bonds: g.bonds } : g);
// The drawn ligand marked at its donor atoms, one isotope for each group (metal), as an InChI without stereo.
const markedInchi = (m: Mol, g: Graph, lig: Ligand, groups: number[][], api: ComplexApi) =>
  groups.flat().some((d) => !MARK[g.atoms[d].el]) ? undefined : flat(api.inchi(ligandMol(m, g, lig, new Map(groups.flatMap((ds, k) => ds.map((d) => [d, MARK[g.atoms[d].el][k]] as [number, number]))))));
const compare = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d; } return 0; };

// A κ term in a ligand's name: where it was in the name without κ (the end of its part), and its groups (one for
// each metal) of cited atoms.
type KappaTerm = { at: number; groups: { metal?: number; atoms: Cited[] }[] };
const ITEM = "[A-Z][a-z]?(?:\\d+[a-z]?)?'*", SEG = `\\d?κ\\d*${ITEM}(?:,${ITEM})*`;
const KAPPA_RE = new RegExp(`-(${SEG}(?:[,:]${SEG})*)(?=[)\\]}]|$)`, "g");
// The κ terms of a ligand's name, which follow the whole name or a part in enclosing marks, and the name without them.
function kappaTerms(text: string): { plain: string; terms: KappaTerm[] } | undefined {
  let plain = "", last = 0;
  const terms: KappaTerm[] = [];
  for (const x of text.matchAll(KAPPA_RE)) {
    const groups = parseKappa(x[1]);
    if (!groups) return undefined;
    plain += text.slice(last, x.index);
    terms.push({ at: plain.length, groups });
    last = x.index! + x[0].length;
  }
  return { plain: plain + text.slice(last), terms };
}
// A ligand's name with κ terms, read as OPSIN reads it with the cited atoms marked (mass gives each cited atom's
// isotope): the InChI of that structure, without stereo layers. Each term's isotope descriptor ((1,1'-15N2)) goes
// before the last component of the part the term follows (the part κ cites, IR-9.2.4.2): of the places a component
// can start there, the rightmost that OPSIN reads. So a locant of an atom outside that component finds no atom and
// the name is not read. An element without a locant (κO) must be the only atom of its element in its part.
function readKappa(text: string, charge: number, mass: (el: string, k: number, group: { metal?: number }) => number | undefined, api: ComplexApi): string | undefined {
  const parsed = kappaTerms(text);
  if (!parsed || !parsed.terms.length || parsed.terms.length > 12) return undefined;
  const plain = nameOfForm(parsed.plain, charge), depth: number[] = [];
  for (let i = 0, d = 0; i < plain.length; i++) { if (")]}".includes(plain[i])) d--; depth.push(d); if ("([{".includes(plain[i])) d++; }
  const insert = (s: string, p: number, desc: string) => { const after = s.slice(p); return `${s.slice(0, p)}(${desc})${/^[\d([{]/.test(after) ? "-" : ""}${after}`; };
  const placed: { p: number; desc: string }[] = [];
  for (const term of parsed.terms) {
    // The part: the whole name, or the enclosing marks the term closed.
    const end = term.at, root = end === plain.length;
    let start = 0;
    if (!root) { for (start = end - 1; start >= 0 && !(depth[start] === depth[end] && "([{".includes(plain[start])); start--); start++; }
    if (!root && (start <= 0 || !")]}".includes(plain[end]))) return undefined;
    // Each atom by its locant; by OPSIN's element locant (O, O', as in κO:κO') where the term cites several atoms of
    // its element with primes; or with none where it cites one atom of its element.
    const part = plain.slice(start, end), by = new Map<string, string[]>(), cited = term.groups.flatMap((x) => x.atoms);
    const single = (a: Cited) => !a.loc && cited.filter((b) => b.el === a.el).length === 1;
    for (const [k, g] of term.groups.entries()) for (const a of g.atoms) {
      const m = mass(a.el, k, g);
      if (!m) return undefined;
      by.set(`${m}${a.el}`, [...(by.get(`${m}${a.el}`) ?? []), /^\d/.test(a.loc) ? a.loc : single(a) ? "" : `${a.el}${a.loc}`]);
    }
    // An element cited without a locant: the part's own atoms (not those of the groups in its own enclosing marks)
    // have one atom of it, or all of them alike, in OPSIN's structure for the name.
    const unlocanted = cited.filter(single).map((a) => a.el);
    if (unlocanted.length) {
      const b = opsinOf(plain, api), whole = b && asGraph(b), all = b ? b.el.map((_, i) => i) : [];
      const nodes = whole && nodesOf(plain, whole, all, api), node = nodes?.findIndex((x) => x.start === start - 1);
      if (!b || !nodes || (!root && node! < 0)) return undefined;
      const sides = root ? [all] : nodes[node!].copies.map((y) => y.side);
      for (const side of sides) {
        const own = side.filter((i) => !nodes.some((x) => (root ? x.parent < 0 : x.parent === node) && x.copies.some((y) => y.side.includes(i))));
        for (const el of unlocanted) {
          const same = own.filter((i) => b.el[i] === el);
          if (!same.length || (same.length > 1 && new Set(same.map((i) => flat(api.inchi(builtMol(b, new Map([[i, MARK[el]?.[0] ?? 0]])))))).size !== 1)) return undefined;
        }
      }
    }
    const desc = [...by].map(([k, locs]) => (locs[0] ? `${locs.join(",")}-` : "") + `${k}${locs.length > 1 ? locs.length : ""}`).join(",");
    const p = starts(part).slice(0, 12).map((q) => q + start).find((q) => !!api.read(insert(plain, q, desc)));
    if (p === undefined) return undefined;
    placed.push({ p, desc });
  }
  const probe = placed.sort((a, b) => b.p - a.p).reduce((s, x) => insert(s, x.p, x.desc), plain), smiles = api.read(probe);
  return smiles ? flat(api.inchi(smiles)) : undefined;
}
// Where a component of a name can start at its top level, right to left: at the start, after a closing mark, after
// the hyphen that ends a prefix (not one after locants, as in 2,2'-bipyridine, which start the component), and after a
// prefix such as methyl, methoxy or carboxylato before a letter (methylphenolate).
function starts(name: string): number[] {
  const out: number[] = [], depth: number[] = [];
  for (let i = 0, d = 0; i < name.length; i++) { depth.push(d); if ("([{".includes(name[i])) d++; else if (")]}".includes(name[i])) d--; }
  for (let p = name.length - 1; p >= 0; p--) {
    if (depth[p] || ")]}".includes(name[p])) continue;
    if (p === 0 || ")]}".includes(name[p - 1]) || (name[p - 1] === "-" && /[a-z)\]}]-$/.test(name.slice(0, p))) || (/[a-z]/.test(name[p]) && /(yl|ylidene|oxy|oxo|halo|chloro|bromo|iodo|fluoro|nitro|amino|imino|cyano|hydroxy|oxido|ato|ido)$/.test(name.slice(0, p)))) out.push(p);
  }
  return out;
}

// κ with primes only (κ2O,O', κO:κO'), where it leaves no doubt: for each element, every atom of it in the ligand is
// a donor, or there is one donor and the element's atoms are all alike. For a bridging ligand the donors to each
// metal are cited in turn, the primes counting on (κO:κO'), and any split of the donors with the same counts must be
// the same structure.
function primed(m: Mol, g: Graph, lig: Ligand, groups: number[][], els: string[], api: ComplexApi): string[] | undefined {
  if (!primedOk(m, g, lig, groups, api)) return undefined;
  const seen = new Map<string, number>();
  return groups.map((ds) => kappaText(els.flatMap((el) => ds.filter((d) => g.atoms[d].el === el).map(() => {
    const k = seen.get(el) ?? 0;
    seen.set(el, k + 1);
    return { el, loc: primes(k) };
  })), els));
}
function primedOk(m: Mol, g: Graph, lig: Ligand, groups: number[][], api: ComplexApi): boolean {
  const donors = groups.flat();
  if (donors.length !== new Set(donors).size) return false;
  for (const el of new Set(donors.map((d) => g.atoms[d].el))) {
    const all = lig.atoms.filter((i) => g.atoms[i].el === el), ds = donors.filter((d) => g.atoms[d].el === el);
    if (ds.length !== all.length && (ds.length !== 1 || !alike(m, g, lig, all, api))) return false;
  }
  return groups.filter((ds) => ds.length).length < 2 || splits(m, g, lig, groups, api);
}
// Whether marking any one of these atoms gives the same structure.
function alike(m: Mol, g: Graph, lig: Ligand, atoms: number[], api: ComplexApi): boolean {
  if (atoms.length > 16 || atoms.some((i) => !MARK[g.atoms[i].el])) return false;
  const keys = new Set(atoms.map((i) => flat(api.inchi(ligandMol(m, g, lig, new Map([[i, MARK[g.atoms[i].el][0]]]))))));
  return keys.size === 1 && !keys.has(undefined);
}
// Whether swapping any two donor atoms of one element between two metals gives the same structure.
function splits(m: Mol, g: Graph, lig: Ligand, groups: number[][], api: ComplexApi): boolean {
  const label = (gs: number[][]) => flat(api.inchi(ligandMol(m, g, lig, new Map(gs.flatMap((ds, k) => ds.map((d) => [d, MARK[g.atoms[d].el]?.[k] ?? 0] as [number, number]))))));
  const want = label(groups);
  if (!want || groups.flat().some((d) => !MARK[g.atoms[d].el])) return false;
  for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++)
    for (const x of groups[a]) for (const y of groups[b]) {
      if (g.atoms[x].el !== g.atoms[y].el) continue;
      if (label(groups.map((ds, k) => ds.map((d) => (k === a && d === x ? y : k === b && d === y ? x : d)))) !== want) return false;
    }
  return true;
}
// A ligand's form back to its name as a free molecule or ion: acetato is acetate.
const nameOfForm = (form: string, charge: number) => (charge < 0 ? form.replace(/(at|id|it)o([)\]}]*)$/, "$1e$2") : form);

// ——— Names of complexes ———
// A term of a complex's name: a ligand, how many, bridging or not, and its κ.
// sort: the name without κ in its parts. simple: an anion's name of one word (acetato).
type Term = { form: string; sort?: string; lex: boolean; simple?: boolean; mu: boolean; kappa: string; count: number };
// Ligands with names of their own, and simple anion names, go without enclosing marks, with di, tri (IR-9.2.2.2):
// dichlorido, diacetato; a bridging one as di-μ-chlorido- (IR-9.2.5.2). Every other ligand goes in enclosing marks,
// with bis, tris: names with locants, prefixes or κ, and neutral ones (dipyridine would read as a ring assembly).
const termText = (t: Term) => {
  if (t.simple) return `${t.count > 1 ? MULT[t.count] : ""}${t.form}`;
  if (t.lex && !t.kappa) return t.mu ? `${t.count > 1 ? `${MULT[t.count]}-` : ""}μ-${t.form}-` : `${t.count > 1 ? MULT[t.count] : ""}${t.form}`;
  return `${t.count > 1 ? MULTK[t.count] : ""}${enclose(`${t.mu ? "μ-" : ""}${t.form}${t.kappa ? `-${t.kappa}` : ""}`)}`;
};
// A simple anion name: one word of letters, one component, ending in ato, ido or ito, and not starting as a
// multiplying prefix does (octanoato stays enclosed: dioctanoato, not octa-noato).
const MULT_START = new RegExp(`^(?:${[...MULT.slice(2), ...MULTK.slice(2)].join("|")})`);
const simpleName = (form: string) => /^[a-z]+(?:ato|ido|ito)$/.test(form) && !MULT_START.test(form) && !LEX_FORMS.has(form) && starts(form).length === 1;
// Whether a ligand on one metal, cited without κ, takes its name as a simple word.
const simpleTerm = (lig: Ligand, form: string, kappa: string) => !lig.lex && !lig.carbon && lig.charge < 0 && !kappa && simpleName(form);
// Alike ligands counted, in alphabetical order (IR-9.2.2.1): by name, multiplying prefixes and μ aside, a bridging
// ligand before the same ligand not bridging (IR-9.2.5.2).
function termsOf(list: Omit<Term, "count">[]): Term[] {
  const out = new Map<string, Term>();
  for (const t of list) { const k = `${t.form}|${t.mu}|${t.kappa}`; out.set(k, { ...t, count: (out.get(k)?.count ?? 0) + 1 }); }
  return [...out.values()].sort((a, b) => alphaKey(a.sort ?? a.form).localeCompare(alphaKey(b.sort ?? b.form)) || Number(b.mu) - Number(a.mu) || a.kappa.localeCompare(b.kappa));
}
const chargeText = (q: number) => `(${Math.abs(q)}${q > 0 ? "+" : "-"})`;
const oxText = (ox: number) => `(${ox < 0 ? "-" : ""}${ROMAN[Math.abs(ox)]})`;

type Context = { m: Mol; g: Graph; e: Entity; named: Named[]; api: ComplexApi };
// The oxidation number of the metal in a neutral complex with one metal atom (IR-9.2.2.4), from its ligands' charges
// as free ligands. None for organometallic compounds (IR-10.2.1.4), nor with nitrosyl or carbonyl ligands.
function oxidation(e: Entity): number | undefined {
  if (e.charge || e.metals.length !== 1 || e.ligands.some((l) => l.carbon || l.eta || (l.lex && !LEX[l.lex].ox))) return undefined;
  const ox = e.hydrides - e.ligands.reduce((t, l) => t + l.charge, 0);
  return Math.abs(ox) < ROMAN.length ? ox : undefined;
}
// Whether the drawing fixes the metal's oxidation number: a charge drawn on an atom of the complex, an anionic ligand
// or a hydride. With the metal and every ligand neutral it does not: Sam draws his Os(II) and Ru(II) complexes with
// no charges, and osmium(0) would be a claim he never made.
const fixes = (g: Graph, e: Entity) => e.atoms.some((i) => g.atoms[i].charge) || e.ligands.some((l) => l.charge) || e.hydrides > 0;
// After the metal's name: the charge number of a complex ion; for a neutral complex, the oxidation number the
// drawing fixes or its label gives (Os(II)), else none (IR-9.2.2.4 makes it optional). Undefined where the label's
// state is not the one the drawing fixes.
function suffix(g: Graph, e: Entity): string | undefined {
  if (e.charge) return chargeText(e.charge);
  const ox = fixes(g, e) ? oxidation(e) : undefined;
  if (e.written !== undefined) return ox === undefined || ox === e.written ? oxText(e.written) : undefined;
  return ox !== undefined ? oxText(ox) : "";
}
function mononuclear(c: Context): string | undefined {
  const { m, g, e, named, api } = c, x = e.metals[0], el = g.atoms[x].el, list: Omit<Term, "count">[] = [];
  for (const [k, lig] of e.ligands.entries()) {
    const kp = needsKappa(g, lig) ? kappaParts(m, g, lig, named[k], [x], api) : { parts: [""] };
    if (!kp) return undefined;
    const eta = lig.eta ? etaForm(c, k) : undefined;
    if (lig.eta && !eta) return undefined;
    const form = eta ?? kp.form ?? named[k].form, kappa = kp.parts[0] ?? "";
    list.push({ form, sort: named[k].form, lex: !!lig.lex, simple: !kp.form && simpleTerm(lig, form, kappa), mu: false, kappa });
  }
  for (let h = 0; h < e.hydrides; h++) list.push({ form: LEX.H.form, lex: true, mu: false, kappa: "" });
  const tail = suffix(g, e);
  return tail === undefined ? undefined : configuration(c) + termsOf(list).map(termText).join("") + (e.charge < 0 ? ateOf(el) : ELEMENTS.get(el)!) + tail;
}
// A ligand's donor atoms marked by metal (the metals in the order given), as an InChI with its name's key: alike
// ligands bonded alike have the same.
function ligandSig(c: Context, k: number, order: number[]): string | undefined {
  const lig = c.e.ligands[k], groups = donorGroups(lig, order);
  if (lig.lex) return `lex ${lig.lex}|${groups.map((ds) => ds.length).join(",")}`;
  if (groups.flat().some((d) => !MARK[c.g.atoms[d].el])) return undefined;
  const marks = new Map(groups.flatMap((ds, j) => ds.map((d) => [d, MARK[c.g.atoms[d].el][j]] as [number, number])));
  const inchi = flat(c.api.inchi(ligandMol(c.m, c.g, lig, marks, !!lig.carbon)));
  return inchi && `${c.named[k].key}|${inchi}`;
}
const bridging = (lig: Ligand) => new Set(lig.bonds.map((x) => x.metal)).size > 1;
// The metal numbered 1 in a complex of two alike metal atoms that are not alike in it (IR-9.2.5.5): the one with more
// donor atoms; then the one with more of its ligands cited earlier in the name. Undefined if they cannot be told apart.
function firstMetal(c: Context): number | undefined {
  const { g, e, named } = c, [a, b] = e.metals;
  const cn = (x: number) => e.ligands.reduce((t, l) => t + l.bonds.filter((y) => y.metal === x).length, 0) + g.atoms[x].h;
  if (cn(a) !== cn(b)) return cn(a) > cn(b) ? a : b;
  const keys = (x: number) => e.ligands.flatMap((l, k) => l.bonds.filter((y) => y.metal === x).map(() => alphaKey(named[k].form))).sort();
  const ka = keys(a), kb = keys(b), d = ka.findIndex((s, i) => s !== kb[i]);
  return d < 0 ? undefined : ka[d].localeCompare(kb[d]) < 0 ? a : b;
}
// Two metal atoms of one element. Alike in the complex: the bridging ligands, then di and the metal, or bis[] round one
// metal's own ligands (IR-9.2.5.4): tetrakis(μ-acetato-κO:κO')dirhodium(Rh—Rh), di-μ-chlorido-bis[chlorido(...)
// platinum]. Not alike: central atom locants in every κ (IR-9.2.5.5).
// Whether the two metal atoms are alike in the complex: the ligands, marked by metal, are the same either way round.
function alikeMetals(c: Context): boolean | undefined {
  const [a, b] = c.e.metals, ab = c.e.ligands.map((_, k) => ligandSig(c, k, [a, b])), ba = c.e.ligands.map((_, k) => ligandSig(c, k, [b, a]));
  if ([...ab, ...ba].some((s) => !s)) return undefined;
  return [...ab].sort().join("\n") === [...ba].sort().join("\n") && c.g.atoms[a].h === c.g.atoms[b].h;
}
function dinuclear(c: Context): string | undefined {
  const { m, g, e, named, api } = c, [a, b] = e.metals, el = g.atoms[a].el;
  if (g.atoms[b].el !== el || e.mm.length > 1) return undefined;
  const symmetric = alikeMetals(c);
  if (symmetric === undefined) return undefined;
  const metal = e.charge < 0 ? ateOf(el) : ELEMENTS.get(el)!, tail = (e.mm.length ? `(${el}—${el})` : "") + (e.charge ? chargeText(e.charge) : "");
  const list: Omit<Term, "count">[] = [], unit: Omit<Term, "count">[] = [];
  if (symmetric) {
    for (const [k, lig] of e.ligands.entries()) {
      const mu = bridging(lig);
      if (!mu && lig.bonds[0].metal !== a) continue;
      const kp = needsKappa(g, lig) ? kappaParts(m, g, lig, named[k], mu ? [a, b] : [a], api) : { parts: [] };
      // An η ligand on each metal, in the unit (di-μ-chlorido-bis{[(1,2,5,6-η)-cycloocta-1,5-diene]rhodium}).
      const eta = lig.eta ? etaForm(c, k) : undefined;
      if (!kp || (lig.eta && !eta)) return undefined;
      const form = eta ?? kp.form ?? named[k].form, kappa = kp.parts.filter(Boolean).join(":");
      (mu ? list : unit).push({ form, sort: named[k].form, lex: !!lig.lex, simple: !mu && !kp.form && simpleTerm(lig, form, kappa), mu, kappa });
    }
    for (let h = 0; h < g.atoms[a].h; h++) unit.push({ form: LEX.H.form, lex: true, mu: false, kappa: "" });
    return termsOf(list).map(termText).join("") + (unit.length ? `bis${enclose(termsOf(unit).map(termText).join("") + metal)}` : `di${metal}`) + tail;
  }
  const first = firstMetal(c);
  if (first === undefined || e.ligands.some((l) => l.eta)) return undefined;
  const order = first === a ? [a, b] : [b, a];
  for (const [k, lig] of e.ligands.entries()) {
    const mu = bridging(lig), groups = donorGroups(lig, order);
    // A bridging ligand of one donor atom needs no κ (μ-chlorido); every other ligand cites its metals by locant.
    if (mu && !needsKappa(g, lig) && groups[0].length === 1 && groups[0][0] === groups[1][0]) { list.push({ form: named[k].form, lex: !!lig.lex, mu, kappa: "" }); continue; }
    const kp = needsKappa(g, lig) ? kappaParts(m, g, lig, named[k], order, api, true) : undefined;
    if (kp?.form) { list.push({ form: kp.form, sort: named[k].form, lex: false, mu, kappa: "" }); continue; }
    const parts = kp ? kp.parts : needsKappa(g, lig) ? undefined : groups.map((ds) => (ds.length === 1 ? `κ${g.atoms[ds[0]].el}` : ds.length ? undefined : ""));
    if (!parts || parts.some((p) => p === undefined)) return undefined;
    list.push({ form: named[k].form, lex: !!lig.lex, mu, kappa: parts.map((p, j) => (p ? p!.replace(/(^|,)κ/g, `$1${j + 1}κ`) : "")).filter(Boolean).join(mu ? ":" : ",") });
  }
  for (const [j, x] of order.entries()) for (let h = 0; h < g.atoms[x].h; h++) list.push({ form: LEX.H.form, lex: true, mu: false, kappa: `${j + 1}κH` });
  return termsOf(list).map(termText).join("") + `di${metal}` + tail;
}

// ——— Configuration at the metal (IR-9.3) ———
// Where the drawing fixes the arrangement of the donor atoms round a metal of one metal atom, the name begins with it:
// cis or trans for [Ma2b2] (square planar) and [Ma2b4] (octahedral), fac or mer for [Ma3b3], else the polyhedral
// symbol with its configuration index, (SP-4-3), (OC-6-43), (TBPY-5-12) or (SPY-5-12) (IR-9.3.3.3 to IR-9.3.3.6); R or
// S at a tetrahedral metal with four unlike donors, (T-4-R) (IR-9.3.4.2); and Δ or Λ for an octahedral tris(bidentate)
// complex (the skew-lines convention, IR-9.3.4.11 and IR-9.3.4.12). The drawing fixes it when:
// - square planar (SP-4): four donor atoms in the plane of the drawing round a metal that is square planar when it has
//   four (Ni, Pd, Pt, Rh, Ir, Au: d8), drawn as a cross, each bond opposite one other (within 25°) and at about a right
//   angle to the other two (within 25°). A cross with a wedge or hash on it is not a square.
// - tetrahedral (T-4): four donor atoms drawn in 3D (a wedge or hash on a bond, or the atoms' own depths), no two of them
//   opposite, read as a stereocentre's ligands are (cip.ts handOf).
// - trigonal bipyramidal (TBPY-5): five donor atoms drawn in 3D, two of them opposite (the axis, within 25°) and the
//   other three at about a right angle to it, none of them opposite another.
// - square pyramidal (SPY-5): five donor atoms drawn in 3D, four in two opposite pairs at about a right angle to each
//   other, and the fifth (on the axis) at about a right angle to all four.
// - octahedral (OC-6): six donor atoms drawn in 3D, with a wedge or hash on at least two of their bonds (or the atoms'
//   own depths), each bond pointing away from exactly one other.
// The configuration index needs the donor atoms' CIP priorities. Octet ranks them by atomic number, then by the atoms
// they are bonded to (multiple bonds duplicated, the metal left out); unlike ligands that this cannot tell apart, or
// any chelate ligand, give no index. A complex of one kind of ligand, [Ma3b] or [Ma5b] (and [Ma4b] in a square or an
// octahedron), has no stereoisomers and no descriptor. Δ or Λ is given for three bidentate ligands whose two donor atoms
// are alike (bpy, phen, en, acac): such a complex has no other stereoisomers. Not given: the chirality symbols C and A
// (IR-9.3.4.4 to IR-9.3.4.8), Δ and Λ for bis(bidentate) complexes, and other polyhedra.
const SQUARE = new Set(["Ni", "Pd", "Pt", "Rh", "Ir", "Au"]);
type Site = { d: number; lig: number; v: [number, number, number] };
// The donor atoms round metal x, each with its bond's direction from the metal (unit vector, depth from a wedge or
// hash as cip.ts reads them), and whether any is out of the plane.
function sitesOf(c: Context, x: number): { sites: Site[]; deep: boolean } | undefined {
  const { m, e } = c, sites: Site[] = [], at = (i: number) => m.atoms[i].location;
  let deep = m.atoms.some((a) => Math.abs(a.location[2] ?? 0) > 1e-6);
  for (const [k, lig] of e.ligands.entries()) for (const b of lig.bonds) {
    if (b.metal !== x) continue;
    const bond = m.bonds.find((y) => y.atoms.includes(x) && y.atoms.includes(b.atom));
    if (!bond) return undefined;
    const dx = at(b.atom)[0] - at(x)[0], dy = at(b.atom)[1] - at(x)[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) return undefined;
    const from = bond.atoms[0] === x ? 1 : -1;
    const wedge = bond.stereo === 1 || bond.display === "hollow" ? from : bond.stereo === 6 ? -from : bond.display === "hashed" || bond.display === "dashed" ? -1 : bond.display === "bold" ? 1 : 0;
    if (wedge) deep = true;
    const dz = (at(b.atom)[2] ?? 0) - (at(x)[2] ?? 0) || wedge * 0.8 * len, n = Math.hypot(dx, dy, dz);
    sites.push({ d: b.atom, lig: k, v: [dx / n, dy / n, dz / n] });
  }
  return { sites, deep };
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const minus = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// Each site's trans partner (by index), where every site points away from exactly one other: its most opposite site,
// mutually, with the cosine of their angle below `opposite`, and every other pair passing `other`. Undefined otherwise.
function transPairs(sites: Site[], opposite: number, other: (cos: number) => boolean): number[] | undefined {
  const most = sites.map((s, i) => { let best = -1; sites.forEach((t, j) => { if (j !== i && (best < 0 || dot(s.v, t.v) < dot(s.v, sites[best].v))) best = j; }); return best; });
  if (most.some((j, i) => most[j] !== i || dot(sites[i].v, sites[j].v) > opposite)) return undefined;
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) if (most[i] !== j && !other(dot(sites[i].v, sites[j].v))) return undefined;
  return most;
}
// Five sites as a trigonal bipyramid or a square pyramid: each site's trans partner (-1 for none), within 25° of
// opposite, and every other pair that must be at about a right angle within 25°. Undefined for any other shape.
function fivefold(sites: Site[]): { shape: "TBPY-5" | "SPY-5"; trans: number[] } | undefined {
  const cos = (i: number, j: number) => dot(sites[i].v, sites[j].v), trans = sites.map(() => -1);
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (cos(i, j) < -0.9) { if (trans[i] >= 0 || trans[j] >= 0) return undefined; trans[i] = j; trans[j] = i; }
  const right = (i: number, j: number) => Math.abs(cos(i, j)) < 0.42, all = [0, 1, 2, 3, 4];
  const pairs = all.filter((i) => trans[i] > i), lone = all.filter((i) => trans[i] < 0);
  // TBPY-5: the axis and three sites round it, none opposite another (checked above).
  if (pairs.length === 1) return lone.every((i) => right(i, pairs[0]) && right(i, trans[pairs[0]])) ? { shape: "TBPY-5", trans } : undefined;
  // SPY-5: two opposite pairs at right angles, and the apex at right angles to all four.
  if (pairs.length === 2) {
    const base = [pairs[0], trans[pairs[0]], pairs[1], trans[pairs[1]]];
    return base.every((i) => right(i, lone[0])) && [0, 1].every((u) => [2, 3].every((w) => right(base[u], base[w]))) ? { shape: "SPY-5", trans } : undefined;
  }
  return undefined;
}
type Poly = { shape: "SP-4" | "T-4" | "TBPY-5" | "SPY-5" | "OC-6"; sites: Site[]; trans: number[] };
// The polyhedron the drawing fixes round the complex's only metal atom, with each site's trans partner (-1 for none).
function polyhedron(c: Context): Poly | undefined {
  const { g, e } = c;
  if (e.metals.length !== 1 || e.hydrides || e.ligands.some((l) => l.eta || (l.carbon && l.bonds.length !== 1))) return undefined;
  const x = e.metals[0], s = sitesOf(c, x);
  if (!s || new Set(s.sites.map((t) => t.d)).size !== s.sites.length) return undefined;
  if (s.sites.length === 4 && !s.deep && SQUARE.has(g.atoms[x].el)) {
    // A cross: opposite within 25° (cos < -0.9), the others at right angles within 25° (|cos| < 0.42).
    const trans = transPairs(s.sites, -0.9, (cos) => Math.abs(cos) < 0.42);
    return trans && { shape: "SP-4", sites: s.sites, trans };
  }
  // A tetrahedron: no two bonds within 35° of opposite (cos > -0.8).
  if (s.sites.length === 4 && s.deep && s.sites.every((a, i) => s.sites.every((b, j) => i === j || dot(a.v, b.v) > -0.8))) return { shape: "T-4", sites: s.sites, trans: [-1, -1, -1, -1] };
  if (s.sites.length === 5 && s.deep) { const f = fivefold(s.sites); return f && { ...f, sites: s.sites }; }
  if (s.sites.length === 6 && s.deep) {
    const trans = transPairs(s.sites, -0.5, (cos) => cos > -0.45);
    return trans && { shape: "OC-6", sites: s.sites, trans };
  }
  return undefined;
}
// A donor atom's rank for CIP priority: its atomic number, then its neighbours' (the metal left out; a double or triple
// bond's partner counted two or three times, hydrogens as 1), highest first.
const ZOF = new Map([...ELEMENTS.keys()].map((el, i) => [el, i + 1])), Z = (el: string) => ZOF.get(el) ?? 0;
function donorRank(c: Context, d: number, x: number): number[] {
  const { g } = c, near: number[] = Array<number>(g.atoms[d].h).fill(1);
  for (const b of g.bonds) {
    const j = b.a === d ? b.b : b.b === d ? b.a : -1;
    if (j < 0 || j === x) continue;
    for (let k = 0; k < b.order; k++) near.push(Z(g.atoms[j].el));
  }
  return [Z(g.atoms[d].el), ...near.sort((p, q) => q - p)];
}
// Δ or Λ for an octahedral tris(bidentate) complex (IR-9.3.4.12): each ligand bonded through two alike donor atoms
// (IR-9.3.4.11 holds them to define a line each), cis to each other. Two such lines, skew, define a helix: right-handed
// is Δ. With directions a and b and the vector w from a point of the first to a point of the second, the helix is
// right-handed when (a·b)((a×b)·w) is negative (one line the axis of a cylinder, the other a tangent to it on their
// common normal). Every pair of chelates must agree. Undefined for any other complex.
function skewLines(c: Context, p: Poly): string | undefined {
  if (p.shape !== "OC-6") return undefined;
  const ligs = [...new Set(p.sites.map((s) => s.lig))], at = (k: number) => p.sites.flatMap((s, i) => (s.lig === k ? [i] : []));
  if (ligs.length !== 3 || ligs.some((k) => at(k).length !== 2 || p.trans[at(k)[0]] === at(k)[1])) return undefined;
  if (ligs.some((k) => !alike(c.m, c.g, c.e.ligands[k], at(k).map((i) => p.sites[i].d), c.api))) return undefined;
  const hands = new Set<number>();
  for (let u = 0; u < 3; u++) for (let w = u + 1; w < 3; w++) {
    const [a1, a2] = at(ligs[u]).map((i) => p.sites[i].v), [b1, b2] = at(ligs[w]).map((i) => p.sites[i].v);
    const a = minus(a2, a1), b = minus(b2, b1), turn = dot(a, b) * dot(cross(a, b), minus(b1, a1));
    if (Math.abs(turn) < 1e-3) return undefined;
    hands.add(Math.sign(turn));
  }
  return hands.size === 1 ? (hands.has(-1) ? "Δ-" : "Λ-") : undefined;
}
// The configuration the drawing fixes, as it begins the name ("cis-", "(OC-6-43)-", "Δ-"), "" for none.
function configuration(c: Context): string {
  const p = polyhedron(c);
  if (!p) return "";
  const helix = skewLines(c, p);
  if (helix) return helix;
  const { e } = c, x = e.metals[0], { sites, trans } = p;
  // Kinds of donor: alike ligands (same name and charge), and the donor's element.
  const kind = sites.map((s) => `${c.named[s.lig].key}|${c.g.atoms[s.d].el}`), kinds = [...new Set(kind)];
  if (kinds.length < 2) return "";
  const mono = (i: number) => new Set(e.ligands[sites[i].lig].bonds.map((b) => b.atom)).size === 1 && e.ligands[sites[i].lig].bonds.length === 1;
  const count = (k: string) => kind.filter((y) => y === k).length;
  const of = (k: string) => sites.flatMap((_, i) => (kind[i] === k ? [i] : []));
  // [Ma2b2] (no chelate: one fixes cis), [Ma2b4] and [Ma3b3]: the a sites (of monodentate ligands) adjacent or opposite.
  if (kinds.length === 2 && (p.shape === "SP-4" || p.shape === "OC-6")) {
    const [a, b] = kinds.map(of).sort((u, v) => u.length - v.length);
    if (p.shape === "SP-4" && a.length === 2 && [...a, ...b].every(mono)) return trans[a[0]] === a[1] ? "trans-" : "cis-";
    if (p.shape === "OC-6" && a.length === 2 && a.every(mono)) return trans[a[0]] === a[1] ? "trans-" : "cis-";
    if (p.shape === "OC-6" && a.length === 3 && [...a, ...b].every(mono)) return a.some((i) => a.includes(trans[i])) ? "mer-" : "fac-";
    if (a.length === 1) return "";
  }
  if (p.shape === "SP-4" && kinds.some((k) => count(k) === 3)) return "";
  if (p.shape === "OC-6" && kinds.some((k) => count(k) === 5)) return "";
  // The configuration index: CIP priority numbers, alike donors alike, unlike ones told apart.
  if (!sites.every((_, i) => mono(i))) return "";
  const ranks = kinds.map((k) => donorRank(c, sites[of(k)[0]].d, x)), key = (r: number[]) => r.join(",");
  if (new Set(ranks.map(key)).size !== kinds.length) return "";
  const order = [...ranks].sort((r, s) => { for (let i = 0; i < Math.max(r.length, s.length); i++) { const d = (s[i] ?? 0) - (r[i] ?? 0); if (d) return d; } return 0; }).map(key);
  const pri = sites.map((_, i) => order.indexOf(key(ranks[kinds.indexOf(kind[i])])) + 1);
  // T-4: R or S (IR-9.3.4.2), with four unlike donors; the drawing read as a stereocentre is.
  if (p.shape === "T-4") {
    if (kinds.length !== 4) return "";
    const hand = handOf(c.m, x, [1, 2, 3, 4].map((n) => sites[pri.indexOf(n)].d));
    return hand ? `(T-4-${hand})-` : "";
  }
  // TBPY-5: the priority numbers of the two axial donors, lower first (IR-9.3.3.6).
  if (p.shape === "TBPY-5") { const axis = sites.map((_, i) => i).filter((i) => trans[i] >= 0).map((i) => pri[i]).sort((u, v) => u - v); return `(TBPY-5-${axis.join("")})-`; }
  // SPY-5: the apex's priority number, then the highest number trans to the most preferred basal donor (IR-9.3.3.5).
  if (p.shape === "SPY-5") {
    const apex = trans.indexOf(-1), base = sites.map((_, i) => i).filter((i) => i !== apex), top = Math.min(...base.map((i) => pri[i]));
    return `(SPY-5-${pri[apex]}${Math.max(...base.filter((i) => pri[i] === top).map((i) => pri[trans[i]]))})-`;
  }
  const firsts = sites.flatMap((_, i) => (pri[i] === 1 ? [i] : [])), first = Math.max(...firsts.map((i) => pri[trans[i]]));
  if (p.shape === "SP-4") return `(SP-4-${first})-`;
  // The reference axis: a priority 1 site with the highest priority number trans to it; then in the plane at right
  // angles, the highest number trans to the most preferred site there (trans maximum difference, IR-9.3.3.4).
  const second = Math.max(...firsts.filter((i) => pri[trans[i]] === first).map((ax) => {
    const plane = sites.map((_, i) => i).filter((i) => i !== ax && i !== trans[ax]), top = Math.min(...plane.map((i) => pri[i]));
    return Math.max(...plane.filter((i) => pri[i] === top).map((i) => pri[trans[i]]));
  }));
  return `(OC-6-${first}${second})-`;
}

// ——— Counter-ions ———
type Ion = { name: string; charge: number; key: string };
// Metal ions of one usual charge, named in salts by the element alone (IR-5.4.2.2): potassium.
const ONE: Record<string, number> = { Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2 };
const metalIon = (el: string, charge: number) => `[${el}${charge > 0 ? "+" : "-"}${Math.abs(charge)}]`;
function ionOf(m: Mol, g: Graph, part: number[], api: ComplexApi): Ion | undefined {
  const charge = part.reduce((t, i) => t + g.atoms[i].charge, 0), a = g.atoms[part[0]];
  if (!charge) return undefined;
  if (part.length === 1 && isMetal(a.el) && !a.h) {
    const name = ONE[a.el] === charge ? ELEMENTS.get(a.el) : charge > 0 ? `${ELEMENTS.get(a.el)}(${charge}+)` : undefined, key = api.inchi(metalIon(a.el, charge));
    return name && key ? { name, charge, key } : undefined;
  }
  const lm = ligandMol(m, g, { atoms: part, q: new Map(), bonds: [], charge }), key = api.inchi(lm), graph = key ? graphOf(lm, api.cip?.(lm)) : undefined;
  const name = graph ? iupacNameWhy(graph).name : undefined;
  if (!name || !key || /\s/.test(name)) return undefined;
  const back = api.read(name);
  return back && api.inchi(back) === key ? { name, charge, key } : undefined;
}
// An ion's name read back: a metal ion (potassium, iron(3+)), or by OPSIN.
function readIon(word: string, api: ComplexApi): { key?: string; charge: number } | undefined {
  const x = /^([a-z]+)(?:\((\d)\+\))?$/.exec(word), metal = x && NAMES.get(x[1]);
  if (metal && !metal.ate) {
    const charge = x![2] ? Number(x![2]) : ONE[metal.el];
    return charge ? { key: api.inchi(metalIon(metal.el, charge)), charge } : undefined;
  }
  const back = api.read(word);
  return back ? { key: api.inchi(back), charge: smilesCharge(back) } : undefined;
}
// The charge of a SMILES (OPSIN writes charges in brackets: [O-], [N+], [Fe+2]).
const smilesCharge = (s: string) => [...s.matchAll(/\[[^\]]*?([+-])(\d*)\]/g)].reduce((t, x) => t + (x[1] === "+" ? 1 : -1) * Number(x[2] || 1), 0);

// ——— Reading a finished name back ———
type PTerm = { count: number; mu: boolean; lex?: string; inner?: string };
type PCentral = { el: string; n: number; ate: boolean; mm?: [string, string]; suffix?: string; unit?: PTerm[] };
const MULTS = MULT.slice(2).join("|"), FORMS = [...LEX_FORMS.keys()].sort((a, b) => b.length - a.length).join("|");
const MU_RE = new RegExp(`^(?:(${MULTS})-)?μ-(${FORMS})-`), LEX_RE = new RegExp(`^(${MULTS})?(${FORMS})`), ENC_RE = new RegExp(`^(${MULTK.slice(2).join("|")})?(?=[([{])`);
const METAL_NAMES = [...NAMES.keys()].sort((a, b) => b.length - a.length);
// Where the enclosing mark at i closes, or -1.
function closing(s: string, i: number): number {
  const open = "([{", close = ")]}", stack: number[] = [];
  for (let k = i; k < s.length; k++) {
    const o = open.indexOf(s[k]), c = close.indexOf(s[k]);
    if (o >= 0) { stack.push(o); if (stack.length > MOST_DEPTH) return -1; }
    else if (c >= 0) { if (stack.pop() !== c) return -1; if (!stack.length) return k; }
  }
  return -1;
}
// A complex's name as its terms, then the metal (with di, or bis[] round one metal's terms), the metal-metal bond and
// the charge or oxidation number.
// A simple anion name has no mark to end it (diacetatobis(...)), so each place it could end is tried in turn.
function parseEntity(w: string, depth = 0, budget = { calls: 0 }): { terms: PTerm[]; central: PCentral } | undefined {
  if (++budget.calls > 400 || w.length > MOST_NAME) return undefined;
  const central = parseCentral(w, depth);
  if (central) return { terms: [], central };
  const then = (t: PTerm, n: number) => { const r = parseEntity(w.slice(n), depth, budget); return r && { terms: [t, ...r.terms], central: r.central }; };
  let x: RegExpExecArray | null;
  if ((x = MU_RE.exec(w))) return then({ count: x[1] ? MULT.indexOf(x[1]) : 1, mu: true, lex: LEX_FORMS.get(x[2]) }, x[0].length);
  if ((x = LEX_RE.exec(w))) { const r = then({ count: x[1] ? MULT.indexOf(x[1]) : 1, mu: false, lex: LEX_FORMS.get(x[2]) }, x[0].length); if (r) return r; }
  if ((x = ENC_RE.exec(w))) {
    const start = x[0].length, end = closing(w, start);
    if (end < 0) return undefined;
    const inner = w.slice(start + 1, end), mu = inner.startsWith("μ-");
    return then({ count: x[1] ? MULTK.indexOf(x[1]) : 1, mu, inner: mu ? inner.slice(2) : inner }, end + 1);
  }
  const mult = new RegExp(`^(${MULTS})?`).exec(w)!, from = mult[0].length;
  for (const end of w.slice(from).matchAll(/(?:ato|ido|ito)/g)) {
    const to = from + end.index! + end[0].length, word = w.slice(from, to);
    if (!/^[a-z]+$/.test(word) || !simpleName(word)) continue;
    const r = then({ count: mult[1] ? MULT.indexOf(mult[1]) : 1, mu: false, inner: word }, to);
    if (r) return r;
  }
  return undefined;
}
function parseCentral(s: string, depth: number): PCentral | undefined {
  let p = 0, n = 1, el: string | undefined, ate = false, unit: PTerm[] | undefined;
  if (/^bis[([{]/.test(s)) {
    const end = closing(s, 3), inner = end > 0 && depth < 1 ? parseEntity(s.slice(4, end), depth + 1) : undefined;
    if (!inner || inner.central.n !== 1 || inner.central.suffix || inner.central.mm || inner.central.unit) return undefined;
    ({ el, ate } = inner.central);
    unit = inner.terms; n = 2; p = end + 1;
  } else {
    for (const [k, start] of [[2, 2], [1, 0]] as const) {
      if (start && !s.startsWith("di")) continue;
      const name = METAL_NAMES.find((x) => s.startsWith(x, start));
      if (name) { ({ el, ate } = NAMES.get(name)!); n = k; p = start + name.length; break; }
    }
    if (!el) return undefined;
  }
  let rest = s.slice(p), mm: [string, string] | undefined;
  const bond = /^\(([A-Z][a-z]?)—([A-Z][a-z]?)\)/.exec(rest);
  if (bond) { mm = [bond[1], bond[2]]; rest = rest.slice(bond[0].length); }
  const suffix = /^\(([^()]*)\)$/.exec(rest);
  if (rest && !suffix) return undefined;
  return { el, n, ate, ...(mm ? { mm } : {}), ...(suffix ? { suffix: suffix[1] } : {}), ...(unit ? { unit } : {}) };
}
// A κ term: for each metal (split by colons), its locant if it has one, and the atoms cited, by element and a locant or
// primes.
type Cited = { el: string; loc: string };
function parseKappa(t: string): { metal?: number; atoms: Cited[] }[] | undefined {
  if (t.length > 400) return undefined;
  const out: { metal?: number; atoms: Cited[] }[] = [];
  for (const group of t.split(":")) {
    const atoms: Cited[] = [], metals = new Set<string>();
    for (const seg of group.split(/,(?=\d?κ)/)) {
      const x = /^(\d)?κ(\d*)(.+)$/.exec(seg), items = x?.[3].split(",").map((it) => /^([A-Z][a-z]?)(\d+[a-z]?'*|'*)$/.exec(it));
      if (!x || !items || items.some((it) => !it) || items.length !== (x[2] ? Number(x[2]) : 1)) return undefined;
      metals.add(x[1] ?? "");
      atoms.push(...items.map((it) => ({ el: it![1], loc: it![2] })));
    }
    if (metals.size !== 1) return undefined;
    const metal = [...metals][0];
    out.push({ ...(metal ? { metal: Number(metal) } : {}), atoms });
  }
  return out;
}

// What one term of a name says of a ligand: its kind (lex key or the InChI of the ligand OPSIN reads), its charge, and
// its donor atoms to each metal of the order tried, as a test of a drawn ligand.
type Claim = { count: number; type: string; charge?: number; carbon: boolean; lex?: string; hydride?: number; test: (k: number, order: number[]) => boolean };
// A term read back. at: the metal (in the order tried) a term without κ is on: the only metal, or each metal of
// bis[]; undefined for a term that must cite its metals.
function claimOf(t: PTerm, c: Context, at: number | undefined): Claim | undefined {
  const { g, e, api } = c;
  if (t.lex) {
    const lex = t.lex;
    // Hydrido: the metal's own hydrogens, on the term's metal.
    if (lex === "H") return t.mu || at === undefined ? undefined : { count: t.count, type: "lex H", charge: -1, carbon: false, lex, hydride: at, test: () => false };
    return { count: t.count, type: `lex ${lex}`, charge: LEX[lex].charge, carbon: false, lex, test: (k, order) => {
      const lig = e.ligands[k], groups = donorGroups(lig, order).map((ds) => ds.length);
      return lig.lex === lex && (t.mu ? groups.every((n) => n === 1) && order.length === 2 : at !== undefined && groups.every((n, j) => n === (j === at ? 1 : 0)));
    } };
  }
  // An η ligand bonded through some of its atoms: the locants of those atoms before η ((1,2,5,6-η)-cycloocta-1,5-diene).
  const etaLoc = /^\(([^()]+)-η\)-(.+)$/.exec(t.inner!);
  if (etaLoc) return etaClaim(t, c, at, etaLoc[1], etaLoc[2]);
  // An η ligand: η before the part of its name that holds its bonded atoms; read without it.
  const etaAt = /(?:^|-)η(\d)-/.exec(t.inner!), etaN = etaAt ? Number(etaAt[1]) : 0, etaPartName = etaAt ? t.inner!.slice(etaAt.index + etaAt[0].length) : "";
  if (etaAt && /η/.test(etaPartName)) return undefined;
  // Before η: the rest of the name, or the name's stereodescriptors alone (then η cites all its unsaturated atoms).
  const front = etaAt ? t.inner!.slice(0, etaAt.index) : "", whole = !!etaAt && (!front || STEREO_PREFIX.test(`${front}-`));
  // The ligand's name without its κ terms; a term at the end cites the whole name's atoms, others a part's.
  const inner = etaAt ? front + (front && whole ? "-" : "") + etaPartName : t.inner!, kt = kappaTerms(inner);
  if (!kt || (etaAt && kt.terms.length)) return undefined;
  const form = kt.plain, rootTerm = kt.terms.find((x) => x.at === form.length), parts = kt.terms.filter((x) => x !== rootTerm);
  const kappa = rootTerm?.groups;
  if (LEX_FORMS.has(form)) {
    if (parts.length) return undefined;
    // A ligand with a name of its own, with κ to say which metal it is on (unlike metals).
    const lex = LEX_FORMS.get(form)!;
    if (!kappa || kappa.some((x) => x.metal === undefined || x.atoms.length !== 1)) return undefined;
    if (lex === "H") return kappa.length === 1 && kappa[0].atoms[0].el === "H" && !t.mu ? { count: t.count, type: "lex H", charge: -1, carbon: false, lex, hydride: kappa[0].metal! - 1, test: () => false } : undefined;
    return { count: t.count, type: `lex ${lex}`, charge: LEX[lex].charge, carbon: false, lex, test: (k, order) => {
      const lig = e.ligands[k], groups = donorGroups(lig, order);
      return lig.lex === lex && groups.every((ds, j) => ds.length === kappa.filter((x) => x.metal === j + 1).length && ds.every((d) => g.atoms[d].el === kappa[0].atoms[0].el));
    } };
  }
  const carbon = /(yl|ylidene|ylidyne)$/.test(form);
  const read = opsinOf(carbon ? `(${form})silane` : nameOfForm(form, /(ato|ido|ito)[)\]}]*$/.test(form) ? -1 : 0), api)?.smiles;
  const type = read && api.inchi(read);
  if (!read || !type) return undefined;
  const charge = carbon ? undefined : smilesCharge(read);
  // The drawn ligand marked at its donor atoms, metal by metal in the order tried.
  const drawn = (k: number, order: number[]) => {
    const lig = e.ligands[k], groups = donorGroups(lig, order);
    if (groups.flat().some((d) => !MARK[g.atoms[d].el])) return undefined;
    return flat(api.inchi(ligandMol(c.m, g, lig, new Map(groups.flatMap((ds, j) => ds.map((d) => [d, MARK[g.atoms[d].el][j]] as [number, number]))), !!lig.carbon)));
  };
  const base = (k: number) => c.named[k].key === unfixed(type, c.named[k].pairs) && !!e.ligands[k].carbon === carbon && !e.ligands[k].lex
    && (e.ligands[k].eta ?? 0) === etaN && (!etaN || etaPart(c, k, etaPartName) || (whole && etaWhole(c, k) && etaForm(c, k) === t.inner));
  // Which metal each κ group is on: by its locant, else in turn (a bridging ligand), else the term's metal.
  const metalOf = (x: { metal?: number }, j: number) => (x.metal !== undefined ? x.metal - 1 : t.mu ? j : at);
  if (carbon) {
    // The carbon atom bonded to silane in OPSIN's structure is the donor; a κC term only says which metal.
    if (parts.length || (kappa && (kappa.length !== 1 || kappa[0].atoms.length !== 1 || kappa[0].atoms[0].el !== "C" || kappa[0].atoms[0].loc))) return undefined;
    const j = kappa ? metalOf(kappa[0], 0) : at;
    return { count: t.count, type, carbon, test: (k, order) => {
      const lig = e.ligands[k];
      return base(k) && j !== undefined && !t.mu && donorGroups(lig, order).every((ds, i) => ds.length === (i === j ? 1 : 0));
    } };
  }
  if (!kt.terms.length) {
    // No κ: the ligand must need none, and be on the term's metal.
    return { count: t.count, type, charge, carbon, test: (k, order) => {
      const lig = e.ligands[k];
      return base(k) && at !== undefined && !t.mu && !needsKappa(g, lig) && donorGroups(lig, order).every((ds, i) => (i === at) === ds.length > 0);
    } };
  }
  // Which metal each group of each term is on; a bridging ligand's groups name different metals.
  const metals = kt.terms.map((x) => x.groups.map((y, j) => metalOf(y, j)));
  if (metals.flat().some((j) => j === undefined) || metals.some((js) => new Set(js).size !== js.length) || t.mu !== new Set(metals.flat()).size > 1) return undefined;
  const cited = kt.terms.flatMap((x) => x.groups.flatMap((y) => y.atoms));
  if (parts.length || cited.some((x) => /^\d/.test(x.loc))) {
    // Locants (or the one atom of an element): OPSIN reading the name with the cited atoms of each part marked, by
    // metal, must give the drawn ligand marked at its donor atoms.
    const sig = readKappa(inner, charge!, (el, j, y) => { const x = metalOf(y, j); return x === undefined ? undefined : MARK[el]?.[x]; }, api);
    return sig ? { count: t.count, type, charge, carbon, test: (k, order) => base(k) && drawn(k, order) === sig } : undefined;
  }
  const groups = kappa!.map((x, j) => ({ j: metalOf(x, j), atoms: x.atoms }));
  if (cited.some((x) => /\d/.test(x.loc))) return undefined;
  // Primes: counting on through the term, element by element (κO:κO', κ2N,N',κ2O,O'), and saying only how many atoms
  // of each element bond to each metal: the drawn ligand must leave no doubt which (primedOk).
  // Primes counting on (κ2O,O') may say only how many atoms of each element bond to each metal (primedOk). Where that
  // leaves doubt, or the primes skip (κ2O,O''), they are OPSIN's element locants (O, O', O'' in the order of the name)
  // and the name is read with those atoms marked.
  const next = new Map<string, number>();
  let counting = true;
  for (const a of cited) { if (a.loc.length !== (next.get(a.el) ?? 0)) counting = false; next.set(a.el, a.loc.length + 1); }
  let sig: string | undefined | null = null;
  const probe = () => (sig === null ? (sig = readKappa(inner, charge!, (el, j, y) => { const x = metalOf(y, j); return x === undefined ? undefined : MARK[el]?.[x]; }, api)) : sig);
  return { count: t.count, type, charge, carbon, test: (k, order) => {
    const lig = e.ligands[k], ds = donorGroups(lig, order);
    if (!base(k) || !ds.every((d, i) => d.length === groups.filter((x) => x.j === i).reduce((n, x) => n + x.atoms.length, 0))) return false;
    if (!groups.every((x) => [...new Set(x.atoms.map((a) => a.el))].every((el) => ds[x.j!].filter((d) => g.atoms[d].el === el).length === x.atoms.filter((a) => a.el === el).length))) return false;
    return (counting && primedOk(c.m, g, lig, ds, api)) || (!!probe() && drawn(k, order) === probe());
  } };
}

// An η term with locants read back: the locants, written as etaRange writes them, must cite in OPSIN's structure for the
// name exactly the ligand's bonded atoms (the name read with them marked is the ligand marked at them), on the term's
// metal; and the ligand must be one that needs locants (etaForm gives this form).
function etaClaim(t: PTerm, c: Context, at: number | undefined, text: string, form: string): Claim | undefined {
  const { g, e, api } = c, locs = etaLocs(text);
  if (!locs || /[ηκ]/.test(form) || t.mu || at === undefined) return undefined;
  const b = opsinOf(nameOfForm(form, /(ato|ido|ito)[)\]}]*$/.test(form) ? -1 : 0), api), type = b && api.inchi(b.smiles), cited = b && etaCited(b, locs);
  if (!b || !type || !cited || etaRange(b, locs) !== text) return undefined;
  const charge = smilesCharge(b.smiles), sig = readKappa(`${form}-${kappaText(cited, [...new Set(cited.map((x) => x.el))].sort())}`, charge, (el) => MARK[el]?.[at], api);
  return sig ? { count: t.count, type, charge, carbon: false, test: (k, order) => {
    const lig = e.ligands[k], groups = donorGroups(lig, order);
    if (c.named[k].key !== unfixed(type, c.named[k].pairs) || lig.eta !== locs.length || groups.some((ds, i) => (i === at) !== ds.length > 0) || etaForm(c, k) !== t.inner) return false;
    return flat(api.inchi(ligandMol(c.m, g, lig, new Map(groups.flatMap((ds, j) => ds.map((d) => [d, MARK[g.atoms[d].el][j]] as [number, number])))))) === sig;
  } } : undefined;
}

// A name's words: split at spaces outside enclosing marks ((3 Os—Os) is part of its word).
function topWords(name: string): string[] {
  const out = [""];
  let depth = 0;
  for (const ch of name) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === " " && !depth) out.push(""); else out[out.length - 1] += ch;
  }
  return out;
}
// The check: the finished name read back must say what the drawing shows.
function verify(name: string, c: Context, ions: Ion[]): boolean {
  const { g, e, api } = c, words = topWords(name);
  // Cations come first (IR-5.4): a complex anion follows its counter-ion.
  const at = ions.length && e.charge < 0 ? 1 : 0;
  if (isPoly(c)) {
    if (words.length !== (ions.length ? 2 : 1)) return false;
    if (ions.length) { const ion = readIon(words[1 - at], api); if (!ion?.key || ion.key !== ions[0].key || ion.charge * ions.length !== -e.charge) return false; }
    return verifyPoly(words[at], c);
  }
  const config = /^(?:cis-|trans-|fac-|mer-|Δ-|Λ-|\((?:SP-4-\d|OC-6-\d\d|T-4-[RS]|TBPY-5-\d\d|SPY-5-\d\d)\)-)/.exec(words[at] ?? "")?.[0] ?? "";
  // The configuration at the metal must be the one the drawing fixes (none where it fixes none).
  if (config !== configuration(c)) return false;
  const parsed = parseEntity(words[at].slice(config.length));
  if (!parsed || words.length !== (ions.length ? 2 : 1)) return false;
  // The counter-ion: one kind, as many as the charges need.
  if (ions.length) {
    const ion = readIon(words[1 - at], api);
    if (!ion?.key || ion.key !== ions[0].key || ion.charge * ions.length !== -e.charge) return false;
  }
  const { terms, central } = parsed, el = g.atoms[e.metals[0]].el;
  if (central.el !== el || central.n !== e.metals.length || central.ate !== e.charge < 0) return false;
  if (!!central.mm !== (e.mm.length === 1) || (central.mm && (central.mm[0] !== el || central.mm[1] !== el))) return false;
  if (central.unit && terms.some((t) => !t.mu)) return false;
  // Every term, each metal order tried: the terms must account for every ligand and hydride, each once.
  // Metals not alike must be numbered by the rule (firstMetal); alike, either way.
  const first = e.metals.length === 2 && !alikeMetals(c) ? firstMetal(c) : undefined;
  if (e.metals.length === 2 && alikeMetals(c) === false && first === undefined) return false;
  const orders = e.metals.length === 1 ? [e.metals] : first !== undefined ? [[first, e.metals.find((x) => x !== first)!]] : [e.metals, [e.metals[1], e.metals[0]]];
  const single = e.metals.length === 1 ? 0 : undefined;
  const top = terms.map((t) => claimOf(t, c, single)), units = (central.unit ?? []).flatMap((t) => [claimOf(t, c, 0), claimOf(t, c, 1)]);
  const claims = [...top, ...units];
  if (claims.some((x) => !x)) return false;
  const fits = orders.some((order) => {
    const used = new Set<number>(), hydrides = order.map((x) => g.atoms[x].h);
    for (const cl of claims as Claim[]) {
      if (cl.hydride !== undefined) { hydrides[cl.hydride] -= cl.count; continue; }
      for (let n = 0; n < cl.count; n++) {
        const k = e.ligands.findIndex((_, i) => !used.has(i) && cl.test(i, order));
        if (k < 0) return false;
        used.add(k);
      }
    }
    return used.size === e.ligands.length && hydrides.every((h) => !h);
  });
  if (!fits) return false;
  // The charge number; or the oxidation number, which must be the one the ligands' charges as read back give where
  // the drawing fixes it, and the one the metal's label gives where it has one (Os(II)).
  const suffix = central.suffix;
  if (suffix === undefined) return e.charge === 0;
  const q = /^(\d+)([+-])$/.exec(suffix);
  if (q) return Number(q[1]) * (q[2] === "+" ? 1 : -1) === e.charge && e.charge !== 0;
  const ox = /^(-?)([IVX]+|0)$/.exec(suffix);
  if (!ox || e.charge || e.metals.length !== 1) return false;
  const value = (ox[1] ? -1 : 1) * ROMAN.indexOf(ox[2]);
  const counted = !claims.some((x) => x!.carbon || x!.charge === undefined || (x!.lex && !LEX[x!.lex].ox));
  const balances = counted && value + claims.reduce((t, x) => t + x!.count * x!.charge!, 0) === 0;
  if (e.written !== undefined) return value === e.written && (!fixes(g, e) || !counted || balances);
  return fixes(g, e) && balances;
}

// ——— Polynuclear complexes: unlike metals, and three or more (IR-9.2.5.5 to IR-9.2.5.7) ———
// The central atoms are cited in the order of Table VI, the element met later first, and numbered in that order: within
// an element, the atom with more donor atoms first (IR-9.2.5.6 rule b), then by the ligands in the order of the name
// (rule c: the atom with more of the first ligand spread unevenly first), then by the atoms each is bonded to (rule d).
// Numberings the rules cannot tell apart must give the same name, else there is none. Every ligand cites its metals:
// nonacarbonyl-1κ5C,2κ4C-rheniumcobalt(Re—Co), di-μ-carbonyl-1:2κ4C-decacarbonyl-1κ3C,2κ3C,3κ4C-triangulo-triiron(3 Fe—Fe).
// Named here: ligands with names of their own, on one metal or bridging (μ, μ3); and other ligands on one metal each,
// (triphenylphosphane-3κP). Not named: other bridging ligands and carbon ligands with three or more metals or unlike
// metals, and anions of unlike metals ((dimolybdenumdiiron)ate).
const SEQUENCE = "F Cl Br I At O S Se Te Po N P As Sb Bi H C Si Ge Sn Pb B Al Ga In Tl Zn Cd Hg Cu Ag Au Ni Pd Pt Co Rh Ir Fe Ru Os Mn Tc Re Cr Mo W V Nb Ta Ti Zr Hf Sc Y La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Ac Th Pa U Np Pu Be Mg Ca Sr Ba Ra Li Na K Rb Cs Fr He Ne Ar Kr Xe Rn".split(" ");
const later = (el: string) => SEQUENCE.indexOf(el);
// The central structural unit of three or more metal atoms, where the metal-metal bonds draw one (IR-9.2.5.7).
function unitOf(n: number, mm: [number, number][], metals: number[]): string {
  const deg = metals.map((x) => mm.filter((b) => b.includes(x)).length);
  if (n === 3 && mm.length === 3) return "triangulo";
  if (n === 4 && mm.length === 6) return "tetrahedro";
  if (n === 4 && mm.length === 4 && deg.every((d) => d === 2)) return "quadro";
  // An octahedron: each atom bonded to all but one, its opposite.
  if (n === 6 && mm.length === 12 && deg.every((d) => d === 4)) return "octahedro";
  return "";
}
const MU_SIMPLE = (n: number) => (n > 2 ? `μ${n}` : "μ");
type PolyTerm = { sort: string; mu: number; text: string; hyphen: boolean };
// The terms of the name for one numbering of the metals (order: metal atoms by locant). Undefined where a ligand is not
// one named here.
function polyTerms(c: Context, order: number[], kappas: Map<number, string>): PolyTerm[] | undefined {
  const { g, e, named } = c, loc = new Map(order.map((x, j) => [x, j + 1])), terms: PolyTerm[] = [];
  const lexTerminal = new Map<string, { el: string; at: number[] }>(), lexBridge = new Map<string, { el: string; mu: number; sets: string[] }>();
  const enclosed = new Map<string, { sort: string; count: number }>();
  for (const [k, lig] of e.ligands.entries()) {
    const ms = [...new Set(lig.bonds.map((b) => b.metal))];
    if (lig.lex) {
      if (lig.bonds.length !== ms.length) return undefined;
      const el = g.atoms[lig.bonds[0].atom].el;
      if (ms.length === 1) { const t = lexTerminal.get(lig.lex) ?? { el, at: [] }; t.at.push(loc.get(ms[0])!); lexTerminal.set(lig.lex, t); continue; }
      const key = `${lig.lex} ${ms.length}`, t = lexBridge.get(key) ?? { el, mu: ms.length, sets: [] };
      t.sets.push(ms.map((x) => loc.get(x)!).sort((p, q) => p - q).join(":"));
      lexBridge.set(key, t);
      continue;
    }
    if (ms.length !== 1 || lig.carbon || !kappas.has(k)) return undefined;
    const j = loc.get(ms[0])!, kappa = kappas.get(k)!.replace(/(^|,)κ/g, `$1${j}κ`), text = `${named[k].form}-${kappa}`;
    const t = enclosed.get(text) ?? { sort: named[k].form, count: 0 };
    t.count++;
    enclosed.set(text, t);
  }
  // Hydrides: the metal's own hydrogens, cited as hydrido on each metal.
  for (const x of order) if (g.atoms[x].h) { const t = lexTerminal.get("H") ?? { el: "H", at: [] }; for (let h = 0; h < g.atoms[x].h; h++) t.at.push(loc.get(x)!); lexTerminal.set("H", t); }
  const kappaOf = (counts: Map<string, number>, el: string, sep: string) => [...counts].sort(([a], [b]) => compare(a.split(":").map(Number), b.split(":").map(Number))).map(([at, n]) => `${at}κ${n > 1 ? n : ""}${el}`).join(sep);
  const tally = (xs: string[], per = 1) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + per); return m; };
  for (const [lex, t] of lexTerminal) {
    const n = t.at.length, form = LEX[lex].form;
    if (n > 12) return undefined;
    terms.push({ sort: form, mu: 0, text: `${MULT[n]}${form}-${kappaOf(tally(t.at.map(String)), t.el, ",")}`, hyphen: true });
  }
  for (const [key, t] of lexBridge) {
    const form = LEX[key.split(" ")[0]].form, n = t.sets.length;
    if (n > 12) return undefined;
    // With two metals a bridging ligand needs no κ (di-μ-hydroxido); with more, its metals and donor atoms (1:2κ2C).
    const kappa = order.length > 2 ? `-${kappaOf(tally(t.sets, t.mu), t.el, ";")}` : "";
    terms.push({ sort: form, mu: t.mu, text: `${n > 1 ? `${MULT[n]}-` : ""}${MU_SIMPLE(t.mu)}-${form}${kappa}`, hyphen: true });
  }
  for (const [text, t] of enclosed) {
    if (t.count > 12) return undefined;
    terms.push({ sort: t.sort, mu: 0, text: `${t.count > 1 ? MULTK[t.count] : ""}${enclose(text)}`, hyphen: false });
  }
  return terms.sort((a, b) => alphaKey(a.sort).localeCompare(alphaKey(b.sort)) || b.mu - a.mu || a.text.localeCompare(b.text));
}
// The name for one numbering: the terms, hyphens round those ending in κ or holding μ (IR-9.2.5.5 examples), the
// central structural unit, the central atoms, their bonds and the charge.
function polyText(c: Context, order: number[], kappas: Map<number, string>): string | undefined {
  const { g, e } = c, terms = polyTerms(c, order, kappas);
  if (!terms) return undefined;
  let text = "";
  for (const t of terms) text += (text && !text.endsWith("-") && t.mu ? "-" : "") + t.text + (t.hyphen ? "-" : "");
  const unit = unitOf(order.length, e.mm, order);
  if (unit) text += (text && !text.endsWith("-") ? "-" : "") + `${unit}-`;
  // The central atoms, alike ones in a row counted (diironplatinum).
  const els = order.map((x) => g.atoms[x].el), runs: [string, number][] = [];
  for (const el of els) { if (runs.length && runs[runs.length - 1][0] === el) runs[runs.length - 1][1]++; else runs.push([el, 1]); }
  if (e.charge < 0 && runs.length > 1) return undefined;
  text += runs.map(([el, n]) => `${n > 1 ? MULT[n] : ""}${e.charge < 0 ? ateOf(el) : ELEMENTS.get(el)!}`).join("");
  return text + mmText(c, order, !!unit) + (e.charge ? chargeText(e.charge) : "");
}
// The metal-metal bonds (IR-9.2.5.3): for each pair of elements, in the order of the name, their number ((3 Os—Os));
// where that leaves doubt (not all such pairs bonded, and no central structural unit), each bond by its atoms'
// locants ((Os1—Os3)).
function mmText(c: Context, order: number[], unit: boolean): string {
  const { g, e } = c, loc = new Map(order.map((x, j) => [x, j + 1])), el = (x: number) => g.atoms[x].el;
  const bonds = e.mm.map(([a, b]) => (loc.get(a)! < loc.get(b)! ? [a, b] : [b, a])).sort((p, q) => compare(p.map((x) => loc.get(x)!), q.map((x) => loc.get(x)!)));
  const pairs = new Map<string, number[][]>();
  for (const b of bonds) { const k = `${el(b[0])}—${el(b[1])}`; pairs.set(k, [...(pairs.get(k) ?? []), b]); }
  let out = "";
  for (const [k, bs] of pairs) {
    const [a, b] = k.split("—"), na = order.filter((x) => el(x) === a).length, nb = order.filter((x) => el(x) === b).length;
    const all = a === b ? (na * (na - 1)) / 2 : na * nb;
    if (unit || bs.length === all) out += `(${bs.length > 1 ? `${bs.length} ` : ""}${k})`;
    else out += bs.map(([x, y]) => `(${el(x)}${na > 1 ? loc.get(x) : ""}—${el(y)}${nb > 1 ? loc.get(y) : ""})`).join("");
  }
  return out;
}
// The numberings the rules allow (IR-9.2.5.6 rules a to d), as lists of metal atoms by locant.
function numberings(c: Context, kappas: Map<number, string>): number[][] {
  const { g, e } = c;
  const cn = (x: number) => e.ligands.reduce((t, l) => t + l.bonds.filter((b) => b.metal === x).length, 0) + g.atoms[x].h;
  // Rules a and b: classes in order.
  const sorted = [...e.metals].sort((x, y) => later(g.atoms[y].el) - later(g.atoms[x].el) || cn(y) - cn(x));
  const classes: number[][] = [];
  for (const x of sorted) { const last = classes[classes.length - 1]; if (last && g.atoms[last[0]].el === g.atoms[x].el && cn(last[0]) === cn(x)) last.push(x); else classes.push([x]); }
  // Every order within the classes (at most 720). A central structural unit is numbered round its rings first
  // (IR-9.2.5.7): quadro 1 to 4 round the square; octahedro 1 and 6 opposite, 2 to 5 round the middle.
  let all: number[][] = [[]];
  for (const cl of classes) {
    const perms = permutations(cl);
    all = all.flatMap((p) => perms.map((q) => [...p, ...q]));
    if (all.length > 720) return [];
  }
  const unit = unitOf(e.metals.length, e.mm, e.metals), bonded = (x: number, y: number) => e.mm.some((b) => b.includes(x) && b.includes(y));
  const round = (o: number[], ring: number[]) => ring.every((x, k) => bonded(o[x], o[ring[(k + 1) % ring.length]]));
  if (unit === "quadro") all = all.filter((o) => round(o, [0, 1, 2, 3]));
  if (unit === "octahedro") all = all.filter((o) => !bonded(o[0], o[5]) && round(o, [1, 2, 3, 4]));
  if (!all.length) return [];
  // Rule c: through the terms in name order, each term's donor atoms on each locant, more on lower locants first. Rule
  // d: each atom's metal neighbours' locants, lower first.
  const terms = polyTerms(c, sorted, kappas);
  if (!terms) return [];
  const score = (order: number[]) => {
    const loc = new Map(order.map((x, j) => [x, j])), out: number[] = [];
    for (const t of terms) {
      const counts = order.map(() => 0);
      for (const lig of e.ligands) {
        const form = lig.lex ? LEX[lig.lex].form : c.named[e.ligands.indexOf(lig)].form, mu = new Set(lig.bonds.map((b) => b.metal)).size;
        if (form !== t.sort || (mu > 1 ? mu : 0) !== t.mu) continue;
        for (const b of lig.bonds) counts[loc.get(b.metal)!]++;
      }
      if (t.sort === LEX.H.form && !t.mu) order.forEach((x, j) => (counts[j] += g.atoms[x].h));
      out.push(...counts.map((n) => -n));
    }
    for (const x of order) out.push(...e.mm.filter((b) => b.includes(x)).map((b) => loc.get(b[0] === x ? b[1] : b[0])!).sort((p, q) => p - q), 99);
    return out;
  };
  const scored = all.map((o) => ({ o, s: score(o) })), best = scored.reduce((m, x) => (compare(x.s, m) < 0 ? x.s : m), scored[0].s);
  return scored.filter((x) => compare(x.s, best) === 0).map((x) => x.o);
}
function permutations(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
// Each ligand on one metal (not a ligand with a name of its own): its κ for that metal, "" where it needs none, as
// the name cites it in the polynuclear name: κ by element alone where it needs none (triphenylphosphane-1κP).
function polyKappas(c: Context): Map<number, string> | undefined {
  const { m, g, e, named, api } = c, out = new Map<number, string>();
  for (const [k, lig] of e.ligands.entries()) {
    if (lig.lex) continue;
    const ms = [...new Set(lig.bonds.map((b) => b.metal))];
    if (ms.length !== 1 || lig.carbon || lig.eta) return undefined;
    if (!needsKappa(g, lig)) { out.set(k, `κ${g.atoms[lig.bonds[0].atom].el}`); continue; }
    const kp = kappaParts(m, g, lig, named[k], ms, api);
    if (!kp || kp.form || !kp.parts[0]) return undefined;
    out.set(k, kp.parts[0]);
  }
  return out;
}
// Three or more metal atoms, or two of different elements.
const isPoly = (c: Context) => c.e.metals.length > 2 || (c.e.metals.length === 2 && c.g.atoms[c.e.metals[0]].el !== c.g.atoms[c.e.metals[1]].el);
function polynuclear(c: Context): string | undefined {
  if (c.e.metals.length > 6) return undefined;
  const kappas = polyKappas(c);
  if (!kappas) return undefined;
  // Of the numberings the rules allow, the one whose name has the lowest locants, in the order cited.
  const names = numberings(c, kappas).map((o) => polyText(c, o, kappas));
  if (!names.length || names.some((n) => !n)) return undefined;
  const nums = (n: string) => [...n.matchAll(/\d+/g)].map((x) => Number(x[0]));
  return names.reduce((best, n) => (compare(nums(n!), nums(best!)) < 0 ? n : best));
}
// The check of a polynuclear name: read term by term, each term must account for its ligands on the metals its κ
// cites, under a numbering the rules allow; the central structural unit, the central atoms, their bonds and the
// charge must be the drawing's.
const KGROUP = "\\d(?::\\d)*κ\\d*[A-Z][a-z]?";
const POLY_MU = new RegExp(`^(?:(${MULTS})-)?μ(\\d?)-(${FORMS})(?:-(${KGROUP}(?:;${KGROUP})*))?(?:-|(?=\\(|$))`);
const POLY_LEX = new RegExp(`^(${MULTS})?(${FORMS})-(\\dκ\\d*[A-Z][a-z]?(?:,\\dκ\\d*[A-Z][a-z]?)*)-`);
function verifyPoly(word: string, c: Context): boolean {
  const { g, e } = c, kappas = polyKappas(c);
  if (!kappas || word.length > MOST_NAME) return false;
  // Terms.
  type PClaim = { lex?: string; mu: number; groups: Map<string, number>; el?: string; enclosed?: { count: number; inner: string; at: number } };
  const claims: PClaim[] = [];
  let w = word, x: RegExpExecArray | null;
  for (let guard = 0; guard < 40; guard++) {
    if ((x = POLY_MU.exec(w))) {
      const n = x[1] ? MULT.indexOf(x[1]) : 1, mu = x[2] ? Number(x[2]) : 2, groups = new Map<string, number>();
      for (const k of (x[4] ?? "").split(";").filter(Boolean)) { const y = /^([\d:]+)κ(\d*)([A-Z][a-z]?)$/.exec(k)!; groups.set(y[1], Number(y[2] || 1)); if (y[1].split(":").length !== mu) return false; }
      if (!x[4] && e.metals.length !== 2) return false;
      claims.push({ lex: LEX_FORMS.get(x[3]), mu, groups: x[4] ? groups : new Map([["1:2", 2 * n]]), el: x[4] ? /[A-Z][a-z]?$/.exec(x[4])![0] : undefined });
      w = w.slice(x[0].length);
      continue;
    }
    if ((x = POLY_LEX.exec(w))) {
      const groups = new Map<string, number>();
      for (const k of x[3].split(",")) { const y = /^(\d)κ(\d*)([A-Z][a-z]?)$/.exec(k)!; groups.set(y[1], Number(y[2] || 1)); }
      const els = new Set(x[3].split(",").map((k) => /[A-Z][a-z]?$/.exec(k)![0]));
      if (els.size !== 1 || [...groups.values()].reduce((t, v) => t + v, 0) !== (x[1] ? MULT.indexOf(x[1]) : 1)) return false;
      claims.push({ lex: LEX_FORMS.get(x[2]), mu: 0, groups, el: [...els][0] });
      w = w.slice(x[0].length);
      continue;
    }
    const enc = ENC_RE.exec(w);
    if (enc && "([{".includes(w[enc[0].length] ?? "")) {
      const start = enc[0].length, end = closing(w, start);
      if (end < 0) return false;
      const inner = w.slice(start + 1, end), locs = [...inner.matchAll(/(?:^|[,:-])(\d)κ/g)].map((y) => Number(y[1]));
      if (!locs.length || new Set(locs).size !== 1 || /(?:^|[,:-])κ/.test(inner)) return false;
      claims.push({ mu: 0, groups: new Map(), enclosed: { count: enc[1] ? MULTK.indexOf(enc[1]) : 1, inner: inner.replace(/(^|[,:-])\dκ/g, "$1κ"), at: locs[0] } });
      w = w.slice(end + 1);
      if (w.startsWith("-")) w = w.slice(1);
      continue;
    }
    break;
  }
  // The central structural unit, the central atoms, their bonds, the charge.
  const unit = /^(triangulo|quadro|tetrahedro|octahedro)-/.exec(w)?.[1] ?? "";
  w = w.slice(unit ? unit.length + 1 : 0);
  const cited: string[] = [];
  let ate = false;
  for (let guard = 0; guard < 12 && w && !w.startsWith("("); guard++) {
    const mult = new RegExp(`^(${MULTS})?`).exec(w)!, name = METAL_NAMES.find((y) => w.startsWith(y, mult[0].length));
    if (!name) return false;
    const it = NAMES.get(name)!;
    ate ||= it.ate;
    for (let k = 0; k < (mult[1] ? MULT.indexOf(mult[1]) : 1); k++) cited.push(it.el);
    w = w.slice(mult[0].length + name.length);
  }
  const charge = /\((\d+)([+-])\)$/.exec(w), q = charge ? Number(charge[1]) * (charge[2] === "+" ? 1 : -1) : 0;
  if (q !== e.charge || ate !== e.charge < 0) return false;
  const mmPart = charge ? w.slice(0, -charge[0].length) : w;
  if (cited.length !== e.metals.length) return false;
  // Under a numbering the rules allow: the elements by locant, the unit, the bonds and every ligand.
  return numberings(c, kappas).some((order) => {
    if (order.some((x, j) => g.atoms[x].el !== cited[j])) return false;
    if (unitOf(order.length, e.mm, order) !== unit || mmText(c, order, !!unit) !== mmPart) return false;
    const loc = new Map(order.map((y, j) => [y, j + 1])), used = new Set<number>();
    const hydrides = order.map((y) => g.atoms[y].h);
    for (const cl of claims) {
      if (cl.enclosed) {
        const metal = order[cl.enclosed.at - 1], claim = metal === undefined ? undefined : claimOf({ count: cl.enclosed.count, mu: false, inner: cl.enclosed.inner }, c, 0);
        if (!claim) return false;
        for (let n = 0; n < cl.enclosed.count; n++) {
          const k = e.ligands.findIndex((lig, i) => !used.has(i) && !lig.lex && lig.bonds.every((b) => b.metal === metal) && claim.test(i, [metal]));
          if (k < 0) return false;
          used.add(k);
        }
        continue;
      }
      // A ligand with a name of its own: each group of metals, as many donor atoms as it says.
      for (const [set, n] of cl.groups) {
        const ms = set.split(":").map((y) => order[Number(y) - 1]);
        if (ms.some((y) => y === undefined)) return false;
        // Hydrido: drawn H atoms on that metal, then the metal's own hydrogens.
        if (cl.lex === "H" && !cl.mu) {
          if (ms.length !== 1 || cl.el !== "H") return false;
          for (let k = 0; k < n; k++) {
            const i = e.ligands.findIndex((lig, i) => !used.has(i) && lig.lex === "H" && lig.bonds.length === 1 && lig.bonds[0].metal === ms[0]);
            if (i >= 0) used.add(i); else hydrides[loc.get(ms[0])! - 1]--;
          }
          continue;
        }
        if (n % ms.length) return false;
        for (let k = 0; k < n / ms.length; k++) {
          const i = e.ligands.findIndex((lig, i) => !used.has(i) && lig.lex === cl.lex && lig.bonds.length === ms.length && ms.every((y) => lig.bonds.some((b) => b.metal === y)) && (!cl.el || lig.bonds.every((b) => g.atoms[b.atom].el === cl.el)));
          if (i < 0) return false;
          used.add(i);
        }
      }
    }
    return used.size === e.ligands.length && hydrides.every((h) => h === 0);
  });
}

// ——— The name ———
const memo = new Map<string, Named>();
// A ligand's name, once for alike ligands (by its InChI, the names found kept between calls).
function ligandName(m: Mol, g: Graph, lig: Ligand, api: ComplexApi): Named | undefined {
  // Not kept where the chelate fixes E or Z (Ligand.fixed): the bonds it fixes depend on the complex, not the ligand.
  if (lig.lex || lig.fixed) return nameLigand(m, g, lig, api);
  const k = `${lig.carbon ? lig.bonds[0].order : 0} ${api.inchi(ligandMol(m, g, lig, new Map(), !!lig.carbon))}`, kept = memo.get(k);
  if (kept) return kept;
  const found = nameLigand(m, g, lig, api);
  if (found) { if (memo.size > 400) memo.clear(); memo.set(k, found); }
  return found;
}
// The name of a structure with metal atoms bonded to ligands: one complex, alone or with one kind of counter-ion.
// Undefined unless every check agrees (see the top of this file).
export function complexName(m: Mol, api: ComplexApi): string | undefined {
  try {
    const d = drawing(m, keep(api));
    if (!d) return undefined;
    const { c, ions } = d, e = c.e;
    const text = e.metals.length === 1 ? mononuclear(c) : isPoly(c) ? polynuclear(c) : dinuclear(c), ion = ions[0];
    if (!text || text.length > MOST_NAME) return undefined;
    const name = !ion ? text : e.charge > 0 ? `${text} ${ion.name}` : `${ion.name} ${text}`;
    return verify(name, c, ions) ? name : undefined;
  } catch {
    return undefined;
  }
}
// Whether a name reads back as this drawing, by the checks above (for the checks of the checks).
export function complexNameReads(name: string, m: Mol, api: ComplexApi): boolean {
  try {
    const d = drawing(m, keep(api));
    return !!d && name.length <= MOST_NAME && verify(name, d.c, d.ions);
  } catch {
    return false;
  }
}
// The drawing as one complex with its ligands named, and its counter-ions (one kind, as many as the charges need).
function drawing(m: Mol, api: ComplexApi): { c: Context; ions: Ion[] } | undefined {
  if (m.atoms.length > MOST_ATOMS) return undefined;
  const g = graphOf(m);
  if (!g || !g.atoms.some((a) => isMetal(a.el) || MAIN.has(a.el))) return undefined;
  // The complex: the one piece with a metal atom bonded to something; else the one piece with a main-group central
  // atom (centresOf). Lone metal ions are counter-ions.
  const s = shapeOf(g), frags = parts(g.atoms.length, s.adj, () => true);
  let cx = frags.filter((p) => p.length > 1 && p.some((i) => isMetal(g.atoms[i].el)));
  if (!cx.length) cx = frags.filter((p) => p.length > 1 && centresOf(s, p).length);
  if (cx.length !== 1) return undefined;
  const e = entityOf(s, cx[0]);
  if (!e) return undefined;
  const named = e.ligands.map((lig) => ligandName(m, g, lig, api));
  if (named.some((x) => !x)) return undefined;
  const ions = frags.filter((p) => p !== cx[0]).map((p) => ionOf(m, g, p, api));
  if (ions.some((x) => !x) || new Set(ions.map((x) => x!.key)).size > 1) return undefined;
  if (ions.length && (Math.sign(ions[0]!.charge) !== -Math.sign(e.charge) || ions[0]!.charge * ions.length !== -e.charge)) return undefined;
  if (e.metals.length === 1 && m.atoms[e.metals[0]].ox !== undefined) e.written = m.atoms[e.metals[0]].ox;
  return { c: { m, g, e, named: named as Named[], api }, ions: ions as Ion[] };
}
// Whether a structure can have CIP labels: a wedge or a bond style cip.ts reads as one, or a double bond in no ring of
// under 8 atoms.
function stereoable(m: Mol): boolean {
  if (m.bonds.some((b) => (b.stereo && b.stereo !== 3) || ["hashed", "dashed", "bold", "hollow"].includes(b.display ?? ""))) return true;
  const adj: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) { adj[b.atoms[0]].push(b.atoms[1]); adj[b.atoms[1]].push(b.atoms[0]); }
  // A double bond in no ring of under 8 atoms: InChI gives E or Z to one in a larger ring (cyclooctene).
  return m.bonds.some((b) => b.type === 2 && b.stereo !== 3 && !smallRing(adj, b.atoms[0], b.atoms[1], () => true));
}
// The API with OPSIN's readings and InChIs kept for one name: the check reads many names and structures twice. At most
// 150 readings and 600 InChIs for one name, so that no drawing can keep it busy: past that, nothing reads, and no
// name is given.
function keep(api: ComplexApi): ComplexApi {
  const read = new Map<string, string | undefined>(), atoms = new Map<string, string | undefined>(), inchi = new Map<string, string | undefined>();
  let readings = 0, inchis = 0;
  const once = <T>(map: Map<string, T | undefined>, k: string, f: () => T | undefined) => {
    if (!map.has(k)) map.set(k, (map === inchi ? ++inchis > 600 : ++readings > 150) ? undefined : f());
    return map.get(k);
  };
  return {
    read: (n) => once(read, n, () => api.read(n)),
    atoms: (n) => once(atoms, n, () => api.atoms(n)),
    inchi: (s) => once(inchi, typeof s === "string" ? s : JSON.stringify(s), () => api.inchi(s)),
    ...(api.aux ? { aux: (m: Mol) => once(inchi, `aux ${JSON.stringify(m)}`, () => api.aux!(m)) } : {}),
    // CIP labels only where there can be some: a wedge, or a double bond in no ring (E or Z by the drawing).
    ...(api.cip ? { cip: (m: Mol) => (stereoable(m) ? api.cip!(m) : undefined) } : {}),
  };
}

