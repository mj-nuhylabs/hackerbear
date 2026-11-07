// Names for structures with metal atoms (IUPAC 2005 Red Book IR-5, IR-8, IR-9, IR-10; IUPAC 2013 P-69). The namer
// (namer.ts) calls metalName first and passes in what it needs from the namer, so this module does not import it.
// Every name is one OPSIN reads back as the drawn structure, so the forms are those OPSIN reads. The namer names lone
// metal atoms and ions (iron, iron(3+)), salts of lone metal ions (iron(III) chloride) and hydrates. Here:
//
// - Metallocenes drawn as OPSIN draws them (the metal ion and two cyclopentadienide rings): ferrocene,
//   1,1'-dimethylferrocene, ferrocenecarboxylic acid, ferrocen-1-ol, and the prefix ferrocenyl (ferrocenylmethanol).
// - Salts of cations with one metal atom (ethylzinc(1+) iodide). A metal joined only by single bonds to halogen, O, N
//   or S atoms is named as the salt of its ions (a drawn Cl-Fe(Cl)-Cl is iron(III) chloride, CH3COO-Na sodium acetate).
// - Any other molecule with one metal atom, by an additive name (IR-9, P-69): butyllithium, bromo(methyl)magnesium,
//   diethylzinc, pentacarbonyliron, dichlorobis(cyclopenta-2,4-dien-1-yl)titanium; and oxoacids (chromic acid).
//
// OPSIN reads no name for a dative bond or a chelate ring (κ and η names: tris(2,2'-bipyridine)ruthenium(2+),
// cisplatin, Jacobsen's Mn(salen)Cl), for anionic complexes (tetrachloridoplatinate(2-), lithium dimethylcuprate),
// or for the 2005 ligand names (chlorido, oxido, propan-2-olato): it reads chloro, oxo and propan-2-yloxy, so the
// additive names here use those.
import type { Graph } from "./naming.ts";
import type { Mol } from "./render.ts";

type Name = { text: string; compound: boolean };
// What metalName needs from the namer.
export type MetalApi = {
  name: (g: Graph, opaque?: Map<number, Name>) => string | undefined; // a whole structure's name; opaque atoms are cited by their names
  prefix: (g: Graph, x: number, from: number) => Name; // atom x and what hangs on it, as a prefix on atom from
  groups: (g: Graph) => { kind?: string; sites: { atom: number; on: number[] }[] }; // the principal characteristic groups
  anion: (g: Graph, part: number[]) => string | undefined;
  salt: (g: Graph, parts: number[][]) => string | undefined;
  cation: (el: string) => [string, number] | undefined; // a metal ion of one usual charge
  assemblePrefixes: (list: { loc: string; name: Name }[], noLocants: boolean) => string;
  alphaKey: (t: string) => string;
  enclose: (n: Name) => string; // a name in brackets of the right level (P-16.5.4)
};

// Element names (IR-3.1), for metals here and for lone atoms and ions in namer.ts.
export const ELEMENTS = new Map(("H hydrogen He helium Li lithium Be beryllium B boron C carbon N nitrogen O oxygen F fluorine Ne neon Na sodium " +
  "Mg magnesium Al aluminium Si silicon P phosphorus S sulfur Cl chlorine Ar argon K potassium Ca calcium Sc scandium Ti titanium " +
  "V vanadium Cr chromium Mn manganese Fe iron Co cobalt Ni nickel Cu copper Zn zinc Ga gallium Ge germanium As arsenic Se selenium " +
  "Br bromine Kr krypton Rb rubidium Sr strontium Y yttrium Zr zirconium Nb niobium Mo molybdenum Tc technetium Ru ruthenium " +
  "Rh rhodium Pd palladium Ag silver Cd cadmium In indium Sn tin Sb antimony Te tellurium I iodine Xe xenon Cs caesium Ba barium " +
  "La lanthanum Ce cerium Pr praseodymium Nd neodymium Pm promethium Sm samarium Eu europium Gd gadolinium Tb terbium " +
  "Dy dysprosium Ho holmium Er erbium Tm thulium Yb ytterbium Lu lutetium Hf hafnium Ta tantalum W tungsten Re rhenium Os osmium " +
  "Ir iridium Pt platinum Au gold Hg mercury Tl thallium Pb lead Bi bismuth Po polonium At astatine Rn radon Fr francium Ra radium " +
  "Ac actinium Th thorium Pa protactinium U uranium Np neptunium Pu plutonium Am americium Cm curium Bk berkelium Cf californium " +
  "Es einsteinium Fm fermium Md mendelevium No nobelium Lr lawrencium Rf rutherfordium Db dubnium Sg seaborgium Bh bohrium " +
  "Hs hassium Mt meitnerium Ds darmstadtium Rg roentgenium Cn copernicium Nh nihonium Fl flerovium Mc moscovium Lv livermorium " +
  "Ts tennessine Og oganesson").split(" ").flatMap((w, k, a) => (k % 2 ? [] : [[w, a[k + 1]] as [string, string]])));
// The metals named here: groups 1 to 12 (mercury aside), the lanthanoids and the actinoids.
const METALS = new Set(("Li Na K Rb Cs Fr Be Mg Ca Sr Ba Ra Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au " +
  "Rf Db Sg Bh Hs Mt Ds Rg Cn La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr").split(" "));
// Metal ions of one usual charge, besides those the namer has (namer.ts CATIONS).
export const MORE_CATIONS: Record<string, [string, number]> = {
  Fr: ["francium", 1], Be: ["beryllium", 2], Ra: ["radium", 2], Cd: ["cadmium", 2], Al: ["aluminium", 3], Sc: ["scandium", 3], Y: ["yttrium", 3], La: ["lanthanum", 3],
};
// Anions with metals, and the amide ion (IR-8 Table, IR-11): by formula with hydrogens and charge, as namer.ts writes it.
export const METAL_ANIONS: Record<string, string> = {
  "H2N-1": "amide", "CrO4-2": "chromate", "Cr2O7-2": "dichromate", "MnO4-2": "manganate", "O4Tc-1": "pertechnetate", "O4Re-1": "perrhenate",
};
// Metallocenes (IR-10.2.6): bis(η5-cyclopentadienyl) sandwiches, drawn as M2+ and two C5H5- rings.
export const OCENES: Record<string, string> = {
  V: "vanadocene", Cr: "chromocene", Fe: "ferrocene", Co: "cobaltocene", Ni: "nickelocene", Ru: "ruthenocene", Os: "osmocene",
  Rh: "rhodocene", Ti: "titanocene", Zr: "zirconocene", Mo: "molybdocene", Nb: "niobocene",
};
// Oxoacids of metals with names in IR-8 Table: metal, =O, OH.
const ACIDS: Record<string, string> = {
  "Cr1:4:2": "chromic acid", "Cr2:7:2": "dichromic acid", "Mn1:4:2": "manganic acid", "Mn1:4:1": "permanganic acid",
  "Tc1:4:2": "technetic acid", "Tc1:4:1": "pertechnetic acid", "Re1:4:2": "rhenic acid", "Re1:4:1": "perrhenic acid",
};
const HALO: Record<string, string> = { F: "fluoro", Cl: "chloro", Br: "bromo", I: "iodo" };
const MULT = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa"];
const MULT_COMPLEX = ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis", "heptakis", "octakis"];
// The valences an atom has with no dative bond to the metal.
const VALENCE: Record<string, number[]> = { C: [4], N: [3], O: [2], S: [2, 4, 6], P: [3, 5], F: [1], Cl: [1], Br: [1], I: [1] };

export const isMetal = (el: string) => METALS.has(el);

// A metallocene drawn with multi-centre attachments (the j key, or ChemDraw's), as OPSIN draws one and as its
// standard InChI has it: the metal ion M2+ and two cyclopentadienide rings (C5H5-), with no attachment points.
// Undefined unless every multi-centre attachment in the drawing is one of two on such a metal, and nothing else.
export function sandwichIons(m: Mol): Mol | undefined {
  const centres = m.atoms.flatMap((a, i) => (a.centre ? [i] : []));
  if (!centres.length) return undefined;
  const nbrs = (i: number) => m.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
  const bond = (a: number, b: number) => m.bonds.find((x) => (x.atoms[0] === a && x.atoms[1] === b) || (x.atoms[0] === b && x.atoms[1] === a));
  const metals = new Map<number, number[]>();
  for (const c of centres) {
    const ns = nbrs(c), metal = ns[0];
    if (m.atoms[c].centre!.variable || ns.length !== 1 || !OCENES[m.atoms[metal].label] || m.atoms[metal].text) return undefined;
    metals.set(metal, [...(metals.get(metal) ?? []), c]);
  }
  const atoms = m.atoms.map((a) => ({ ...a })), types = new Map<Mol["bonds"][number], number>();
  for (const [metal, cs] of metals) {
    if (cs.length !== 2 || nbrs(metal).length !== 2 || m.atoms[metal].charge) return undefined;
    atoms[metal].charge = 2;
    for (const c of cs) {
      // The ring in cycle order: five carbons joined round by single, double or delocalised bonds.
      const ring = m.atoms[c].centre!.atoms, cycle = [ring[0]];
      if (ring.length !== 5 || ring.some((i) => m.atoms[i]?.label !== "C" || m.atoms[i].charge || m.atoms[i].text)) return undefined;
      while (cycle.length < 5) {
        const next = nbrs(cycle[cycle.length - 1]).find((j) => ring.includes(j) && !cycle.includes(j));
        if (next === undefined) return undefined;
        cycle.push(next);
      }
      const bonds = cycle.map((a, k) => bond(a, cycle[(k + 1) % 5]));
      if (bonds.some((b) => !b || ![1, 2, 4].includes(b.type))) return undefined;
      // Delocalised: the charge on the first carbon, then double, single, double round the ring. Drawn with two double
      // bonds: the charge on the carbon between two single bonds.
      let start = 0;
      if (bonds.some((b) => b!.type !== 4)) {
        start = cycle.findIndex((_, k) => bonds[k]!.type === 1 && bonds[(k + 4) % 5]!.type === 1);
        if (start < 0 || bonds.filter((b) => b!.type === 2).length !== 2) return undefined;
      }
      atoms[cycle[start]].charge = -1;
      for (let k = 0; k < 5; k++) types.set(bonds[(start + k) % 5]!, k === 1 || k === 3 ? 2 : 1);
    }
  }
  // The attachment points go, with their bonds.
  const keep = atoms.map((a) => !a.centre), at: number[] = [];
  let n = 0;
  keep.forEach((k, i) => { if (k) at[i] = n++; });
  return {
    atoms: atoms.filter((_, i) => keep[i]),
    bonds: m.bonds.filter((b) => keep[b.atoms[0]] && keep[b.atoms[1]]).map((b) => (types.has(b)
      ? { atoms: [at[b.atoms[0]], at[b.atoms[1]]] as [number, number], type: types.get(b)! }
      : { ...b, atoms: [at[b.atoms[0]], at[b.atoms[1]]] as [number, number] })),
  };
}

export function metalName(g: Graph, parts: number[][], api: MetalApi): string | undefined {
  // Lone atoms and ions (iron, iron(3+)) and hydrates (copper(II) sulfate pentahydrate) are the namer's.
  if (!g.atoms.some((a) => isMetal(a.el)) || g.atoms.length === 1 || (parts.length > 1 && parts.some((p) => p.length === 1 && !g.atoms[p[0]].charge))) return undefined;
  const s = new Shape(g);
  const text = metallocene(s, api) ?? (parts.length > 1 ? salt(g, parts, api) : molecule(s, api));
  if (text === undefined) return undefined;
  // Every stereo label must be cited, as the namer requires (P-91).
  const cited = [...text.matchAll(/\(([^()]*)\)-/g)].flatMap((m) => m[1].split(",")).filter((t) => /^\d+[a-z]?'*[RSEZ]$/.test(t)).length;
  if (cited !== g.atoms.filter((a) => a.cip).length + g.bonds.filter((b) => b.cip).length) throw new Error("stereo not cited");
  return text;
}

// A structure's bonds, and pieces of it as structures of their own.
class Shape {
  g: Graph; adj: number[][]; bond = new Map<string, number>();
  constructor(g: Graph) {
    this.g = g;
    this.adj = g.atoms.map(() => []);
    for (const b of g.bonds) { this.adj[b.a].push(b.b); this.adj[b.b].push(b.a); this.bond.set(key(b.a, b.b), b.order); }
  }
  ord = (a: number, b: number) => this.bond.get(key(a, b)) ?? 0;
  valence = (i: number) => this.adj[i].reduce((t, j) => t + this.ord(i, j), 0) + this.g.atoms[i].h;
  // Everything reachable from start without entering blocked.
  reach(start: number, blocked: Set<number>): number[] {
    const seen = new Set([start]), stack = [start];
    while (stack.length) { const i = stack.pop()!; for (const j of this.adj[i]) if (!seen.has(j) && !blocked.has(j)) { seen.add(j); stack.push(j); } }
    return [...seen];
  }
  // The atoms keep as a structure, with extra atoms each bonded to one of them (placeholders).
  build(keep: number[], extra: { el: string; h: number; to: number }[] = []): { g: Graph; at: Map<number, number>; extra: number[] } {
    const at = new Map(keep.map((i, k) => [i, k]));
    const atoms = keep.map((i) => ({ ...this.g.atoms[i] }));
    const bonds = this.g.bonds.filter((b) => at.has(b.a) && at.has(b.b)).map((b) => ({ ...b, a: at.get(b.a)!, b: at.get(b.b)! }));
    const ids = extra.map((e) => { atoms.push({ el: e.el, charge: 0, h: e.h }); bonds.push({ a: atoms.length - 1, b: at.get(e.to)!, order: 1 }); return atoms.length - 1; });
    return { g: { atoms, bonds }, at, extra: ids };
  }
  // Whether atom i is in a ring: two of its neighbours are joined without it.
  inRing(i: number): boolean {
    return this.adj[i].some((j, k) => this.adj[i].slice(k + 1).some((l) => this.reach(j, new Set([i])).includes(l)));
  }
}
const key = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`);
const compare = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};
const locantsOf = (name: string) => (name.match(/\d+/g) ?? []).map(Number);
// Of several names for one structure, the one with the lowest locants, then the first in alphabetical order.
const first = (names: string[]) => names.sort((a, b) => compare(locantsOf(a), locantsOf(b)) || a.localeCompare(b))[0];

// ——— Metallocenes ———
// Suffixes a metallocene takes, as a ring does (P-65 to P-68): the principal group on a ring carbon.
const SUFFIX: Record<string, string> = {
  acid: "carboxylic acid", aldehyde: "carbaldehyde", nitrile: "carbonitrile", amide: "carboxamide", sulfonic: "sulfonic acid",
  alcohol: "ol", thiol: "thiol", amine: "amine", ester: "carboxylate", halide: "carbonyl", sulfonylhalide: "sulfonyl",
};
const HALIDE: Record<string, string> = { F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" };
function metallocene(s: Shape, api: MetalApi): string | undefined {
  const { g, adj } = s;
  const ms = g.atoms.flatMap((a, i) => (OCENES[a.el] && !adj[i].length ? [i] : []));
  if (ms.length !== 1) return undefined;
  const m = ms[0];
  if (g.atoms[m].charge !== 2 || g.atoms[m].h) return undefined;
  const rings = ringsOf(s);
  if (rings.length !== 2) return undefined;
  const unit = new Set([m, ...rings.flat()]);
  if (g.atoms.reduce((t, a, i) => t + (unit.has(i) ? 0 : a.charge), 0)) return undefined; // a salt of a metallocene ion
  // Substituents: each hangs on one ring carbon (none bridges two: an ansa-metallocene is not named).
  const subs = rings.flat().flatMap((r) => adj[r].filter((x) => !unit.has(x)).map((x) => ({ r, x, atoms: s.reach(x, unit) })));
  for (const sub of subs) if (sub.atoms.some((i) => adj[i].some((j) => unit.has(j) && (i !== sub.x || j !== sub.r)))) throw new Error("ansa-metallocene");
  if (subs.reduce((t, sub) => t + sub.atoms.length, 0) + unit.size !== g.atoms.length) return undefined; // with other pieces: a salt or mixture
  if (subs.some((sub) => sub.atoms.some((i) => isMetal(g.atoms[i].el)))) throw new Error("several metals");
  const stem = OCENES[g.atoms[m].el];
  // A ring that has lost a hydrogen ion as well (C5H4 2-): the anion ferrocenide (P-72.2), with nothing else on it.
  const ide = rings.filter((r) => r.filter((a) => g.atoms[a].charge === -1).length === 2).length;
  if (ide) return ide === 1 && !subs.length ? `${stem.slice(0, -1)}ide` : undefined;
  if (!subs.length) return stem;
  // The substituents with a methyl in place of their ring carbon, for their prefix names and their groups.
  const p0 = s.build(subs.flatMap((sub) => sub.atoms), subs.map((sub) => ({ el: "C", h: 3, to: sub.x })));
  const groups = api.groups(p0.g), kind = groups.kind;
  const back = new Map([...p0.at].map(([i, k]) => [k, i]));
  const prefixOf = subs.map((sub, k) => () => api.prefix(p0.g, p0.at.get(sub.x)!, p0.extra[k]));
  // Principal groups on a ring carbon itself, which the metallocene takes as its suffix.
  // A ketone or imine there is on its own carbon (1-ferrocenylethanone); an anhydride has no name here.
  const onRing = subs.map((sub, k) => !!kind && !!SUFFIX[kind] && groups.sites.some((x) => back.get(x.atom) === sub.x && x.on.includes(p0.extra[k])));
  if (kind === "anhydride" && subs.some((sub) => groups.sites.some((x) => back.get(x.atom) === sub.x))) throw new Error("anhydride on a metallocene");
  const onM = onRing.filter(Boolean).length;
  const inSub = subs.map((sub) => groups.sites.filter((x) => sub.atoms.includes(back.get(x.atom)!)).length);
  const most = Math.max(...inSub);
  // The parent (P-44): the most principal groups, a ring before a chain; with none, a phosphane, then a heterocycle.
  let parents: number[] = [];
  if (kind) { if (!onM || onM < most) parents = subs.map((_, k) => k).filter((k) => inSub[k] === most); }
  else {
    const has = (k: number, f: (i: number) => boolean) => subs[k].atoms.some(f);
    parents = subs.map((_, k) => k).filter((k) => has(k, (i) => g.atoms[i].el === "P"));
    if (!parents.length) parents = subs.map((_, k) => k).filter((k) => has(k, (i) => g.atoms[i].el !== "C" && s.inRing(i)));
    if (parents.length > 1 && !subs.some((_, k) => has(k, (i) => g.atoms[i].el === "P"))) throw new Error("metallocene and heterocycles");
    // A metallocene against a polycyclic carbon ring system is not settled here.
    if (!parents.length && subs.some((sub) => sub.atoms.some((i) => g.atoms[i].el === "C" && adj[i].filter((j) => sub.atoms.includes(j) && s.inRing(j)).length > 2))) throw new Error("metallocene and ring system");
  }
  // Numberings (IR-10.2.6): one ring 1 to 5, the other 1' to 5'. In order, 1 < 1' < 2 < 2'.
  const numberings = (fixed?: number) => {
    const out: Map<number, { v: number; label: string }>[] = [];
    for (const [a, b] of [[0, 1], [1, 0]]) {
      if (fixed !== undefined && !rings[a].includes(fixed)) continue;
      for (const na of turns(rings[a])) {
        if (fixed !== undefined && na[0] !== fixed) continue;
        for (const nb of turns(rings[b])) {
          const map = new Map<number, { v: number; label: string }>();
          na.forEach((at, k) => map.set(at, { v: 2 * (k + 1), label: String(k + 1) }));
          nb.forEach((at, k) => map.set(at, { v: 2 * (k + 1) + 1, label: `${k + 1}'` }));
          out.push(map);
        }
      }
    }
    return out;
  };
  // The prefixes in the numbering with the lowest locants (P-31.1.4): first the given sites, then all prefixes
  // together, then the prefix cited first in alphabetical order.
  const best = (nums: ReturnType<typeof numberings>, sites: number[], prefixes: { r: number; name: Name }[]) => {
    const order = [...new Set(prefixes.map((p) => p.name.text))].sort((a, b) => api.alphaKey(a).localeCompare(api.alphaKey(b)));
    const score = (n: (typeof nums)[number]) => [sites, prefixes.map((p) => p.r), ...order.map((t) => prefixes.filter((p) => p.name.text === t).map((p) => p.r))]
      .map((l) => l.map((r) => n.get(r)!.v).sort((a, b) => a - b));
    const ranked = nums.map((n) => ({ n, sc: score(n) }));
    ranked.sort((x, y) => { for (let i = 0; i < x.sc.length; i++) { const c = compare(x.sc[i], y.sc[i]); if (c) return c; } return 0; });
    return ranked[0].n;
  };
  if (!parents.length) {
    // The metallocene is the parent: its suffix, then its prefixes.
    const sites = subs.filter((_, k) => onRing[k]);
    const prefixes = subs.flatMap((sub, k) => (onRing[k] ? [] : [{ r: sub.r, name: prefixOf[k]() }]));
    const n = best(numberings(), sites.map((x) => x.r), prefixes);
    // Substituents on the N of an amine or amide suffix, with the suffix's locant when there are several:
    // N,N-dimethylferrocenamine, N1,N1'-dimethylferrocene-1,1'-diamine.
    const nPrefixes = sites.flatMap((x) => {
      const nAtom = kind === "amine" ? x.x : kind === "amide" ? adj[x.x].find((j) => g.atoms[j].el === "N") : undefined;
      const loc = sites.length > 1 ? `N${n.get(x.r)!.label}` : "N";
      return nAtom === undefined ? [] : adj[nAtom].filter((y) => y !== x.r && y !== x.x).map((y) => ({ loc, name: api.prefix(p0.g, p0.at.get(y)!, p0.at.get(nAtom)!) }));
    });
    const none = sites.length + prefixes.length === 1;
    const prefixText = api.assemblePrefixes([...prefixes.map((p) => ({ loc: n.get(p.r)!.label, name: p.name })), ...nPrefixes], none);
    if (!sites.length) return prefixText + stem;
    const locs = sites.map((x) => n.get(x.r)!).sort((a, b) => a.v - b.v).map((x) => x.label);
    let word = SUFFIX[kind!];
    if (sites.length > 1) word = MULT[sites.length] + word;
    const parent = /^[aeiouy]/.test(word) ? stem.slice(0, -1) : stem;
    const text = prefixText + (none ? parent + word : `${parent}-${locs.join(",")}-${word}`);
    // An acid halide (P-65.5.1): ferrocenecarbonyl chloride, ferrocenesulfonyl chloride.
    if (kind === "halide" || kind === "sulfonylhalide") {
      const xs = new Set(sites.map((x) => g.atoms[adj[x.x].find((j) => HALIDE[g.atoms[j].el])!].el));
      if (xs.size !== 1) throw new Error("mixed halides");
      return `${text} ${MULT[sites.length]}${HALIDE[[...xs][0]]}`;
    }
    if (kind !== "ester") return text;
    // An ester (P-65.6.3): the alkyl group on the ester O, then the acid's name as -carboxylate.
    if (sites.length !== 1) throw new Error("several esters");
    const c = sites[0].x, o = adj[c].find((j) => g.atoms[j].el === "O" && s.ord(c, j) === 1)!, alkyl = adj[o].find((j) => j !== c)!;
    return `${api.prefix(p0.g, p0.at.get(alkyl)!, p0.at.get(o)!).text} ${text}`;
  }
  // The metallocene is a prefix (ferrocenyl) on the parent in one of its substituents.
  const yl = stem.slice(0, -1) + "yl";
  return first(parents.map((k) => {
    const others = subs.flatMap((sub, j) => (j === k ? [] : [{ r: sub.r, name: prefixOf[j]() }]));
    const n = best(numberings(subs[k].r), [], others);
    const text = api.assemblePrefixes(others.map((p) => ({ loc: n.get(p.r)!.label, name: p.name })), false) + yl;
    const p1 = s.build(subs[k].atoms, [{ el: "C", h: 0, to: subs[k].x }]);
    const name = api.name(p1.g, new Map([[p1.extra[0], { text, compound: others.length > 0 }]]));
    if (!name) throw new Error("metallocene");
    return name;
  }));
}
// The numberings of a ring in cycle order: each start, both ways round.
function turns(ring: number[]): number[][] {
  const out: number[][] = [];
  for (let s = 0; s < ring.length; s++) for (const d of [1, -1]) out.push(ring.map((_, k) => ring[(s + d * k + ring.length * 2) % ring.length]));
  return out;
}
// The cyclopentadienide rings (C5H5-) in cycle order: five carbons, one negative (or two, C5H4 2-), two double bonds,
// and one single bond to any substituent.
function ringsOf(s: Shape): number[][] {
  const size = 5;
  const { g, adj } = s, found = new Map<string, number[]>();
  const carbon = (i: number) => g.atoms[i].el === "C" && (g.atoms[i].charge === 0 || g.atoms[i].charge === -1);
  for (let start = 0; start < g.atoms.length; start++) {
    if (g.atoms[start].el !== "C" || g.atoms[start].charge !== -1) continue;
    const walk = (path: number[]) => {
      const last = path[path.length - 1];
      if (path.length === size) { if (adj[last].includes(start)) found.set([...path].sort((a, b) => a - b).join(" "), [...path]); return; }
      for (const j of adj[last]) if (carbon(j) && !path.includes(j)) walk([...path, j]);
    };
    walk([start]);
  }
  return [...found.values()].filter((ring) => {
    const bonds = ring.map((a, k) => s.ord(a, ring[(k + 1) % size]));
    if (bonds.filter((o) => o === 2).length !== 2 || bonds.some((o) => o > 2)) return false;
    if (![1, 2].includes(ring.filter((a) => g.atoms[a].charge === -1).length)) return false;
    return ring.every((a) => {
      const out = adj[a].filter((j) => !ring.includes(j));
      return out.length <= 1 && out.every((j) => s.ord(a, j) === 1) && s.valence(a) === (g.atoms[a].charge ? 3 : 4);
    });
  });
}

// ——— Salts ———
// An ion with one metal atom, which carries the charge, takes its additive name and charge number: ethylzinc(1+)
// iodide. Salts of lone metal ions are the namer's (saltName: calcium diacetate, copper(II) acetate, lithium nitride).
function salt(g: Graph, parts: number[][], api: MetalApi): string | undefined {
  const charge = (p: number[]) => p.reduce((t, i) => t + g.atoms[i].charge, 0);
  const cations = parts.filter((p) => charge(p) > 0), anions = parts.filter((p) => charge(p) < 0);
  if (!cations.length || !anions.length || cations.length + anions.length !== parts.length || parts.reduce((t, p) => t + charge(p), 0)) return undefined;
  // Salts of lone metal ions are the namer's (saltName): calcium diacetate, iron(III) chloride.
  if (cations.every((p) => p.length === 1 && !g.atoms[p[0]].h)) return api.salt(g, parts);
  const s = new Shape(g);
  const cationName = (p: number[]) => {
    const q = charge(p), ms = p.filter((i) => isMetal(g.atoms[i].el));
    if (ms.length !== 1 || g.atoms[ms[0]].charge !== q) return undefined;
    const part = s.build(p);
    return `${additive(new Shape(part.g), part.at.get(ms[0])!, api)}(${q}+)`;
  };
  const names = cations.map(cationName), anionNames = anions.map((p) => api.anion(g, p));
  const same = (l: (string | undefined)[]) => !!l[0] && l.every((n) => n === l[0]);
  return same(names) && same(anionNames) ? `${names[0]} ${anionNames[0]}` : undefined;
}

// ——— Molecules ———
function molecule(s: Shape, api: MetalApi): string | undefined {
  const { g, adj } = s, metals = g.atoms.flatMap((a, i) => (isMetal(a.el) ? [i] : []));
  // A cation with one metal atom carrying the charge: additive name and charge number (dioxouranium(2+)).
  const q = g.atoms.reduce((t, a) => t + a.charge, 0);
  if (metals.length === 1 && q > 0 && g.atoms[metals[0]].charge === q) return additive(s, metals[0], api) + `(${q}+)`;
  if (metals.some((m) => g.atoms[m].charge) || q) throw new Error("charged metal compound");
  const acid = oxoacid(s, metals);
  if (acid) return acid;
  // A metal joined only by single bonds to halogen, O, N or S atoms (no dative bond, none shared with another metal)
  // is an ion: the salt of the ions (iron(III) chloride). The standard InChI of a drawn KO-MnO3 is not that of
  // potassium permanganate, so it has no name.
  const ionic = new Set(metals.filter((m) => !g.atoms[m].h && adj[m].length && adj[m].every((x) => s.ord(m, x) === 1 && ["F", "Cl", "Br", "I", "O", "N", "S"].includes(g.atoms[x].el)
    && !dative(s, x) && adj[x].filter((j) => isMetal(g.atoms[j].el)).length === 1)));
  if (ionic.size) {
    const atoms = g.atoms.map((a) => ({ ...a })), bonds = g.bonds.filter((b) => !ionic.has(b.a) && !ionic.has(b.b));
    for (const b of g.bonds) if (!bonds.includes(b)) { const [m, x] = ionic.has(b.a) ? [b.a, b.b] : [b.b, b.a]; atoms[m].charge++; atoms[x].charge--; }
    const ions: Graph = { atoms, bonds }, t = new Shape(ions), seen = new Set<number>(), parts: number[][] = [];
    for (let i = 0; i < atoms.length; i++) if (!seen.has(i)) { const p = t.reach(i, new Set()); p.forEach((j) => seen.add(j)); parts.push(p); }
    let name: string | undefined;
    try { name = salt(ions, parts, api); } catch { name = undefined; } // else an additive name
    if (name) return name;
  }
  if (metals.length > 1) throw new Error("several metal atoms");
  return additive(s, metals[0], api);
}
// Whether atom x has more bonds than its usual valence: a dative bond. Other elements are left to the namer.
function dative(s: Shape, x: number): boolean {
  const v = VALENCE[s.g.atoms[x].el];
  return !!v && !v.includes(s.valence(x));
}
// An oxoacid of a metal with a name in IR-8 Table (chromic acid): metal atoms, O atoms bonded only to metals (=O and
// bridges) or to one metal and H.
function oxoacid(s: Shape, metals: number[]): string | undefined {
  const { g, adj } = s, el = g.atoms[metals[0]].el;
  if (metals.some((m) => g.atoms[m].el !== el || g.atoms[m].h) || g.atoms.some((a, i) => !metals.includes(i) && a.el !== "O")) return undefined;
  const os = g.atoms.flatMap((a, i) => (a.el === "O" ? [i] : []));
  if (!os.every((o) => adj[o].every((j) => metals.includes(j)) && adj[o].length + g.atoms[o].h <= 2 && (g.atoms[o].h === 0 || adj[o].length === 1))) return undefined;
  return ACIDS[`${el}${metals.length}:${os.length}:${os.reduce((t, o) => t + g.atoms[o].h, 0)}`];
}
// Additive name (IR-9.2, P-69.1): the ligands in alphabetical order with multiplying prefixes, then the metal:
// butyllithium, bromo(methyl)magnesium, pentacarbonyliron, dichlorobis(cyclopenta-2,4-dien-1-yl)titanium.
function additive(s: Shape, m: number, api: MetalApi): string {
  const { g, adj } = s, ligands: Name[] = [];
  for (let k = 0; k < g.atoms[m].h; k++) ligands.push({ text: "hydrido", compound: false });
  for (const x of adj[m]) {
    const atoms = s.reach(x, new Set([m])), a = g.atoms[x], o = s.ord(m, x);
    if (atoms.some((j) => j !== x && adj[m].includes(j))) throw new Error("chelate ring");
    if (o === 2 && a.el === "O" && adj[x].length === 1) { ligands.push({ text: "oxo", compound: false }); continue; }
    const y = adj[x].find((j) => j !== m);
    if (o === 2 && a.el === "C" && !a.h && adj[x].length === 2 && g.atoms[y!].el === "O" && s.ord(x, y!) === 2 && adj[y!].length === 1) { ligands.push({ text: "carbonyl", compound: false }); continue; }
    if (o !== 1) throw new Error("metal multiple bond");
    if (HALO[a.el]) { if (adj[x].length !== 1) throw new Error("bridging halogen"); ligands.push({ text: HALO[a.el], compound: false }); continue; }
    if (dative(s, x)) throw new Error("dative bond");
    const p = s.build(atoms, [{ el: "C", h: 3, to: x }]);
    ligands.push(api.prefix(p.g, p.at.get(x)!, p.extra[0]));
  }
  if (!ligands.length) throw new Error("metal");
  const counted = new Map<string, { name: Name; n: number }>();
  for (const l of ligands) counted.set(l.text, { name: l, n: (counted.get(l.text)?.n ?? 0) + 1 });
  const sorted = [...counted.values()].sort((a, b) => api.alphaKey(a.name.text).localeCompare(api.alphaKey(b.name.text)));
  // After the first ligand, each goes in brackets unless its multiplying prefix brings them: bromo(methyl)magnesium,
  // chloro(trimethyl)titanium, dichlorobis(cyclopenta-2,4-dien-1-yl)titanium.
  const parts = sorted.map(({ name, n }, k) => {
    const t = n > 1 ? (name.compound ? MULT_COMPLEX[n] + api.enclose(name) : MULT[n] + name.text) : api.enclose(name);
    return k === 0 || /^[([{]|^(bis|tris|tetrakis|pentakis|hexakis|heptakis|octakis)[([{]/.test(t) ? t : api.enclose({ text: t, compound: true });
  });
  return parts.join("") + ELEMENTS.get(g.atoms[m].el)!;
}
