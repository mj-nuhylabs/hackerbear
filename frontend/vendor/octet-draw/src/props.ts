// Chemical property calculators on the namer's graph (Kekulé bonds, implicit hydrogen counts): tPSA, Joback estimates,
// rotatable bonds and ESOL logS, and typical pKa values of ionisable groups. Rings and aromaticity come from rings.ts.
import type { Graph } from "./naming.ts";
import { aromaticAtoms, rings } from "./rings.ts";

export { aromaticAtoms } from "./rings.ts";

export type Properties = {
  tpsa: number; // Å², Ertl 2000 (N and O contributions, as ChemDraw and RDKit's default)
  joback?: { tb: number; tm: number; tc: number; pc: number; vc: number; hf: number; gf: number }; // K, K, K, bar, cm³/mol, kJ/mol, kJ/mol; undefined when a group is not covered
  pka: { atom: number; kind: string; pka: number; sd: number }[]; // ionisable groups with typical pKa (Dimorphite-DL site table)
  rotatable: number; // rotatable bonds (for ESOL)
  aromaticProportion: number; // aromatic heavy atoms / heavy atoms (for ESOL)
};

type Bond = { j: number; k: number; order: number };
// The graph with drawn H atoms folded into their neighbours' counts, plus what every calculator needs: neighbours,
// rings (from rings.ts), ring and aromatic flags. `of` maps an atom back to the caller's graph.
type Ctx = {
  el: string[]; q: number[]; h: number[]; of: number[]; nb: Bond[][];
  rings: number[][]; ringAtom: boolean[]; ringBond: boolean[]; arom: boolean[]; aromBond: boolean[];
};

function context(g: Graph): Ctx {
  const keep = g.atoms.map((a, i) => a.el !== "H" || a.charge !== 0 || g.bonds.filter((b) => b.a === i || b.b === i).length !== 1);
  const idx: number[] = [], of: number[] = [];
  g.atoms.forEach((_, i) => { if (keep[i]) { idx[i] = of.length; of.push(i); } });
  const fg: Graph = { atoms: of.map((i) => ({ el: g.atoms[i].el, charge: g.atoms[i].charge, h: g.atoms[i].h })), bonds: [] };
  for (const b of g.bonds) {
    if (keep[b.a] && keep[b.b]) fg.bonds.push({ a: idx[b.a], b: idx[b.b], order: b.order });
    else if (keep[b.a] || keep[b.b]) fg.atoms[idx[keep[b.a] ? b.a : b.b]].h++;
  }
  const nb: Bond[][] = of.map(() => []);
  fg.bonds.forEach((b, k) => { nb[b.a].push({ j: b.b, k, order: b.order }); nb[b.b].push({ j: b.a, k, order: b.order }); });
  const rs = rings(fg), arom = aromaticAtoms(fg), ringAtom = of.map(() => false), ringBond = fg.bonds.map(() => false), aromBond = fg.bonds.map(() => false);
  for (const r of rs) r.forEach((a, n) => {
    const k = nb[a].find((x) => x.j === r[(n + 1) % r.length])!.k;
    ringAtom[a] = ringBond[k] = true;
    if (r.every((v) => arom[v])) aromBond[k] = true;
  });
  return { el: fg.atoms.map((a) => a.el), q: fg.atoms.map((a) => a.charge), h: fg.atoms.map((a) => a.h), of, nb, rings: rs, ringAtom, ringBond, arom, aromBond };
}

// Topological polar surface area (Ertl, Rohde & Selzer 2000, doi:10.1021/jm000942e, table 1): a contribution per
// N and O environment (heavy neighbours, H count, charge, single, double, triple and aromatic bonds, three-membered
// ring), and the paper's fallback for environments it does not list. Same table as RDKit's TPSA.
function tpsa(c: Ctx): number {
  let sum = 0;
  c.el.forEach((el, i) => {
    if (el !== "N" && el !== "O") return;
    const n = c.nb[i].length, h = c.h[i], q = c.q[i], t = [0, 0, 0, 0]; // single, double, triple, aromatic
    for (const x of c.nb[i]) t[c.aromBond[x.k] ? 3 : x.order - 1]++;
    const [s, d, tr, ar] = t, r3 = c.rings.some((r) => r.length === 3 && r.includes(i));
    const is = (nh: number, ch: number, ns: number, nd: number, nt: number, na: number) => h === nh && q === ch && s === ns && d === nd && tr === nt && ar === na;
    let v: number | undefined;
    if (el === "N") {
      if (n === 1) v = is(0, 0, 0, 0, 1, 0) ? 23.79 : is(1, 0, 0, 1, 0, 0) ? 23.85 : is(2, 0, 1, 0, 0, 0) ? 26.02 : is(2, 1, 0, 1, 0, 0) ? 25.59 : is(3, 1, 1, 0, 0, 0) ? 27.64 : undefined;
      else if (n === 2) v = is(0, 0, 1, 1, 0, 0) ? 12.36 : is(0, 0, 0, 1, 1, 0) ? 13.6 : is(1, 0, 2, 0, 0, 0) ? (r3 ? 21.94 : 12.03) : is(0, 1, 1, 0, 1, 0) ? 4.36
        : is(1, 1, 1, 1, 0, 0) ? 13.97 : is(2, 1, 2, 0, 0, 0) ? 16.61 : is(0, 0, 0, 0, 0, 2) ? 12.89 : is(1, 0, 0, 0, 0, 2) ? 15.79 : is(1, 1, 0, 0, 0, 2) ? 14.14 : undefined;
      else if (n === 3) v = is(0, 0, 3, 0, 0, 0) ? (r3 ? 3.01 : 3.24) : is(0, 0, 1, 2, 0, 0) ? 11.68 : is(0, 1, 2, 1, 0, 0) ? 3.01 : is(1, 1, 3, 0, 0, 0) ? 4.44
        : is(0, 0, 0, 0, 0, 3) ? 4.41 : is(0, 0, 1, 0, 0, 2) ? 4.93 : is(0, 0, 0, 1, 0, 2) ? 8.39 : is(0, 1, 0, 0, 0, 3) ? 4.1 : is(0, 1, 1, 0, 0, 2) ? 3.88 : undefined;
      else if (n === 4) v = is(0, 1, 4, 0, 0, 0) ? 0 : undefined;
      sum += v ?? Math.max(0, 30.5 - n * 8.2 + h * 1.5);
    } else {
      if (n === 1) v = is(0, 0, 0, 1, 0, 0) ? 17.07 : is(1, 0, 1, 0, 0, 0) ? 20.23 : is(0, -1, 1, 0, 0, 0) ? 23.06 : undefined;
      else if (n === 2) v = is(0, 0, 2, 0, 0, 0) ? (r3 ? 12.53 : 9.23) : is(0, 0, 0, 0, 0, 2) ? 13.14 : undefined;
      sum += v ?? Math.max(0, 28.5 - n * 8.6 + h * 1.5);
    }
  });
  return sum;
}

// Rotatable bonds, as RDKit's NumRotatableBonds counts them (its strict pattern, which Walters' ESOL fit used):
// non-ring single bonds between atoms with two or more heavy neighbours and no triple bond, except to CF3, CCl3, CBr3
// and tert-butyl carbons, and except the C–N and C–O bonds of amides, esters and their S and N analogues.
function rotatable(c: Ctx): number {
  const al = (i: number, ...els: string[]) => !c.arom[i] && els.includes(c.el[i]);
  const tail = (i: number) => c.nb[i].some((x) => x.order === 3) || c.nb[i].length < 2 || (al(i, "C") && (["F", "Cl", "Br"].some((h) => c.nb[i].filter((x) => c.el[x.j] === h).length >= 3)
    || c.nb[i].filter((x) => al(x.j, "C") && c.h[x.j] === 3).length >= 3));
  const acyl = (i: number, plus = false) => al(i, "C") && c.nb[i].length === 3 && c.nb[i].some((x) => x.order === 2 && !c.aromBond[x.k] && (plus ? al(x.j, "N") && c.q[x.j] === 1 : al(x.j, "N", "O", "S")));
  const out = (i: number) => c.nb[i].filter((x) => x.order === 1 && !c.ringBond[x.k]).map((x) => x.j);
  const hetero = (j: number) => c.el[j] === "N" || al(j, "O") || (al(j, "S") && c.nb[j].length !== 1);
  const amide = (i: number) => (acyl(i) && out(i).some(hetero)) || (hetero(i) && out(i).some((j) => acyl(j)))
    || (acyl(i, true) && out(i).some((j) => c.el[j] === "N" && c.nb[j].length !== 1)) || (c.el[i] === "N" && c.nb[i].length !== 1 && out(i).some((j) => acyl(j, true)));
  let n = 0;
  c.nb.forEach((bs, a) => bs.forEach(({ j: b, k, order }) => {
    if (a < b && order === 1 && !c.ringBond[k] && !tail(a) && !tail(b) && (!amide(a) || !amide(b))) n++;
  }));
  return n;
}

// ESOL aqueous solubility, log10 of mol/L (Delaney 2004, doi:10.1021/ci034243x), with Walters' coefficients refitted
// for Crippen logP (PatWalters/solubility, MIT, esol.py): logP and weight come from Indigo.
export function logS(logP: number, weight: number, p: Properties): number {
  return 0.26121066137801696 - 0.7416739523408995 * logP - 0.0066138847738667125 * weight + 0.003451545565957996 * p.rotatable - 0.42624840441316975 * p.aromaticProportion;
}

// Joback & Reid 1987 (doi:10.1080/00986448708960487) group contributions [Tc, Pc, Vc, Tb, Tm, ΔHf, ΔGf], values as
// tabulated in thermo (Caleb Bell, MIT, thermo/group_contribution/joback.py). NaN where the paper gives none.
const JOBACK: Record<string, number[]> = {
  "-CH3": [0.0141, -0.0012, 65, 23.58, -5.1, -76.45, -43.96], "-CH2-": [0.0189, 0, 56, 22.88, 11.27, -20.64, 8.42],
  ">CH-": [0.0164, 0.002, 41, 21.74, 12.64, 29.89, 58.36], ">C<": [0.0067, 0.0043, 27, 18.25, 46.43, 82.23, 116.02],
  "=CH2": [0.0113, -0.0028, 56, 18.18, -4.32, -9.63, 3.77], "=CH-": [0.0129, -0.0006, 46, 24.96, 8.73, 37.97, 48.53],
  "=C<": [0.0117, 0.0011, 38, 24.14, 11.14, 83.99, 92.36], "=C=": [0.0026, 0.0028, 36, 26.15, 17.78, 142.14, 136.7],
  "≡CH": [0.0027, -0.0008, 46, 9.2, -11.18, 79.3, 77.71], "≡C-": [0.002, 0.0016, 37, 27.38, 64.32, 115.51, 109.82],
  "ring -CH2-": [0.01, 0.0025, 48, 27.15, 7.75, -26.8, -3.68], "ring >CH-": [0.0122, 0.0004, 38, 21.78, 19.88, 8.67, 40.99],
  "ring >C<": [0.0042, 0.0061, 27, 21.32, 60.15, 79.72, 87.88], "ring =CH-": [0.0082, 0.0011, 41, 26.73, 8.13, 2.09, 11.3],
  "ring =C<": [0.0143, 0.0008, 32, 31.01, 37.02, 46.43, 54.05], "-F": [0.0111, -0.0057, 27, -0.03, -15.78, -251.92, -247.19],
  "-Cl": [0.0105, -0.0049, 58, 38.13, 13.55, -71.55, -64.31], "-Br": [0.0133, 0.0057, 71, 66.86, 43.43, -29.48, -38.06],
  "-I": [0.0068, -0.0034, 97, 93.84, 41.69, 21.06, 5.74], "-OH": [0.0741, 0.0112, 28, 92.88, 44.45, -208.04, -189.2],
  "phenol -OH": [0.024, 0.0184, -25, 76.34, 82.83, -221.65, -197.37], "-O-": [0.0168, 0.0015, 18, 22.42, 22.23, -132.22, -105],
  "ring -O-": [0.0098, 0.0048, 13, 31.22, 23.05, -138.16, -98.22], ">C=O": [0.038, 0.0031, 62, 76.75, 61.2, -133.22, -120.5],
  "ring >C=O": [0.0284, 0.0028, 55, 94.97, 75.97, -164.5, -126.27], "O=CH-": [0.0379, 0.003, 82, 72.24, 36.9, -162.03, -143.48],
  "-COOH": [0.0791, 0.0077, 89, 169.09, 155.5, -426.72, -387.87], "-COO-": [0.0481, 0.0005, 82, 81.1, 53.6, -337.92, -301.95],
  "=O": [0.0143, 0.0101, 36, -10.5, 2.08, -247.61, -250.83], "-NH2": [0.0243, 0.0109, 38, 73.23, 66.89, -22.02, 14.07],
  ">NH": [0.0295, 0.0077, 35, 50.17, 52.66, 53.47, 89.39], "ring >NH": [0.013, 0.0114, 29, 52.82, 101.51, 31.65, 75.61],
  ">N-": [0.0169, 0.0074, 9, 11.74, 48.84, 123.34, 163.16], "-N=": [0.0255, -0.0099, NaN, 74.6, NaN, 23.61, NaN],
  "ring -N=": [0.0085, 0.0076, 34, 57.55, 68.4, 55.52, 79.93], "=NH": [NaN, NaN, NaN, 83.08, 68.91, 93.7, 119.66],
  "-CN": [0.0496, -0.0101, 91, 125.66, 59.89, 88.43, 89.22], "-NO2": [0.0437, 0.0064, 91, 152.54, 127.24, -66.57, -16.83],
  "-SH": [0.0031, 0.0084, 63, 63.56, 20.09, -17.33, -22.99], "-S-": [0.0119, 0.0049, 54, 68.78, 34.4, 41.87, 33.12],
  "ring -S-": [0.0019, 0.0051, 38, 52.1, 79.93, 39.1, 27.76],
};

// Each heavy atom's Joback group, or undefined if an atom has none (or two). Aromatic ring carbons are ring =CH- and
// =C<, pyridine-type N is ring -N=, and N-substituted ring N is >N- (Joback has no ring >N-), as in thermo's SMARTS.
function jobackGroups(c: Ctx): string[] | undefined {
  const n = c.el.length, owner: boolean[] = [], out: string[] = [], x = (i: number) => c.nb[i].length + c.h[i];
  const claim = (g: string, atoms: number[]) => { if (atoms.some((a) => owner[a])) return false; atoms.forEach((a) => (owner[a] = true)); out.push(g); return true; };
  const terminalO = (i: number, order: number) => c.nb[i].filter((b) => b.order === order && c.el[b.j] === "O" && c.nb[b.j].length === 1 && c.h[b.j] === 0).map((b) => b.j);
  const carbonyl = (i: number) => c.el[i] === "C" && terminalO(i, 2).length > 0;
  // Groups of more than one atom first: nitro, nitrile, acid, ester, aldehyde and ketone.
  for (let i = 0; i < n; i++) {
    const el = c.el[i], o = terminalO(i, 2)[0], ox = c.nb[i].filter((b) => b.order === 1 && c.el[b.j] === "O" && x(b.j) === 2).map((b) => b.j);
    if (el === "N" && c.nb[i].length === 3 && o !== undefined && [...terminalO(i, 1), ...terminalO(i, 2)].length === 2 && c.nb[i].some((b) => c.el[b.j] !== "O")) {
      if (!claim("-NO2", [i, ...terminalO(i, 1), ...terminalO(i, 2)])) return undefined;
    } else if (el === "C" && x(i) === 2) {
      const t = c.nb[i].find((b) => b.order === 3 && c.el[b.j] === "N" && c.nb[b.j].length === 1 && c.h[b.j] === 0);
      if (t && !claim("-CN", [i, t.j])) return undefined;
    } else if (el === "C" && o !== undefined && x(i) === 3) {
      const oh = ox.find((j) => c.h[j] === 1);
      const ok = oh !== undefined && !c.arom[i] ? claim("-COOH", [i, o, oh])
        : c.h[i] === 0 && ox.length === 1 && c.h[ox[0]] === 0 ? claim("-COO-", [i, o, ox[0]])
        : ox.length ? false
        : c.h[i] === 1 && c.nb[i].some((b) => c.el[b.j] === "C") ? claim("O=CH-", [i, o])
        : c.h[i] === 0 && claim(c.ringAtom[i] ? "ring >C=O" : ">C=O", [i, o]);
      if (!ok) return undefined;
    }
  }
  // Then one atom each.
  for (let i = 0; i < n; i++) {
    if (owner[i]) continue;
    const el = c.el[i], h = c.h[i], multi = c.nb[i].filter((b) => b.order > 1), ring = c.ringAtom[i] ? "ring " : "";
    let g: string | undefined;
    if (c.q[i] !== 0) g = undefined;
    else if (el === "C" && x(i) === 4 && !multi.length) g = h === 3 ? "-CH3" : h < 3 ? ring + [">C<", ">CH-", "-CH2-"][h] : undefined;
    else if (el === "C" && x(i) === 3 && multi.length === 1 && multi[0].order === 2) g = h === 2 ? "=CH2" : ring + ["=C<", "=CH-"][h];
    else if (el === "C" && x(i) === 2) g = multi.length === 2 ? "=C=" : multi[0]?.order === 3 && c.el[multi[0].j] !== "N" ? (h ? "≡CH" : "≡C-") : undefined;
    else if (el === "N" && x(i) === 3) g = h === 2 ? "-NH2" : h === 1 ? ring + ">NH" : h === 0 ? ">N-" : undefined;
    else if (el === "N" && x(i) === 2) g = h === 1 ? "=NH" : ring + "-N=";
    else if (el === "O" && x(i) === 2 && !c.nb[i].some((b) => carbonyl(b.j))) g = h === 1 ? (c.nb[i].some((b) => c.arom[b.j]) ? "phenol -OH" : "-OH") : h === 0 ? ring + "-O-" : undefined;
    else if (el === "O" && x(i) === 1 && multi.length && c.el[multi[0].j] !== "C") g = "=O";
    else if (el === "S" && x(i) === 2 && !multi.length) g = h === 1 ? "-SH" : h === 0 ? ring + "-S-" : undefined;
    else if (["F", "Cl", "Br", "I"].includes(el) && x(i) === 1) g = "-" + el;
    if (!g) return undefined;
    out.push(g);
  }
  return out;
}

// Joback & Reid estimates: Tb, Tm, Tc (from the estimated Tb), Pc (with the atom count), Vc, ΔHf and ΔGf (ideal gas,
// 298 K). Undefined when an atom has no group or a group has no value for one of them.
function joback(c: Ctx): Properties["joback"] {
  const groups = jobackGroups(c);
  if (!groups?.length) return undefined;
  const s = [0, 0, 0, 0, 0, 0, 0];
  for (const g of groups) JOBACK[g].forEach((v, i) => (s[i] += v));
  if (s.some(Number.isNaN)) return undefined;
  const atoms = c.el.length + c.h.reduce((a, b) => a + b, 0), tb = 198.2 + s[3];
  return { tb, tm: 122.5 + s[4], tc: tb / (0.584 + 0.965 * s[0] - s[0] ** 2), pc: (0.113 + 0.0032 * atoms - s[1]) ** -2, vc: 17.5 + s[2], hf: 68.29 + s[5], gf: 53.88 + s[6] };
}

// Typical pKa values of ionisable groups, from Dimorphite-DL's site table (Ropp et al. 2019, doi:10.1186/s13321-019-0336-9;
// durrantlab/dimorphite_dl 2.1.0, Apache-2.0, dimorphite_dl/smarts/site_substructures.smarts): mean and SD per group,
// rounded to 0.01, in the table's order. Each row is the table's SMARTS written as a test on one atom. The first row
// to match a site keeps it, and the heteroatoms around it are kept from later rows, as Dimorphite does. Rows left
// out: azide, nitro amides and guanidines, peroxides, polyphosphates and the nucleobase rows (those atoms fall
// through to the general rows). For a base, the value is the pKa of its conjugate acid.
type Hit = { sites: number[]; context: number[]; kind?: string; pkas?: number[][] };
const AMINE = ["tertiary amine", "secondary amine", "primary amine"];
function pka(c: Ctx): Properties["pka"] {
  // Dimorphite reads the neutral form: O⁻ and S⁻ take a proton back and N⁺–H gives one up. Nitro, nitroso and
  // N-oxide groups are never sites.
  const n = c.el.length, H = [...c.h], Q = [...c.q], taken: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const nb = c.nb[i][0]?.j;
    if ((c.el[i] === "O" || c.el[i] === "S") && Q[i] === -1 && c.nb[i].length === 1) {
      if (c.el[nb] === "N" && c.q[nb] > 0) taken[i] = taken[nb] = true;
      else { H[i]++; Q[i] = 0; }
    } else if (c.el[i] === "N" && Q[i] === 1 && H[i] > 0) { H[i]--; Q[i] = 0; }
    else if (c.el[i] === "N" && c.nb[i].some((b) => b.order === 2 && c.el[b.j] === "O")) taken[i] = true;
  }
  // SMARTS in small pieces: element list and aromatic or not, connections with H (X), bonds by kind, and so on.
  const is = (j: number, els: string, arom?: boolean) => els.split(",").includes(c.el[j]) && (arom === undefined || c.arom[j] === arom);
  const X = (j: number) => c.nb[j].length + H[j], het = (j: number) => c.el[j] !== "C";
  const by = (i: number, order: number) => c.nb[i].filter((b) => !c.aromBond[b.k] && b.order === order).map((b) => b.j);
  const s1 = (i: number) => by(i, 1), d2 = (i: number) => by(i, 2), t3 = (i: number) => by(i, 3);
  const oxo = (j: number, els = "O,S") => d2(j).find((k) => is(k, els, false));
  const OH = (i: number) => is(i, "O", false) && H[i] > 0 && Q[i] === 0;
  const sp3 = (j: number) => is(j, "C", false) && X(j) === 4;
  const alkyl = (j: number, s = false) => sp3(j) && c.nb[j].every((b) => !het(b.j) || (s && c.el[b.j] === "S"));
  const ring = (i: number, size: number, ok: (r: number[]) => boolean) => c.rings.some((r) => r.length === size && r.includes(i) && r.every((v) => c.arom[v]) && ok(r));
  const plain = (a: number) => ring(a, 6, (r) => r.every((v) => is(v, "C", true) && (v === a || H[v] > 0 || s1(v).some((j) => alkyl(j)))));
  const tetrazole = (i: number) => ring(i, 5, (r) => r.filter((v) => c.el[v] === "N").length === 4);
  const sulfonyl = (j: number) => is(j, "S", false) && X(j) === 4 && d2(j).filter((k) => is(k, "O", false)).length === 2;
  const nitrile = (j: number) => is(j, "C", false) && t3(j).some((k) => c.el[k] === "N");
  // An amine or aniline N: neutral, three connections, not bonded to C=O, C=S, C=N, SO2, N=O, N=C or C≡N.
  const amine = (i: number) => is(i, "N", false) && X(i) === 3 && Q[i] === 0
    && s1(i).every((j) => !(is(j, "C", false) && oxo(j, "O,S,N") !== undefined) && !sulfonyl(j) && !(is(j, "N", false) && d2(j).some((k) => is(k, "O,C", false))) && !nitrile(j));
  // An alkyl amine N: neutral, only sp3 carbons on it, not in a three-membered ring; its β and γ carbons by single bonds.
  const sp3N = (i: number) => is(i, "N", false) && X(i) === 3 && Q[i] === 0 && c.nb[i].every((b) => sp3(b.j)) && !c.rings.some((r) => r.length === 3 && r.includes(i));
  const beta = (i: number) => c.nb[i].flatMap((a) => s1(a.j).filter((b) => b !== i && c.el[b] === "C").map((b) => [a.j, b]));
  const near = (i: number, ok = (_: number) => false) => beta(i).some(([, b]) => c.nb[b].some((x) => x.j !== i && het(x.j) && !ok(x.j)));
  const far = (i: number) => beta(i).some(([a, b]) => s1(b).some((g) => g !== a && c.el[g] === "C" && c.nb[g].some((x) => x.j !== i && het(x.j))));
  const site = (i: number, ...context: (number | undefined)[]): Hit => ({ sites: [i], context: context.filter((j): j is number => j !== undefined && het(j)) });
  const acyls = (i: number, inRing = false) => s1(i).filter((j) => is(j, "C", false) && (inRing ? c.ringAtom[j] : X(j) === 3) && oxo(j) !== undefined);
  const phos = (i: number) => s1(i).find((j) => is(j, "P", false) && X(j) === 4 && oxo(j, "O") !== undefined);
  const rows: [string, number[][], (i: number) => Hit | undefined][] = [
    ["guanidine", [[12.03, 1.59]], (i) => { // AmidineGuanidine1
      const C = is(i, "N", false) && X(i) === 2 && H[i] ? d2(i).find((j) => is(j, "C", false)) : undefined, ns = C === undefined ? [] : s1(C).filter((j) => is(j, "N", false));
      return ns.length >= 2 ? site(i, ...ns) : undefined;
    }],
    ["amidine", [[12.06, 0.65]], (i) => { // Amidine_carbon_substituted: the site is the =N, on a carbon with H or C
      const free = (m: number, els: string) => !s1(m).some((j) => het(j) || is(j, "C", true) || (is(j, "C", false) && oxo(j, els) !== undefined) || nitrile(j));
      const C = is(i, "N", false) && X(i) === 2 && Q[i] === 0 && free(i, "O,S,N") ? d2(i).find((j) => is(j, "C", false) && X(j) === 3) : undefined;
      const m = C === undefined ? undefined : s1(C).find((j) => is(j, "N", false) && X(j) === 3 && Q[j] === 0 && free(j, "O,S"));
      return m !== undefined && (H[C!] > 0 || s1(C!).some((j) => j !== m && c.el[j] === "C")) ? site(i, m) : undefined;
    }],
    ["amidine", [[10.04, 2.13]], (i) => { // AmidineGuanidine2
      if (!is(i, "N", false) || X(i) !== 2 || Q[i] !== 0 || s1(i).some((j) => nitrile(j) || sulfonyl(j) || (is(j, "O", false) && X(j) === 2))) return;
      const C = d2(i).find((j) => is(j, "C", false)), m = C === undefined ? undefined : s1(C).find((j) => is(j, "N", false));
      return m === undefined ? undefined : { ...site(i, m), kind: s1(C!).filter((j) => is(j, "N", false)).length > 1 ? "guanidine" : "amidine" };
    }],
    ["sulfate", [[-2.36, 1.3]], (i) => { // Sulfate
      const S = OH(i) && X(i) === 2 ? s1(i).find(sulfonyl) : undefined, e = S === undefined ? undefined : s1(S).find((j) => j !== i && is(j, "O", false) && s1(j).some((k) => k !== S && is(k, "C,N")));
      return e === undefined ? undefined : site(i, ...d2(S!), e, ...s1(e).filter((k) => k !== S));
    }],
    ["sulfonic acid", [[-1.82, 1.41]], (i) => { // Sulfonate
      const S = OH(i) && X(i) === 2 ? s1(i).find(sulfonyl) : undefined, e = S === undefined ? undefined : s1(S).find((j) => j !== i && is(j, "C,N"));
      return e === undefined ? undefined : site(i, ...d2(S!), e);
    }],
    ["sulfinic acid", [[1.79, 0.44]], (i) => { // Sulfinic_acid
      const S = OH(i) ? s1(i).find((j) => is(j, "S", false) && X(j) === 3 && oxo(j, "O") !== undefined) : undefined;
      return S === undefined ? undefined : site(i, oxo(S, "O"));
    }],
    ["carboxylic acid", [[3.46, 1.25]], (i) => { // Phenyl_carboxyl
      const C = OH(i) ? s1(i).find((j) => is(j, "C", false) && oxo(j, "O") !== undefined && s1(j).some((k) => is(k, "C,N,O", true))) : undefined;
      return C === undefined ? undefined : site(i, oxo(C, "O"), s1(C).find((k) => is(k, "C,N,O", true)));
    }],
    ["carboxylic acid", [[3.46, 1.29]], (i) => { // Carboxyl
      const C = OH(i) ? s1(i).find((j) => is(j, "C", false) && oxo(j, "O") !== undefined) : undefined;
      return C === undefined ? undefined : site(i, oxo(C, "O"));
    }],
    ["thioic acid", [[0.68, 1.5]], (i) => { // Thioic_acid
      const a = is(i, "S,O", false) && X(i) === 2 && H[i] ? s1(i).find((j) => is(j, "C,N") && oxo(j) !== undefined) : undefined;
      return a === undefined ? undefined : site(i, oxo(a), a);
    }],
    ["thiophenol", [[4.98, 2.61]], (i) => { // Phenyl_Thiol
      const a = is(i, "S", false) && X(i) === 2 && H[i] ? s1(i).find((j) => is(j, "C,N", true)) : undefined;
      return a === undefined ? undefined : site(i, a);
    }],
    ["thiol", [[10.81, 0.3]], (i) => // Alkyl_thiol: on an sp3 carbon with no heteroatom, unsaturation or aromatic ring next to it
      is(i, "S", false) && X(i) === 2 && H[i] && s1(i).some((j) => alkyl(j, true) && s1(j).every((b) => !is(b, "C", true)
        && (c.el[b] !== "C" || (c.nb[b].every((x) => !het(x.j) || c.el[x.j] === "S") && !d2(b).some((k) => c.el[k] === "C") && !t3(b).some((k) => c.el[k] === "C"))))) ? site(i) : undefined],
    ["thiol", [[9.12, 1.33]], (i) => { // Thiol
      const a = is(i, "S", false) && X(i) === 2 && H[i] ? s1(i).find((j) => is(j, "C,N", false)) : undefined;
      return a === undefined ? undefined : site(i, a);
    }],
    ["phosphate", [[2.42, 1.11], [6.51, 0.95]], (i) => { // Phosphate: two OH on a P(=O) with a third O
      const o = is(i, "P", false) && X(i) === 4 ? oxo(i, "O") : undefined, oh = s1(i).filter((j) => OH(j) && X(j) === 2).slice(0, 2);
      const rest = s1(i).find((j) => is(j, "O", false) && Q[j] === 0 && !oh.includes(j));
      return o !== undefined && oh.length === 2 && rest !== undefined ? { sites: oh, context: [o, rest] } : undefined;
    }],
    ["phosphonic acid", [[1.88, 0.59], [7.25, 0.85]], (i) => { // Phosphonate
      const o = is(i, "P", false) && X(i) === 4 ? oxo(i, "O") : undefined, oh = s1(i).filter((j) => OH(j) && X(j) === 2).slice(0, 2), a = s1(i).find((j) => is(j, "C,N"));
      return o !== undefined && oh.length === 2 && a !== undefined ? { sites: oh, context: [o, a].filter(het) } : undefined;
    }],
    ["phenol", [[10.09, 0.14]], (i) => (OH(i) && s1(i).some((j) => is(j, "C", true) && plain(j)) ? site(i) : undefined)], // Phenol_unactivated
    ["phenol", [[7.07, 3.28]], (i) => { // Phenol
      const a = OH(i) ? s1(i).find((j) => is(j, "C,N,O", true)) : undefined;
      return a === undefined ? undefined : site(i, a);
    }],
    ["vinylogous acid", [[3.55, 0.8]], (i) => { // O=C-C=C-OH, all in a ring
      const r = (j: number) => is(j, "C", false) && c.ringAtom[j];
      for (const a of OH(i) ? s1(i).filter(r) : []) for (const b of d2(a).filter(r)) for (const d of s1(b).filter((j) => j !== a && r(j))) if (oxo(d, "O") !== undefined) return site(i, oxo(d, "O"));
    }],
    ["enol", [[8.87, 1.66]], (i) => (OH(i) && s1(i).some((j) => is(j, "C", false) && d2(j).some((k) => is(k, "C", false))) ? site(i) : undefined)], // Vinyl_alcohol
    ["alcohol", [[14.78, 2.55]], (i) => (OH(i) && s1(i).some((j) => is(j, "C", false)) ? site(i) : undefined)], // Alcohol
    ["hydroxamic acid", [[9.3, 1.22]], (i) => { // N-hydroxyamide
      const N = OH(i) ? s1(i).find((j) => is(j, "N", false) && s1(j).some((C) => is(C, "C", false) && oxo(C, "O") !== undefined)) : undefined;
      return N === undefined ? undefined : site(i, N, ...s1(N).map((C) => (is(C, "C", false) ? oxo(C, "O") : undefined)));
    }],
    ["imide", [[6.45, 0.56]], (i) => { // Ringed_imide1: the ring carbonyl also bears O, N, S or a halogenated carbon
      const a = is(i, "N", false) && c.ringAtom[i] && H[i] ? acyls(i, true) : [];
      for (const C of a) {
        const x = s1(C).find((j) => j !== i && (is(j, "O,N,S") || (c.el[j] === "C" && c.nb[j].some((b) => is(b.j, "Cl,F,Br")))));
        if (a.length >= 2 && x !== undefined) return site(i, ...a.map((j) => oxo(j)), x);
      }
    }],
    ["imide", [[8.68, 1.87]], (i) => { // Ringed_imide2
      const a = is(i, "N", false) && c.ringAtom[i] && H[i] ? acyls(i, true) : [];
      return a.length >= 2 ? site(i, ...a.map((j) => oxo(j))) : undefined;
    }],
    ["imide", [[2.47, 1.48]], (i) => { // Imide: a carbonyl's carbon neighbour bears a halogen, S or P
      const a = is(i, "N", false) && X(i) === 3 && Q[i] === 0 && H[i] ? acyls(i) : [];
      for (const C of a) for (const b of c.nb[C]) {
        const x = b.j !== i && c.el[b.j] === "C" ? c.nb[b.j].find((y) => is(y.j, "F,Cl,Br,S,P"))?.j : undefined;
        if (a.length >= 2 && x !== undefined) return site(i, ...a.map((j) => oxo(j)), x);
      }
    }],
    ["imide", [[10.23, 1.12]], (i) => { // Imide2
      const a = is(i, "N", false) && X(i) === 3 && Q[i] === 0 && H[i] ? acyls(i) : [];
      return a.length >= 2 ? site(i, ...a.map((j) => oxo(j))) : undefined;
    }],
    ["amide", [[3.49, 2.69]], (i) => { // Amide_electronegative
      const C = is(i, "N", false) && H[i] ? s1(i).find((j) => is(j, "C", false) && oxo(j, "O") !== undefined) : undefined;
      const e = C === undefined ? undefined : s1(i).find((j) => is(j, "Br,Cl,I,F") || is(j, "S,O,N,P", false));
      return e === undefined ? undefined : site(i, oxo(C!, "O"), e);
    }],
    ["amide", [[15.1, 1]], (i) => { // Carboxamide: neither the N nor the carbonyl carbon bears another heteroatom
      const C = is(i, "N", false) && X(i) === 3 && Q[i] === 0 && H[i] && !s1(i).some(het)
        ? s1(i).find((j) => is(j, "C", false) && X(j) === 3 && oxo(j, "O") !== undefined && s1(j).filter(het).length < 2) : undefined;
      return C === undefined ? undefined : site(i, oxo(C, "O"));
    }],
    ["amide", [[12.01, 4.51]], (i) => { // Amide
      const C = is(i, "N", false) && H[i] ? s1(i).find((j) => is(j, "C", false) && oxo(j, "O") !== undefined) : undefined;
      return C === undefined ? undefined : site(i, oxo(C, "O"));
    }],
    ["sulfonamide", [[10.16, 0.55]], (i) => { // Primary_sulfonamide on an alkyl or plain phenyl group
      const S = is(i, "N", false) && X(i) === 3 && Q[i] === 0 && H[i] >= 2 ? s1(i).find(sulfonyl) : undefined;
      return S !== undefined && s1(S).some((j) => alkyl(j, true) || (is(j, "C", true) && plain(j))) ? site(i, ...d2(S)) : undefined;
    }],
    ["sulfonamide", [[7.92, 1.98]], (i) => { // Sulfonamide
      const S = is(i, "N", false) && X(i) === 3 && Q[i] === 0 && H[i] ? s1(i).find(sulfonyl) : undefined;
      return S === undefined ? undefined : site(i, ...d2(S));
    }],
    ["aniline", [[3.9, 2.07]], (i) => (is(i, "N", false) && X(i) === 3 && Q[i] === 0 && H[i] >= 2 && s1(i).some((j) => is(j, "C", true)) ? site(i) : undefined)], // Anilines_primary
    ["aniline", [[4.98, 0.11]], (i) => // Anilines_secondary_N_alkyl
      amine(i) && H[i] === 1 && s1(i).some((j) => is(j, "C", true)) && s1(i).some((j) => sp3(j) && H[j] >= 2) && !s1(i).some((j) => sp3(j) && s1(j).some((k) => k !== i && het(k))) ? site(i) : undefined],
    ["aniline", [[4.34, 2.18]], (i) => (amine(i) && H[i] === 1 && s1(i).some((j) => is(j, "C", true)) ? site(i, ...s1(i)) : undefined)], // Anilines_secondary
    ["aniline", [[4.17, 2.01]], (i) => (amine(i) && H[i] === 0 && s1(i).some((j) => is(j, "C", true)) ? site(i, ...s1(i)) : undefined)], // Anilines_tertiary
    ["diazine N", [[1.77, 1.03]], (i) => // Diazine: a second pyridine-type N in the ring and no heteroatom substituent on it
      is(i, "N", true) && X(i) === 2 && Q[i] === 0 && ring(i, 6, (r) => r.some((v) => v !== i && is(v, "N", true) && X(v) === 2)
        && r.every((v) => !c.nb[v].some((b) => !c.ringBond[b.k] && het(b.j) && !is(b.j, "F,Cl,Br,I")))) ? site(i) : undefined],
    ["aromatic N", [[4.35, 2.07]], (i) => (is(i, "N", true) && Q[i] === 0 && !H[i] && !tetrazole(i) ? site(i) : undefined)], // Aromatic_nitrogen_unprotonated
    ["amine", [[5.5, 0.67]], (i) => // Fluoroalkylamine
      sp3N(i) && c.nb[i].some((a) => s1(a.j).some((b) => sp3(b) && c.nb[b].filter((x) => c.el[x.j] === "F").length >= 3)) ? site(i) : undefined],
    ["amine", [[9.4, 0.29]], (i) => (sp3N(i) && !near(i) && !far(i) && c.nb[i].some((a) => s1(a.j).some((k) => is(k, "C", true))) ? site(i) : undefined)], // Benzylic_amine
    ["amine", [[9.62, 0.22]], (i) => { // Beta_hydroxy_amine: one β-hydroxyethyl arm
      if (!sp3N(i) || near(i, (x) => is(x, "O", false) && X(x) === 2 && H[x] > 0)) return;
      const arms = c.nb[i].map((a) => s1(a.j).filter((b) => sp3(b) && s1(b).some((o) => is(o, "O", false) && X(o) === 2)));
      const oh = arms.some((bs) => bs.some((b) => s1(b).some((o) => OH(o) && X(o) === 2)));
      return oh && arms.filter((bs) => bs.length).length === 1 && arms.every((bs) => bs.length < 2) ? site(i) : undefined;
    }],
    ["amine", [], (i) => // Alkylamine_primary, _secondary and _tertiary
      sp3N(i) && !near(i) && !far(i) && !beta(i).some(([, b]) => [...d2(b), ...t3(b)].some((k) => c.el[k] === "C")) && !c.nb[i].some((a) => s1(a.j).some((k) => is(k, "C", true)))
        ? { ...site(i), pkas: [[[10.28, 0.37], [11.02, 0.28], [10.55, 0.13]][H[i]]] } : undefined],
    ["amine", [[8.16, 2.52]], (i) => (amine(i) && s1(i).some((j) => is(j, "C", false)) ? site(i) : undefined)], // Amines_primary_secondary_tertiary
    ["phosphinic acid", [[2.97, 0.69]], (i) => { // Phosphinic_acid
      const P = OH(i) && X(i) === 2 ? phos(i) : undefined, r = P === undefined ? [] : s1(P).filter((j) => is(j, "C,N,F,Cl,Br,I"));
      return r.length >= 2 ? site(i, oxo(P!, "O"), ...r) : undefined;
    }],
    ["phosphate", [[2.73, 2.54]], (i) => { // Phosphate_diester
      const P = OH(i) && X(i) === 2 ? phos(i) : undefined;
      const r = P === undefined ? [] : s1(P).filter((j) => j !== i && is(j, "O", false) && Q[j] === 0 && s1(j).some((k) => k !== P && is(k, "C,N,F,Cl,Br,I")));
      return r.length >= 2 ? site(i, oxo(P!, "O"), ...r) : undefined;
    }],
    ["phosphonate", [[2.09, 0.45]], (i) => { // Phosphonate_ester
      const P = OH(i) && X(i) === 2 ? phos(i) : undefined;
      const e = P === undefined ? undefined : s1(P).find((j) => j !== i && is(j, "O", false) && X(j) === 2 && s1(j).some((k) => k !== P && is(k, "C,N,F,Cl,Br,I")));
      const a = P === undefined ? undefined : s1(P).find((j) => is(j, "C,N,F,Cl,Br,I"));
      return e !== undefined && a !== undefined ? site(i, oxo(P!, "O"), e, a) : undefined;
    }],
    ["hydroxylamine", [[4.04, 0.85]], (i) => { // Primary_hydroxyl_amine
      const o = is(i, "N", false) && H[i] === 2 ? s1(i).find((j) => is(j, "O", false) && s1(j).some((k) => c.el[k] === "C")) : undefined;
      return o === undefined ? undefined : site(i, o);
    }],
    ["pyrrole NH", [[14.53, 4.07]], (i) => (is(i, "N", true) && H[i] && ring(i, 5, (r) => r.every((v) => v === i || is(v, "C", true))) ? site(i) : undefined)], // Indole_pyrrole
    ["azole NH", [[12.23, 2.31]], (i) => // Azole_NH: another N in the five-membered ring, no ring C=O or C=S
      is(i, "N", true) && H[i] && !tetrazole(i) && ring(i, 5, (r) => r.some((v) => v !== i && c.el[v] === "N") && !r.some((v) => is(v, "C", true) && oxo(v) !== undefined)) ? site(i) : undefined],
    ["tetrazole", [[5.18, 0.45]], (i) => // Tetrazole_NH
      is(i, "N", true) && X(i) === 3 && Q[i] === 0 && H[i] === 1 && ring(i, 5, (r) => r.filter((v) => c.el[v] === "N").length === 4 && r.some((v) => is(v, "C", true) && (H[v] > 0 || s1(v).some((k) => c.el[k] === "C")))) ? site(i) : undefined],
    ["aromatic NH", [[7.17, 2.95]], (i) => (is(i, "N", true) && H[i] ? site(i) : undefined)], // Aromatic_nitrogen_protonated
  ];
  const out: Properties["pka"] = [];
  for (const [kind, pkas, test] of rows) {
    const context: number[] = [];
    for (let i = 0; i < n; i++) {
      const hit = test(i);
      if (!hit || [...hit.sites, ...hit.context].some((a) => taken[a])) continue;
      hit.sites.forEach((a, s) => {
        const [value, sd] = (hit.pkas ?? pkas)[s];
        taken[a] = true;
        out.push({ atom: c.of[a], kind: hit.kind ?? (kind === "amine" ? AMINE[H[a]] : kind), pka: value, sd });
      });
      context.push(...hit.context);
    }
    context.forEach((a) => (taken[a] = true));
  }
  return out;
}

// Every calculator's result for one structure. ESOL needs logP and weight as well: see logS.
export function properties(g: Graph): Properties {
  const c = context(g), heavy = c.el.length;
  return { tpsa: tpsa(c), joback: joback(c), pka: pka(c), rotatable: rotatable(c), aromaticProportion: heavy ? c.arom.filter(Boolean).length / heavy : 0 };
}
