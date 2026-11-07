// Octet's IUPAC namer, part 3: heavier main-group elements and their ions (IUPAC 2013, P-6, P-7; IUPAC 2005, IR-6,
// IR-8). Clean room, from the published rules. namer.ts calls these at a few fixed points. Every name is still read
// back by OPSIN before the app shows it.
import type { Graph } from "./naming.ts";
import { assemblePrefixes, alphaKey, type Name, type Namer } from "./namer.ts";

// ——— Azoxy compounds (P-68.3.1.3.3) ———
// R-N(+)(O-)=N-R': the N⁺, the other N and the O⁻ of the group i is in, each N with one carbon (or H).
export function azoxy(n: Namer, i: number): { p: number; m: number; o: number } | undefined {
  const at = (p: number) => {
    if (n.el[p] !== "N" || n.q[p] !== 1 || n.inRing[p] || n.adj[p].length + n.h[p] !== 3) return undefined;
    const o = n.adj[p].find((j) => n.el[j] === "O" && n.q[j] === -1 && n.adj[j].length === 1 && !n.h[j] && n.ord(p, j) === 1);
    const m = n.adj[p].find((j) => n.el[j] === "N" && n.ord(p, j) === 2 && !n.q[j] && !n.inRing[j] && n.adj[j].length + n.h[j] === 2);
    const carbon = (x: number, j: number) => n.el[j] === "C" && n.ord(x, j) === 1 && n.carbonylO[j] < 0 && !n.isNitrileC(j) && !n.q[j];
    if (o === undefined || m === undefined || !n.adj[p].every((j) => j === o || j === m || carbon(p, j)) || !n.adj[m].every((j) => j === p || carbon(m, j))) return undefined;
    return { p, m, o };
  };
  if (n.el[i] === "O") return n.adj[i].length === 1 ? at(n.adj[i][0]) : undefined;
  return n.el[i] !== "N" ? undefined : at(i) ?? (n.q[i] ? undefined : n.adj[i].map(at).find(Boolean));
}
const ez = (n: Namer, z: { p: number; m: number }) => { const e = n.cipBond.get(n.key(z.p, z.m)); return e === "E" || e === "Z" ? `(${e})-` : ""; };
// An azoxy group as the parent: diazene with its N-oxide, 1,2-diphenyldiazene 1-oxide. Lowest locants to the
// substituents, then to the one cited first, then to the oxide.
export function azoxyName(n: Namer): string {
  const zs = [...n.het].filter(([a, r]) => r === "azoxy" && n.q[a] === 1).map(([a]) => azoxy(n, a)!);
  if (zs.length !== 1) throw new Error("azoxy");
  const z = zs[0], subs = (x: number) => n.adj[x].filter((j) => j !== z.p && j !== z.m && j !== z.o).map((j) => n.substituent(j, x));
  const options = [[z.p, z.m], [z.m, z.p]].map(([a, b]) => ({ list: [...subs(a).map((name) => ({ loc: "1", name })), ...subs(b).map((name) => ({ loc: "2", name }))], ox: a === z.p ? 1 : 2 }));
  const key = (o: (typeof options)[number]) => [...o.list.map((x) => x.loc).sort(), "|", ...[...o.list].sort((x, y) => alphaKey(x.name.text).localeCompare(alphaKey(y.name.text))).map((x) => x.loc), "|", o.ox].join("");
  const best = options.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))[0];
  return `${ez(n, z)}${assemblePrefixes(best.list, false)}diazene ${best.ox}-oxide`;
}
// An azoxy group as a prefix from its N x: (2-methyl-2-oxidodiazen-2-ium-1-yl), (2-methyl-1-oxidodiazen-1-ium-1-yl).
export function azoxyPrefix(n: Namer, x: number): Name {
  const z = azoxy(n, x)!, y = x === z.p ? z.m : z.p;
  const list = [...n.adj[y].filter((j) => j !== x && j !== z.o).map((j) => ({ loc: "2", name: n.substituent(j, y) })), { loc: x === z.p ? "1" : "2", name: { text: "oxido", compound: false } }];
  return { text: `${ez(n, z)}${assemblePrefixes(list, false)}diazen-${x === z.p ? 1 : 2}-ium-1-yl`, compound: true };
}

// ——— Small inorganic molecules and ions (IR-5, IR-6, IR-8; P-67.1) ———
// The namer's one table of them, by structure, written as SMILES without rings: every atom outside B, C, N, O, P, S
// and the halogens in brackets with its hydrogens. The names are the ones IUPAC gives where OPSIN reads them (azinic
// acid, orthotelluric acid, seleninyl dichloride), else the names chemists use and OPSIN reads (hypodiselenic acid,
// perxenate). Lone atoms, parent hydrides and anions by formula are namer.ts's speciesName().
const SPECIES: [string, string][] = [
  // Elements, ozone, oxides and oxoacids of N and the halogens, onium and hydride ions, and small carbon species.
  ["[H][H]", "dihydrogen"], ["N#N", "dinitrogen"], ["O=O", "dioxygen"], ["FF", "difluorine"],
  ["ClCl", "dichlorine"], ["BrBr", "dibromine"], ["II", "diiodine"], ["O=[O+][O-]", "ozone"],
  ["OO", "hydrogen peroxide"], ["N#[N+][O-]", "nitrous oxide"], ["[N-]=[N+]=O", "nitrous oxide"], ["N=[N+]=[N-]", "hydrogen azide"],
  ["O=C=O", "carbon dioxide"], ["S=C=S", "carbon disulfide"], ["O=S=O", "sulfur dioxide"], ["O=S(=O)=O", "sulfur trioxide"],
  ["O[N+](=O)[O-]", "nitric acid"], ["ON(=O)=O", "nitric acid"], ["ON=O", "nitrous acid"], ["O=[N+]=O", "nitronium"],
  ["N#[O+]", "nitrosonium"], ["[NH4+]", "ammonium"], ["[OH3+]", "oxidanium"], ["[PH4+]", "phosphanium"],
  ["[SH3+]", "sulfanium"], ["[NH2+]", "aminylium"], ["[OH+]", "hydroxylium"], ["[NH2-]", "azanide"],
  ["[H-]", "hydride"], ["F[H-]F", "bifluoride"], ["OF", "hypofluorous acid"], ["OI(=O)(=O)=O", "periodic acid"],
  ["OI(O)(O)(O)(O)=O", "orthoperiodic acid"], ["OCl", "hypochlorous acid"], ["OCl=O", "chlorous acid"], ["OCl(=O)=O", "chloric acid"],
  ["OCl(=O)(=O)=O", "perchloric acid"], ["OBr", "hypobromous acid"], ["OBr=O", "bromous acid"], ["OBr(=O)=O", "bromic acid"],
  ["OBr(=O)(=O)=O", "perbromic acid"], ["OI", "hypoiodous acid"], ["OI=O", "iodous acid"], ["OI(=O)=O", "iodic acid"],
  ["O[PH](=O)O", "phosphonic acid"], ["O[PH2]=O", "phosphinic acid"], ["ClP(Cl)(Cl)(Cl)Cl", "phosphorus pentachloride"], ["FS(F)(F)(F)(F)F", "sulfur hexafluoride"],
  ["ClN=O", "nitrosyl chloride"], ["ClC(Cl)=S", "carbonothioyl dichloride"], ["O=C=S", "carbonyl sulfide"], ["[C-]#[O+]", "carbon monoxide"],
  ["NC(=O)[O-]", "carbamate"], ["[O--]", "oxidanediide"], ["[S--]", "sulfanediide"], ["[Se--]", "selanediide"],
  ["[Te--]", "tellanediide"], ["[N---]", "azanetriide"], ["[O-][O-]", "dioxidanediide"],
  // N, O, S, P and halogen molecules of more than one centre: polysulfanes, haloamines, S oxoacids.
  ["SS", "disulfane"], ["OF=O", "fluorous acid"], ["OF(=O)=O", "fluoric acid"], ["OF(=O)(=O)=O", "perfluoric acid"],
  ["NN=O", "nitrous amide"], ["NSO", "sulfenamic acid"], ["OP(=O)=O", "phosphenic acid"], ["NS(=O)O", "amidosulfurous acid"], ["OP(=O)(O)P(=O)(O)O", "hypodiphosphoric acid"], ["N=O", "azanone"],
  ["NF", "fluoramine"], ["NCl", "chloramine"], ["NBr", "bromamine"], ["FNF", "difluoramine"], ["ClNCl", "dichloramine"], ["BrNBr", "dibromamine"],
  ["FN(F)F", "nitrogen trifluoride"], ["ClN(Cl)Cl", "nitrogen trichloride"], ["OSO", "sulfoxylic acid"], ["OOS(=O)(=O)O", "peroxomonosulfuric acid"],
  ["OS(=O)(=O)S(=O)(=O)O", "dithionic acid"], ["OS(=O)(=O)SS(=O)(=O)O", "trithionic acid"], ["OS(=O)(=O)SSS(=O)(=O)O", "tetrathionic acid"], ["OS(=O)(=O)SSSS(=O)(=O)O", "pentathionic acid"],
  ["OS(=O)(=O)OS(=O)(=O)O", "disulfuric acid"], ["OS(=O)(=O)OS(=O)(=O)OS(=O)(=O)O", "trisulfuric acid"], ["FP(F)(F)(F)F", "phosphorus pentafluoride"],
  // Se and Te oxoacids with Se-O-Se, Se-Se, and six OH; Te oxoanions.
  ["O[Se](=O)(=O)O[Se](=O)(=O)O", "diselenic acid"], ["O[Se](=O)(=O)O[Se](=O)(=O)O[Se](=O)(=O)O", "triselenic acid"], ["O[Se](=O)O[Se](=O)O", "diselenous acid"],
  ["O[Te](=O)(=O)O[Te](=O)(=O)O", "ditelluric acid"], ["O[Se](=O)(=O)[Se](=O)(=O)O", "hypodiselenic acid"], ["O[Te](=O)(=O)[Te](=O)(=O)O", "hypoditelluric acid"],
  ["O[Te](O)(O)(O)(O)O", "orthotelluric acid"], ["[O-][Te](=O)(=O)[O-]", "tellurate"], ["[O-][Te](=O)[O-]", "tellurite"], ["[Se]=[Se]", "diselene"],
  // As, Sb and P oxoacids (P-67.1.1.1, IR-8 Table).
  ["O[As](=O)=O", "arsenenic acid"], ["O[As](=O)(O)[As](=O)(O)O", "hypodiarsoric acid"], ["O[Sb](=O)(O)[Sb](=O)(O)O", "hypodistiboric acid"],
  ["O[PH](=O)O[PH](=O)O", "diphosphonic acid"], ["O[PH](=O)OP(=O)(O)O[PH](=O)O", "triphosphonic acid"], ["O[PH](=O)[PH](=O)O", "hypodiphosphonic acid"],
  ["O[PH](=O)OP(=O)(O)O", "isohypophosphoric acid"], ["[O-][PH](=O)OP(=O)([O-])[O-]", "isohypophosphate"],
  // Nitrogen oxoacids by the λ-convention drawn as ions (P-67.1.1.1: azinic, azonic, azoric acid), amine oxides.
  ["[NH2+](O)[O-]", "azinic acid"], ["[NH+](O)(O)[O-]", "azonic acid"], ["[N+](O)(O)(O)[O-]", "azoric acid"], ["[N+]([O-])([O-])([O-])[O-]", "orthonitrate"],
  ["[NH3+][O-]", "ammonia oxide"], ["[NH+]([O-])=O", "nitryl hydride"], ["N[N+](=O)[O-]", "nitramide"],
  // Halogen oxoanions, silicate, xenon, hydride anions and λ⁵ hydrides.
  ["[O-]F=O", "fluorite"], ["[O-]F(=O)=O", "fluorate"], ["[O-]F(=O)(=O)=O", "perfluorate"], ["[O-][Si]([O-])([O-])[O-]", "orthosilicate"],
  ["O[Xe](=O)(=O)(O)(O)O", "perxenic acid"], ["[O-][Xe](=O)(=O)([O-])([O-])[O-]", "perxenate"],
  ["[PH2-]", "phosphanide"], ["[AsH2-]", "arsanide"], ["[SbH2-]", "stibanide"], ["[SiH3-]", "silanide"], ["[GeH3-]", "germanide"], ["[SnH3-]", "stannanide"],
  ["[GaH4-]", "tetrahydrogallate"], ["[AsH5]", "λ⁵-arsane"], ["[SbH5]", "λ⁵-stibane"], ["[BH]=[BH]", "diborene"], ["[B]#[B]", "diboryne"],
  // Chalcogen imides by the λ-convention (P-14.1.3): sulfilimine and sulfoximine and their Se and Te analogues.
  ["[SH2]=N", "λ⁴-sulfanimine"], ["[SeH2]=N", "λ⁴-selanimine"], ["[TeH2]=N", "λ⁴-tellanimine"],
  ["[SH2](=O)=N", "imino-λ⁶-sulfanone"], ["[SeH2](=O)=N", "imino-λ⁶-selanone"], ["[TeH2](=O)=N", "imino-λ⁶-tellanone"],
  // Carbon: peroxocarbonates, the cyanide pseudohalides of S and N.
  ["[O-]OC(=O)[O-]", "peroxocarbonate"], ["[O-]C(=O)OOC(=O)[O-]", "peroxodicarbonate"], ["OSC#N", "hydroxysulfanecarbonitrile"], ["[O-]SC#N", "(cyanosulfanyl)oxidanide"],
  ["N#CN=[N+]=[N-]", "carbononitridic azide"], ["[NH+]#[C-]", "hydrogen isocyanide"], ["O[N+]#[C-]", "isocyanooxidane"], ["N[O-]", "aminooxidanide"],
];
type Shape = { el: string[]; h: number[]; q: number[]; bonds: [number, number, number][] };
// A structure's signature: each atom's element, hydrogens, charge and bonds, sorted.
function signature({ el, h, q, bonds }: Shape): string {
  return el.map((e, i) => `${e}${h[i]}${q[i] || ""}[${bonds.filter((b) => b[0] === i || b[1] === i).map((b) => `${b[2]}${el[b[0] === i ? b[1] : b[0]]}`).sort().join(",")}]`).sort().join(" ");
}
// A SMILES without rings as a shape: bracket atoms as written, the others with their usual hydrogens.
function parse(s: string): Shape {
  const shape: Shape = { el: [], h: [], q: [], bonds: [] }, stack: number[] = [], usual: Record<string, number> = { B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1 };
  let prev = -1, order = 1;
  for (const t of s.match(/\[[^\]]+\]|Cl|Br|[BCNOPSFI]|[=#()]/g) ?? []) {
    if (t === "=" || t === "#") { order = t === "=" ? 2 : 3; continue; }
    if (t === "(") { stack.push(prev); continue; }
    if (t === ")") { prev = stack.pop()!; continue; }
    const m = /^\[([A-Z][a-z]?)(?:H(\d?))?([+-]*)\]$/.exec(t);
    shape.el.push(m ? m[1] : t);
    shape.q.push(m ? (m[3].includes("+") ? 1 : -1) * m[3].length : 0);
    shape.h.push(m ? (m[2] !== undefined ? Number(m[2] || 1) : 0) : -1);
    if (prev >= 0) shape.bonds.push([prev, shape.el.length - 1, order]);
    prev = shape.el.length - 1; order = 1;
  }
  shape.h = shape.h.map((h, i) => (h >= 0 ? h : Math.max(0, usual[shape.el[i]] - shape.bonds.reduce((t, b) => t + (b[0] === i || b[1] === i ? b[2] : 0), 0))));
  return shape;
}
let species: Map<string, string> | undefined;
const shapeOf = (g: Graph): Shape => ({ el: g.atoms.map((a) => a.el), h: g.atoms.map((a) => a.h), q: g.atoms.map((a) => a.charge), bonds: g.bonds.map((b) => [b.a, b.b, b.order]) });
// The name of a small inorganic molecule or ion: from the table, or one of these shapes:
// tetrahalido anions of B, Al and Ga (tetrabromoaluminate), oxyhalides of Se and Te (seleninyl dichloride), and
// chains of P, As or Sb with λ⁵ atoms (1λ⁵,2λ⁵-diphosphene). Undefined for the rest.
export function inorganicSpecies(g: Graph): string | undefined {
  if (g.atoms.length > 16 || g.bonds.length !== g.atoms.length - 1) return undefined;
  species ??= new Map(SPECIES.map(([s, name]) => [signature(parse(s)), name]));
  const known = species.get(signature(shapeOf(g)));
  if (known) return known;
  const nbrs = (i: number) => g.bonds.flatMap((b) => (b.a === i ? [b.b] : b.b === i ? [b.a] : []));
  const halo = (i: number) => /^(F|Cl|Br|I)$/.test(g.atoms[i].el) && !g.atoms[i].charge && !g.atoms[i].h && nbrs(i).length === 1;
  const oxo = (c: number, i: number) => g.atoms[i].el === "O" && !g.atoms[i].charge && !g.atoms[i].h && g.bonds.some((b) => ((b.a === c && b.b === i) || (b.b === c && b.a === i)) && b.order === 2);
  const HALO: Record<string, string> = { F: "fluor", Cl: "chlor", Br: "brom", I: "iod" }, HALIDE: Record<string, string> = { F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" };
  for (let c = 0; c < g.atoms.length; c++) {
    const a = g.atoms[c], ns = nbrs(c);
    if (ns.length !== g.atoms.length - 1) continue;
    const xs = ns.filter(halo), os = ns.filter((i) => oxo(c, i)), x = g.atoms[xs[0]]?.el;
    // [BX4]-, [AlX4]-, [GaX4]- (IR-8, as OPSIN reads them): tetrafluoroborate, tetrabromoaluminate.
    if (/^(B|Al|Ga)$/.test(a.el) && a.charge === -1 && !a.h && xs.length === 4 && xs.every((i) => g.atoms[i].el === x))
      return `tetra${HALO[x]}o${{ B: "bor", Al: "alumin", Ga: "gall" }[a.el]}ate`;
    // SeOX2, SeO2X2, TeOX2, TeO2X2 (IR-8.3): seleninyl dichloride, selenonyl dichloride.
    if ((a.el === "Se" || a.el === "Te") && !a.charge && !a.h && xs.length === 2 && xs.length + os.length === ns.length && (os.length === 1 || os.length === 2) && g.atoms[xs[1]].el === x)
      return `${a.el === "Se" ? "selen" : "tellur"}${os.length === 1 ? "inyl" : "onyl"} di${HALIDE[x]}`;
  }
  return lambdaChain(g, nbrs);
}
// A chain of P, As or Sb atoms with hydrogens only, each with three bonds or five (λ⁵), with any single, double and
// triple bonds (P-21.2.1, P-14.1.3): triphosphane, diarsene, 1λ⁵,2λ⁵-diphosphene, 1λ⁵,2λ⁵,3λ⁵,4λ⁵-tetraphosph-1-yne.
function lambdaChain(g: Graph, nbrs: (i: number) => number[]): string | undefined {
  const el = g.atoms[0].el, n = g.atoms.length, stem = ({ P: "phosph", As: "ars", Sb: "stib" } as Record<string, string>)[el];
  if (!stem || n < 2 || n > 9 || g.atoms.some((a) => a.el !== el || a.charge)) return undefined;
  const ends = g.atoms.flatMap((_, i) => (nbrs(i).length === 1 ? [i] : []));
  if (ends.length !== 2 || g.atoms.some((_, i) => nbrs(i).length > 2)) return undefined;
  const order = (a: number, b: number) => g.bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.order ?? 0;
  const path = [ends[0]];
  while (path.length < n) path.push(nbrs(path[path.length - 1]).find((j) => !path.includes(j))!);
  const valence = (i: number) => nbrs(i).reduce((t, j) => t + order(i, j), 0) + g.atoms[i].h;
  if (path.some((i) => valence(i) !== 3 && valence(i) !== 5)) return undefined;
  // Lowest locants to the multiple bonds, then to the λ⁵ atoms.
  const multiple = (p: number[], o: number) => p.slice(1).flatMap((a, k) => (order(p[k], a) === o || (!o && order(p[k], a) > 1) ? [k + 1] : []));
  const key = (p: number[]) => [...multiple(p, 0), 0, ...p.flatMap((a, k) => (valence(a) === 5 ? [k + 1] : []))];
  const back = [...path].reverse(), kp = key(path), kb = key(back), d = kp.findIndex((v, k) => v !== kb[k]);
  const p = d >= 0 && kb[d] < kp[d] ? back : path;
  const lam = p.flatMap((a, k) => (valence(a) === 5 ? [`${k + 1}λ⁵`] : [])).join(",");
  const enes = multiple(p, 2), ynes = multiple(p, 3), cite = n > 2;
  const mult = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona"];
  let t = mult[n] + stem + (enes.length > 1 || ynes.length > 1 ? "a" : "");
  if (!enes.length && !ynes.length) t += "ane";
  if (enes.length) t += (cite ? `-${enes.join(",")}-` : "") + (enes.length > 1 ? mult[enes.length] : "") + (ynes.length ? "en" : "ene");
  if (ynes.length) t += (cite ? `-${ynes.join(",")}-` : "") + (ynes.length > 1 ? mult[ynes.length] : "") + "yne";
  return lam ? `${lam}-${t}` : t;
}

// ——— Drawings with five bonds to N ———
// A neutral N with five bonds and a terminal =O, as nitro groups and N-oxides are often drawn (R-N(=O)=O,
// pyridine as O=N1=CC=CC=C1), is the same compound as its charge-separated form (N⁺-O⁻), which IUPAC names (P-62.5,
// P-61.5) and the standard InChI keeps. The structure in that form; the same object when there is nothing to change.
export function chargeSeparated(g: Graph): Graph {
  let out: Graph | undefined;
  for (let i = 0; i < g.atoms.length; i++) {
    const a = g.atoms[i], bonds = g.bonds.filter((b) => b.a === i || b.b === i);
    if (a.el !== "N" || a.charge || bonds.reduce((t, b) => t + b.order, 0) + a.h !== 5) continue;
    const k = bonds.findIndex((b) => { const o = g.atoms[b.a === i ? b.b : b.a]; return b.order === 2 && o.el === "O" && !o.charge && !o.h && g.bonds.filter((x) => x.a === (b.a === i ? b.b : b.a) || x.b === (b.a === i ? b.b : b.a)).length === 1; });
    if (k < 0) continue;
    out ??= { atoms: g.atoms.map((x) => ({ ...x })), bonds: g.bonds.map((x) => ({ ...x })) };
    const b = out.bonds[g.bonds.indexOf(bonds[k])], o = b.a === i ? b.b : b.a;
    b.order = 1;
    out.atoms[i].charge = 1;
    out.atoms[o].charge = -1;
  }
  return out ?? g;
}

// ——— Isotopically substituted compounds (P-82) ———
// The nuclides are cited in parentheses before the part of the name they are in, with their locants, in
// alphabetical order of symbol, each with its count: (²H₃)methanol, trichloro(²H₁)methane, (1,1-²H₂)ethanol,
// (O-²H₁)ethanol, [(²H₃)methanesulfinyl](²H₃)methane. Superscript mass numbers and subscript counts as IUPAC prints
// them (OPSIN reads them); the count is always given, as OPSIN reads "(²H)" as indicated hydrogen.
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", SUB = "₀₁₂₃₄₅₆₇₈₉";
const sup = (k: number) => String(k).replace(/\d/g, (d) => SUP[Number(d)]);
const sub = (k: number) => String(k).replace(/\d/g, (d) => SUB[Number(d)]);
const isotopic = (n: Namer, a: number) => !!n.iso[a] || n.hx[a].length > 0;
// A nuclide and its count: ²H₃, ¹³C (a count of one left out but for hydrogen).
const nuclide = (el: string, mass: number, k: number) => `${sup(mass)}${el}${el === "H" || k > 1 ? sub(k) : ""}`;
// A nuclide in a name: a mass number, then the element.
export const NUCLIDE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+[A-Z]/;
// The descriptor for a part of a name: its skeleton atoms (locants from loc) and the heteroatoms of its suffix (locants
// O, N, S: (O-²H₁)ethanol). Locants are left out when the nuclides fill every position of their kind, or there is only
// one: (²H₆)benzene, (²H₄)methanol, chloro(²H₁)methane; and for hydrogen when they fill every position on the
// skeleton, as OPSIN reads it: (²H₃)methanol is CD3-OH. "" when the part has no isotopes.
export function isotopeText(n: Namer, skeleton: number[], suffix: number[], loc: (a: number) => string): string {
  const part = [...skeleton, ...suffix];
  if (!part.some((a) => isotopic(n, a))) return "";
  const letters = suffix.filter((a) => isotopic(n, a)).map((a) => n.el[a]);
  if (new Set(letters).size !== letters.length || letters.some((e) => !/^[NOS]$/.test(e))) throw new Error("isotope");
  const groups = new Map<string, { el: string; mass: number; locs: string[]; onSkeleton: boolean }>();
  const add = (el: string, mass: number, a: number) => {
    const key = `${el} ${String(mass).padStart(3, "0")}`, g = groups.get(key) ?? { el, mass, locs: [], onSkeleton: true };
    g.locs.push(skeleton.includes(a) ? loc(a) : n.el[a]);
    g.onSkeleton &&= skeleton.includes(a);
    groups.set(key, g);
  };
  for (const a of part) {
    if (n.iso[a]) add(n.el[a], n.iso[a]!, a);
    for (const m of n.hx[a]) add("H", m, a);
  }
  const hSkeleton = skeleton.reduce((t, a) => t + n.h[a], 0), hAll = part.reduce((t, a) => t + n.h[a], 0), hNuclides = [...groups.values()].filter((g) => g.el === "H").length;
  const omit = [...groups.values()].every((g) => {
    if (g.el !== "H") { const all = part.filter((a) => n.el[a] === g.el).length; return all === 1 || g.locs.length === all; }
    if (hNuclides > 1) return false;
    if (g.locs.length === hAll && hSkeleton > 0) return true;
    return g.onSkeleton && (g.locs.length === hSkeleton || skeleton.filter((a) => n.h[a] > 0).length === 1);
  });
  const order = (x: string, y: string) => (/^\d/.test(x) !== /^\d/.test(y) ? (/^\d/.test(x) ? -1 : 1) : parseInt(x) - parseInt(y) || (x < y ? -1 : x > y ? 1 : 0));
  return `(${[...groups.keys()].sort().map((k) => groups.get(k)!).map((g) => `${omit ? "" : `${g.locs.sort(order).join(",")}-`}${nuclide(g.el, g.mass, g.locs.length)}`).join(",")})`;
}
// A terminal heteroatom with isotopes cited as a prefix: (²H₁)hydroxy, (²H₂)amino, (¹⁸O)hydroxy. Undefined for others.
export function isotopePrefix(n: Namer, x: number, from: number): { text: string; compound: boolean } | undefined {
  if (!n.isotopic || !isotopic(n, x) || n.el[x] === "C" || n.adj[x].length !== 1 || n.inRing[x]) return undefined;
  const text = isotopeText(n, [x], [], () => n.el[x]), keep = [n.iso[x], n.hx[x]];
  n.iso[x] = undefined; n.hx[x] = [];
  try { return { text: text + n.substituent(x, from).text, compound: true }; } finally { [n.iso[x], n.hx[x]] = keep as [number | undefined, number[]]; }
}
// A simple species with isotopes (water, ammonia, tetrahydroborate) named by its name without them: (²H₂)water,
// (²H₄)tetrahydroborate, (¹⁵N)ammonia. Only where no locants are needed: the isotopic hydrogens on its one H-bearing
// atom or all of them, a heavy nuclide on its element's one atom or all. Undefined for the rest.
export function isotopeSpecies(g: Graph, name: (plain: Graph) => string | undefined): string | undefined {
  const base = name({ atoms: g.atoms.map(({ iso: _i, hx: _h, ...a }) => a), bonds: g.bonds });
  if (!base) return undefined;
  const counts = new Map<string, { el: string; mass: number; k: number }>();
  for (const a of g.atoms) for (const [el, mass] of [...(a.iso ? [[a.el, a.iso] as const] : []), ...(a.hx ?? []).map((m) => ["H", m] as const)]) {
    const key = `${el} ${String(mass).padStart(3, "0")}`, c = counts.get(key) ?? { el, mass, k: 0 };
    c.k++;
    counts.set(key, c);
  }
  const hAtoms = g.atoms.filter((a) => a.h > 0).length, hAll = g.atoms.reduce((t, a) => t + a.h, 0), hKinds = [...counts.values()].filter((c) => c.el === "H").length;
  const plain = [...counts.values()].every((c) => (c.el === "H" ? hKinds === 1 && (hAtoms === 1 || c.k === hAll) : [1, c.k].includes(g.atoms.filter((a) => a.el === c.el).length)));
  return plain ? `(${[...counts.keys()].sort().map((k) => counts.get(k)!).map((c) => `${nuclide(c.el, c.mass, c.k)}`).join(",")})${base}` : undefined;
}
// The number of nuclides a name cites, each counted as often as its multiplying prefix says: bis[(²H₃)methyl] cites six.
export function citedNuclides(text: string): number {
  const times = [1];
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ")" || ch === "]" || ch === "}") { times.pop(); continue; }
    if (ch !== "(" && ch !== "[" && ch !== "{") continue;
    const m = text.slice(0, i).match(/(bis|tris|tetrakis|pentakis|hexakis|heptakis|octakis)$/), here = times[times.length - 1];
    const d = ch === "(" ? text.slice(i).match(/^\(([^()]*)\)/) : null;
    if (d && NUCLIDE.test(d[1])) for (const x of d[1].matchAll(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+[A-Z][a-z]?([₀-₉]*)/g)) k += here * (x[1] ? Number([...x[1]].map((c) => SUB.indexOf(c)).join("")) : 1);
    times.push(here * (m ? ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis", "heptakis", "octakis"].indexOf(m[1]) : 1));
  }
  return k;
}

// ——— Selones and tellones (P-64.6) ———
// A terminal =Se or =Te on a ring carbon, or on a carbon with only carbon neighbours: cited as selanylidene or
// tellanylidene under a ketone or a senior group (2-selanylidene-1,2,3,7-tetrahydro-6H-purin-6-one). As the principal
// group (propane-2-selone), and on a carbon with heteroatoms (selenoic acids, selenoamides), not yet.
export function chalcogenOne(n: Namer, x: number): boolean {
  if ((n.el[x] !== "Se" && n.el[x] !== "Te") || n.adj[x].length !== 1 || n.h[x] || n.q[x]) return false;
  const c = n.adj[x][0];
  return n.el[c] === "C" && n.ord(x, c) === 2 && (n.inRing[c] || n.adj[c].every((j) => j === x || n.el[j] === "C"));
}
export function checkChalcogenOnes(n: Namer, kind: string | undefined, seniority: readonly string[]) {
  if ((!kind || seniority.indexOf(kind) > seniority.indexOf("ketone")) && n.el.some((_, i) => chalcogenOne(n, i))) throw new Error("selone");
}

// The stem of a chalcogen's acid names: sulfonate, selenonate, tellurinate.
export const chalcogenStem = (el: string) => ({ S: "sulf", Se: "selen", Te: "tellur" } as Record<string, string>)[el] ?? "sulf";

// The suffix of a selenonate, seleninate, telluronate or tellurinate anion (P-65.3.1, P-72.2.2.2), which namer.ts
// perceives as sulfonate or sulfinate groups on Se or Te: 2-aminoethane-1-selenonate. Undefined for S.
export function chalcogenIonSuffix(n: Namer, kind: string | undefined, sites: { group: number }[]): string | undefined {
  if ((kind !== "sulfonateion" && kind !== "sulfinate") || !sites.length) return undefined;
  const els = new Set(sites.map((s) => n.el[s.group]));
  if (els.has("S")) { if (els.size > 1) throw new Error("mixed chalcogen acids"); return undefined; }
  if (els.size > 1) throw new Error("mixed chalcogen acids");
  return `${chalcogenStem([...els][0])}${kind === "sulfinate" ? "inate" : "onate"}`;
}
