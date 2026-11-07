// Cahn-Ingold-Prelog labels, worked out by Octet: R, S, r and s on stereocentres and E and Z on double bonds, by the
// 2013 IUPAC recommendations (P-92), on the hierarchical digraph as Hanson, Musacchio, Mayfield, Vainio, Yerin and
// Redkin set the rules out for machines ("Algorithmic Analysis of Cahn-Ingold-Prelog Rules of Stereochemistry",
// J. Chem. Inf. Model. 2018, 58, 1755). Where the rules leave a detail open (a duplicate atom's mass, when a root
// distance counts, how auxiliary descriptors are given, how rule 4b pairs them) Octet does what the authors' own
// implementation does (John Mayfield's Centres, as RDKit's CIP labeller has it), so its labels match their
// validation suite. The code is Octet's own.
//
// The configuration comes from ChemDraw's own record where a ChemDraw file keeps one, from the atoms' places where a
// centre is drawn in 3D, and otherwise from the drawing as Indigo reads it (wedges and hashes from the centre, a
// hydrogen or lone pair opposite three drawn bonds) with the other stereo bonds ChemDraw reads (stereoUnits). Every
// digraph has a size and work limit: past it the centre gets no label, never a guessed one.
import { AROMATIC, HBOND, QUADRUPLE, hydrogens, type Mol } from "./render.ts";
import { ELEMENTS } from "./labels.ts";
import { kekulise } from "./rings.ts";
import { atomMass } from "./mass.ts";
import { handedness } from "./axial.ts";

export type Cip = { atoms: (string | undefined)[]; bonds: (string | undefined)[] };

// Limits: a structure's atoms; for each stereo unit, its digraph's nodes and the comparisons made (the validation
// suite's hardest unit needs 4,064 nodes and 26,365 comparisons); and the nodes and comparisons of all a structure's
// units together. A unit past a limit gets no label. A wedge on every CH of dodecahedrane takes about 45 ms.
const MOST_ATOMS = 1000, MOST_NODES = 10000, MOST_CALLS = 100000, ALL_NODES = 200000, ALL_CALLS = 2000000;

// ---- The molecule as the rules see it ----

const SYMBOLS = [...ELEMENTS];
const symbol = (label: string) => (label === "D" || label === "T" ? "H" : label);
// Atomic number. A pseudo-atom (*: a generic group such as R, or a label Octet cannot read) ranks above every element,
// as ChemDraw and Indigo rank an R group.
const numberOf = (label: string) => SYMBOLS.indexOf(symbol(label)) + 1 || 200;

// Each atom's atomic number, mass number (0 when none is set), rule 2 mass, hydrogens and charge; each atom's bonds
// with their Kekulé order; which bonds are in a ring; and frac, the atomic number of a mancude ring atom's bond
// duplicates (P-92.1.4.4).
type Chem = { z: number[]; massNo: number[]; mass: number[]; h: number[]; q: number[]; adj: { to: number; bond: number; order: number }[][]; ring: boolean[]; frac: (number | undefined)[] };

function chemOf(m: Mol): Chem {
  const n = m.atoms.length, z = m.atoms.map((a) => numberOf(a.label)), q = m.atoms.map((a) => a.charge ?? 0);
  const kept = m.bonds.flatMap((b, k) => (b.type !== HBOND && b.atoms[0] !== b.atoms[1] && b.atoms.every((i) => i >= 0 && i < n) ? [k] : []));
  const order = m.bonds.map((b) => (b.type === 2 || b.type === 3 ? b.type : b.type === QUADRUPLE ? 4 : 1));
  const used = m.atoms.map(() => 0), single = m.atoms.map(() => 0);
  for (const k of kept) for (const i of m.bonds[k].atoms) { used[i] += m.bonds[k].type === AROMATIC ? 1.5 : order[k]; single[i] += order[k]; }
  const h = m.atoms.map((a, i) => a.implicitHCount ?? hydrogens(a.label, q[i], used[i], a.radical === 1 ? 1 : a.radical ? 2 : 0));
  // Aromatic bonds made Kekulé: a double bond to each atom with a free valence, carbons first.
  const arom = kept.filter((k) => m.bonds[k].type === AROMATIC);
  if (arom.length) {
    const can = [...new Set(arom.flatMap((k) => m.bonds[k].atoms))].filter((i) => hydrogens(m.atoms[i].label, q[i], single[i]) - h[i] >= 1).sort((a, b) => Number(z[a] !== 6) - Number(z[b] !== 6));
    kekulise(arom.map((k) => m.bonds[k].atoms), can).forEach((p, j) => { if (p) order[arom[j]] = 2; });
  }
  const adj: Chem["adj"] = m.atoms.map(() => []);
  for (const k of kept) { const [i, j] = m.bonds[k].atoms; adj[i].push({ to: j, bond: k, order: order[k] }); adj[j].push({ to: i, bond: k, order: order[k] }); }
  const massNo = m.atoms.map((a) => a.isotope ?? (a.label === "D" ? 2 : a.label === "T" ? 3 : 0));
  const mass = m.atoms.map((a, i) => atomMass(symbol(a.label), massNo[i]) ?? NaN);
  const ring = ringBonds(n, adj, m.bonds.length);
  return { z, massNo, mass, h, q, adj, ring, frac: mancude(z, q, h, adj, ring) };
}

// Bonds in a ring: every bond that is not a bridge.
function ringBonds(n: number, adj: Chem["adj"], bonds: number): boolean[] {
  const ring = new Array<boolean>(bonds).fill(true), seen = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0);
  let t = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] >= 0) continue;
    const stack: [number, number, number][] = [[s, -1, 0]];
    seen[s] = low[s] = t++;
    while (stack.length) {
      const top = stack[stack.length - 1], [v, via] = top;
      if (top[2] < adj[v].length) {
        const { to, bond } = adj[v][top[2]++];
        if (bond === via) continue;
        if (seen[to] < 0) { seen[to] = low[to] = t++; stack.push([to, bond, 0]); } else low[v] = Math.min(low[v], seen[to]);
      } else {
        stack.pop();
        if (stack.length) { const u = stack[stack.length - 1][0]; low[u] = Math.min(low[u], low[v]); if (low[v] > seen[u]) ring[via] = false; }
      }
    }
  }
  return ring;
}

// Mancude rings (P-92.1.4.4): a bond duplicate on a ring atom that could carry its double bond to more than one
// neighbour takes the mean atomic number of those neighbours, so a ring ranks the same whichever Kekulé form is
// drawn. Ring atoms that can share a double bond (=C<, =N-, =N+<, =O+-, and the anions -C(-)<, -N(-)-) with at least
// two such ring neighbours form a resonant part; in a part with an anion the charge moves too, so every atom of the
// part takes the part's mean.
function mancude(z: number[], q: number[], h: number[], adj: Chem["adj"], ring: boolean[]): (number | undefined)[] {
  const n = z.length, type = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!adj[i].some((e) => ring[e.bond])) continue;
    let s = h[i], d = 0, other = 0;
    for (const e of adj[i]) if (e.order === 1) s++; else if (e.order === 2) d++; else other++;
    if (other) continue;
    if ([6, 14, 32].includes(z[i])) type[i] = q[i] === 0 && d === 1 && s === 2 ? 1 : q[i] === -1 && !d && s === 3 ? 2 : 0;
    else if ([7, 15, 33].includes(z[i])) type[i] = q[i] === 0 && d === 1 && s === 1 ? 1 : q[i] === -1 && !d && s === 2 ? 2 : q[i] === 1 && d === 1 && s === 2 ? 1 : 0;
    else if (z[i] === 8) type[i] = q[i] === 1 && d === 1 && s === 1 ? 1 : 0;
  }
  const typedRing = (i: number) => adj[i].filter((e) => ring[e.bond] && type[e.to]);
  const count = type.map((t, i) => (t ? typedRing(i).length : 0)), queue = type.flatMap((t, i) => (t && count[i] <= 1 ? [i] : []));
  while (queue.length) {
    const i = queue.shift()!;
    if (!type[i]) continue;
    type[i] = 0;
    for (const e of adj[i]) if (ring[e.bond] && type[e.to] && --count[e.to] === 1) queue.push(e.to);
  }
  const part = new Array<number>(n).fill(0);
  let parts = 0;
  for (let s = 0; s < n; s++) {
    if (!type[s] || part[s]) continue;
    part[s] = ++parts;
    for (const stack = [s]; stack.length;) for (const e of adj[stack.pop()!]) if (ring[e.bond] && type[e.to] && !part[e.to]) { part[e.to] = parts; stack.push(e.to); }
  }
  const frac: (number | undefined)[] = new Array(n).fill(undefined);
  if (!parts) return frac;
  const sum = new Array<number>(parts + 1).fill(0), size = new Array<number>(parts + 1).fill(0), anion = new Array<boolean>(parts + 1).fill(false);
  for (let i = 0; i < n; i++) {
    if (!part[i]) continue;
    const near = adj[i].filter((e) => part[e.to] === part[i]);
    if (near.length > 1) frac[i] = near.reduce((t, e) => t + z[e.to], 0) / near.length;
    if (type[i] === 2) anion[part[i]] = true;
    size[part[i]]++;
    for (const e of near) if (e.order > 1) sum[part[i]] += (e.order - 1) * z[e.to];
  }
  for (let i = 0; i < n; i++) if (part[i] && anion[part[i]] && size[part[i]] > 1) frac[i] = sum[part[i]] / size[part[i]];
  return frac;
}

// ---- Stereo units from the drawing ----

type V3 = [number, number, number];
// A tetrahedral centre: its four ligands (-1 for its hydrogen or lone pair) in the order a, b, c, d where a, b, c turn
// clockwise seen with d away from the viewer (Indigo's pyramid).
type Centre = { kind: "centre"; foci: [number]; around: number[] };
// A double bond, or a cumulene with an odd number of double bonds (C=C=C=C): its end atoms, the atoms from end to end,
// a carrier (substituent) on each end, whether the two carriers are cis, and the bond that takes the label (the
// middle one).
type Double = { kind: "double"; foci: [number, number]; chain: number[]; carriers: [number, number]; cis: boolean; bond: number };
// An allene's axis (a cumulene with an even number of double bonds), used only as an auxiliary descriptor (M, P) for
// the centres round it: axial.ts gives the labels shown. foci: its middle atom; place: where each end's ligands are
// (from the wedges at the end atoms, as axial.ts reads them), and h, each end's hydrogen where it has one.
type Axis = { kind: "axis"; foci: [number]; chain: number[]; place: Map<number, V3>; h: [V3 | undefined, V3 | undefined] };
type Unit = (Centre | Double | Axis) & { label?: string };

const EPS = 1e-3;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 | undefined => { const l = Math.hypot(...a); return l > 1e-6 ? [a[0] / l, a[1] / l, a[2] / l] : undefined; };
// Where u lies against bonds v1 and v2 (as drawn): 1 in the smaller angle between them, 2 in the larger, 4 or 8 on one
// side or the other of a straight angle; undefined when u lies on a straight v1, v2.
function sector(v1: V3, v2: V3, u: V3): number | undefined {
  const sin1 = v1[0] * v2[1] - v1[1] * v2[0], sin2 = v1[0] * u[1] - v1[1] * u[0];
  if (Math.abs(sin1) < EPS) return Math.abs(sin2) < EPS ? undefined : sin2 > 0 ? 4 : 8;
  return sin1 * sin2 < -EPS * EPS || dot(v1, u) < dot(v1, v2) ? 2 : 1;
}
// The turn through the bond ends v1, v2, v3 as drawn: 1 anticlockwise, -1 clockwise; undefined when two bonds are
// within 4.5° of each other or the ends are in line.
function turn(v1: V3, v2: V3, v3: V3): 1 | -1 | undefined {
  if (dot(v1, v2) > 0.997 || dot(v1, v3) > 0.997 || dot(v2, v3) > 0.997) return undefined;
  const r = (v1[0] - v3[0]) * (v2[1] - v3[1]) - (v1[1] - v3[1]) * (v2[0] - v3[0]);
  return r > EPS ? 1 : r < -EPS ? -1 : undefined;
}

// The atoms that can be stereocentres, as Indigo lists them: element, charge, drawn neighbours, double bonds, and
// whether a lone pair (not a hydrogen) is the fourth ligand when three are drawn.
const CENTRES: [string, number, number, number, boolean][] = [
  ["C", 0, 3, 0, false], ["C", 0, 4, 0, false], ["Si", 0, 3, 0, false], ["Si", 0, 4, 0, false], ["As", 0, 4, 0, false], ["B", -1, 4, 0, false],
  ["N", 1, 3, 0, false], ["N", 1, 4, 0, false], ["N", 0, 4, 1, false], ["N", 0, 3, 0, true], ["S", 0, 4, 2, false], ["S", 1, 3, 0, true],
  ["S", 1, 4, 1, false], ["S", 0, 3, 1, true], ["P", 0, 3, 0, true], ["P", 1, 4, 0, false], ["P", 0, 4, 1, false],
];

// A centre's pyramid from its wedges, by Indigo's reading (molecule_stereocenters.cpp), or undefined when the bonds
// set no configuration or contradict each other. dirs: +1 when a neighbour is towards the viewer, -1 away, 0 in plane.
function pyramid(m: Mol, i: number, near: number[], dirOf: (j: number) => number, lone: boolean): number[] | undefined {
  const pureH = (j: number) => m.atoms[j].label === "H" && !m.atoms[j].isotope;
  const order = [...near].sort((a, b) => (pureH(a) ? 1e9 + a : a) - (pureH(b) ? 1e9 + b : b));
  const v = order.map((j) => unit(sub(m.atoms[j].location, m.atoms[i].location))), d = order.map(dirOf), h = order.filter(pureH).length;
  if (!d.some(Boolean) || v.some((x) => !x)) return undefined;
  const w = v as V3[];
  if (order.length === 4) {
    // The first wedged bond and the bond across from it (the other two lie one each side) point one way, the side bonds
    // the other.
    const m1 = d.findIndex(Boolean);
    if (h > 1) return undefined;
    let m2 = -1, s1 = -1, s2 = -1;
    for (const [o, a, b] of [[1, 2, 3], [2, 1, 3], [3, 1, 2]]) {
      const x = sector(w[m1], w[(m1 + o) % 4], w[(m1 + a) % 4]), y = sector(w[m1], w[(m1 + o) % 4], w[(m1 + b) % 4]);
      if (x === undefined || y === undefined) return undefined;
      if (x + y === 3 || x + y === 12) { m2 = (m1 + o) % 4; s1 = (m1 + a) % 4; s2 = (m1 + b) % 4; break; }
    }
    if (m2 < 0 || d[m2] === -d[m1] || d[s1] === d[m1] || d[s2] === d[m1]) return undefined;
    const last = m1 === 3 || m2 === 3 ? d[m1] : -d[m1], t = turn(w[0], w[1], w[2]);
    if (!t) return undefined;
    return last === t ? order : [order[0], order[2], order[1], order[3]];
  }
  if (order.length !== 3) return undefined;
  const up = d.filter((x) => x > 0).length, down = d.filter((x) => x < 0).length;
  // Three drawn bonds in one half-plane: the middle one's wedge (or the outer ones') sets the side of the fourth ligand.
  let mid = -1, flat = true, sense = 1;
  for (let k = 0; k < 3; k++) {
    const x = sector(w[(k + 1) % 3], w[(k + 2) % 3], w[k]);
    if (x === undefined) return undefined;
    if (x === 1) mid = k;
    if (x === 2) flat = false;
  }
  if (mid >= 0) {
    if (d[mid]) {
      if (d[(mid + 1) % 3] === d[mid] || d[(mid + 2) % 3] === d[mid]) return undefined;
      if (d[mid] > 0) sense = -1;
    } else {
      const d1 = d[(mid + 1) % 3] || d[(mid + 2) % 3], d2 = d[(mid + 2) % 3];
      if (d2 && d1 !== d2) return undefined;
      if (d1 < 0) sense = -1;
    }
  } else if (!flat) {
    // One bond up and one down, which Indigo cannot read: as ChemDraw reads it, the fourth ligand is opposite the three.
    if (up && down) return h && !lone ? undefined : fromPoints([...order, -1], w.map((x, k) => [x[0], x[1], d[k]]));
    if (!lone && (up === 3 || down === 3)) return undefined;
    if (down) sense = -1;
  } else return undefined;
  if (h && !lone) return undefined;
  const t = turn(w[0], w[1], w[2]);
  if (!t) return undefined;
  return t === sense ? [order[0], order[2], order[1], -1] : [order[0], order[1], order[2], -1];
}

// A pyramid from the ligands' directions in 3D (ids: 4, the last -1 when only three are drawn; its direction is then
// opposite theirs). Undefined when they lie nearly flat (least: the smallest volume taken).
function fromPoints(ids: number[], p: V3[], least = 1e-3): number[] | undefined {
  const q = p.map(unit);
  if (q.some((x) => !x)) return undefined;
  const u = q as V3[];
  if (u.length === 3) u.push([-u[0][0] - u[1][0] - u[2][0], -u[0][1] - u[1][1] - u[2][1], -u[0][2] - u[1][2] - u[2][2]]);
  const vol = dot(sub(u[0], u[3]), cross(sub(u[1], u[3]), sub(u[2], u[3])));
  // A negative volume: 1 → 2 → 3 turns clockwise seen with 4 away.
  return Math.abs(vol) < least ? undefined : vol < 0 ? ids : [ids[0], ids[2], ids[1], ids[3]];
}

// The stereo bonds at atom i, towards each of the atoms given (h for a hydrogen or lone pair): what a kept
// configuration was read with.
export function stereoMarks(m: Mol, i: number, atoms: number[]): string {
  return atoms.map((j) => {
    if (j < 0) return "h";
    const b = m.bonds.find((x) => x.type !== HBOND && x.atoms.includes(i) && x.atoms.includes(j));
    return b ? `${b.stereo ?? 0}${b.atoms[0] === i ? ">" : "<"}${b.display ?? ""}` : "?";
  }).join(" ");
}
// Whether atom i's kept configuration still holds: the same neighbours (a hydrogen or lone pair for the fourth when
// three are drawn) and the same stereo bonds as when it was read.
export function keptHolds(m: Mol, i: number, kept: NonNullable<Mol["atoms"][number]["kept"]>): boolean {
  const near = new Set(m.bonds.flatMap((b) => (b.type !== HBOND && b.atoms.includes(i) ? [b.atoms[0] === i ? b.atoms[1] : b.atoms[0]] : [])));
  const drawn = kept.atoms.filter((j) => j >= 0);
  return kept.atoms.length === 4 && near.size === drawn.length && near.size >= 3 && drawn.every((j) => near.has(j)) && stereoMarks(m, i, kept.atoms) === kept.marks;
}

// Indigo's test of a double bond's side: 1 when neighbours nb (of beg) and ne (of end) are on the same side, -1 when
// opposite, 0 when either is too near the line of the bond.
function sameSide(m: Mol, beg: number, end: number, nb: number, ne: number): number {
  const at = (i: number) => m.atoms[i].location as V3, diff = sub(at(beg), at(end));
  const norm = unit(cross(cross(diff, sub(at(nb), at(beg))), diff)), b = unit(sub(at(nb), at(beg))), e = unit(sub(at(ne), at(end)));
  if (!norm || !b || !e) return 0;
  const pb = dot(b, norm), pe = dot(e, norm);
  return Math.abs(pb) < 0.1 || Math.abs(pe) < 0.1 ? 0 : pb * pe > 0 ? 1 : -1;
}

// The drawing's stereo units: centres, and double bonds (and cumulenes with an odd number of double bonds) between C,
// N, Si or Ge with a drawn substituent on each end. A centre's configuration, first found first:
// - ChemDraw's kept one (Atom.kept), while its stereo bonds are as ChemDraw saved them. ChemDraw labels from it where
//   its drawing sets nothing, and keeps it over stereo bonds it does not read.
// - Its atoms' places, where the centre is drawn in 3D: a neighbour at least a fifth of a bond nearer or further than
//   it, and the four ligands clearly not flat (a flat drawing turned in 3D is read from its wedges).
// - Its stereo bonds, as ChemDraw reads them: a wedge (solid or hollow) or hashed wedge from the centre; and where none
//   starts, a wedge whose wide end is on it (Indigo's bidirectional mode), a hashed or dashed bond (away from the
//   viewer) and a bold one out of a ring (towards the viewer). A bold ring bond draws a ring in perspective (a Haworth
//   projection), not a centre.
// Left out: a centre or double bond with a wavy bond on it, a crossed (either) double bond, and a double bond in a ring
// of fewer than 8 atoms.
// Each stereo bond's direction (+1 towards the viewer) seen from an end ("i j": from i): wedges from their narrow end
// (stereo), and the rest (other).
type Dirs = { stereo: Map<string, number>; other: Map<string, number> };
function dirsOf(m: Mol, c: Chem): Dirs {
  const stereo = new Map<string, number>(), other = new Map<string, number>();
  m.bonds.forEach((b, k) => {
    const [i, j] = b.atoms, wedge = b.stereo === 1 || b.display === "hollow" ? 1 : b.stereo === 6 ? -1 : 0;
    if (wedge) { stereo.set(`${i} ${j}`, wedge); other.set(`${j} ${i}`, -wedge); return; }
    const flat = b.type === 1 && (b.display === "hashed" || b.display === "dashed" ? -1 : b.display === "bold" && !c.ring[k] ? 1 : 0);
    if (flat) { other.set(`${i} ${j}`, flat); other.set(`${j} ${i}`, flat); }
  });
  return { stereo, other };
}
// The arrangement of atom i's ligands (near: three or four atoms; lone: a lone pair, not a hydrogen, is the fourth when
// three are drawn) as the drawing gives it, first found first: ChemDraw's kept record, the atoms' places in 3D (not
// for an amine, which turns over too fast), the stereo bonds from i, then the other stereo bonds (not with a lone pair).
function arrangement(m: Mol, i: number, near: number[], lone: boolean, amine: boolean, d: Dirs): number[] | undefined {
  const kept = m.atoms[i].kept, depth = (j: number) => m.atoms[j].location[2] ?? 0;
  if (kept && keptHolds(m, i, kept)) return kept.atoms;
  if (!amine && near.some((j) => Math.abs(depth(j) - depth(i)) >= 0.2)) {
    const p = fromPoints([...near, -1].slice(0, 4), near.map((j) => sub(m.atoms[j].location, m.atoms[i].location)), 0.1);
    if (p) return p;
  }
  const from = (j: number) => d.stereo.get(`${i} ${j}`) ?? 0;
  return near.some((j) => from(j)) ? pyramid(m, i, near, from, lone) : lone ? undefined : pyramid(m, i, near, (j) => d.other.get(`${i} ${j}`) ?? 0, false);
}
// R or S at atom i of any element (a tetrahedral metal centre: complexes.ts), its four neighbours ranked highest first,
// from the drawing as a stereocentre's configuration is read. Undefined where the drawing sets none.
export function handOf(m: Mol, i: number, ranked: number[]): "R" | "S" | undefined {
  try {
    const c = chemOf(m), near = c.adj[i].map((e) => e.to);
    if (near.length !== 4 || new Set(near).size !== 4 || m.bonds.some((b) => b.display === "wavy" && b.atoms.includes(i))) return undefined;
    const around = arrangement(m, i, near, false, false, dirsOf(m, c)), odd = around && parity(around, ranked);
    return odd === undefined ? undefined : odd ? "S" : "R";
  } catch { return undefined; }
}

function stereoUnits(m: Mol, c: Chem): Unit[] {
  const units: Unit[] = [], n = m.atoms.length;
  const wavy = new Set(m.bonds.flatMap((b) => (b.display === "wavy" ? b.atoms : [])));
  const dirs = dirsOf(m, c);
  for (let i = 0; i < n; i++) {
    const near = c.adj[i].map((e) => e.to), doubles = c.adj[i].filter((e) => e.order === 2).length;
    if (wavy.has(i) || near.length < 3 || near.length > 4 || c.adj[i].some((e) => e.order > 2)) continue;
    const el = symbol(m.atoms[i].label), q = c.q[i];
    const allowed = CENTRES.find(([e, ch, deg, dbl]) => e === el && ch === q && deg === near.length && dbl === doubles);
    if (!allowed) continue;
    const around = arrangement(m, i, near, allowed[4], el === "N" && allowed[4], dirs);
    if (around) units.push({ kind: "centre", foci: [i], around });
  }
  // A cumulated atom: two double bonds and nothing else.
  const cumulated = (i: number) => c.adj[i].length === 2 && c.adj[i].every((e) => e.order === 2);
  const done = new Set<number>();
  m.bonds.forEach((b, k) => {
    if (b.type !== 2 || b.display === "either" || done.has(k)) return;
    // The chain of cumulated atoms through the bond, out to its two ends.
    const chain = [...b.atoms];
    for (const end of [0, 1]) {
      for (let guard = 0; guard < n; guard++) {
        const x = end ? chain[chain.length - 1] : chain[0], prev = end ? chain[chain.length - 2] : chain[1];
        if (!cumulated(x)) break;
        const next = c.adj[x].find((e) => e.to !== prev)!.to;
        if (chain.includes(next)) return;
        if (end) chain.push(next); else chain.unshift(next);
      }
    }
    const bonds = chain.slice(1).map((x, j) => c.adj[x].find((e) => e.to === chain[j])!.bond);
    bonds.forEach((j) => done.add(j));
    const f1 = chain[0], f2 = chain[chain.length - 1];
    // An even number of double bonds is an axis (M, P: axial.ts), here an auxiliary descriptor only.
    if (bonds.length % 2 === 0) { const a = axisOf(m, c, chain); if (a) units.push(a); return; }
    if (bonds.some((j) => m.bonds[j].display === "either")) return;
    if (!chain.every((f) => ["C", "N", "Si", "Ge"].includes(m.atoms[f]?.label)) || wavy.has(f1) || wavy.has(f2)) return;
    const s1 = c.adj[f1].filter((e) => e.to !== chain[1]), s2 = c.adj[f2].filter((e) => e.to !== chain[chain.length - 2]);
    if (!s1.length || !s2.length || s1.length > 2 || s2.length > 2 || [...s1, ...s2].some((e) => e.order !== 1)) return;
    if (s1.some((e) => s2.some((x) => x.to === e.to))) return;
    // In a ring of under 8 atoms (a path of up to 7 - chain bonds from end to end round the ring) the bond can only be
    // cis.
    const dist = new Map([[f1, 0]]);
    for (const queue = [f1]; queue.length;) {
      const v = queue.shift()!;
      if (dist.get(v)! >= 7 - bonds.length) continue;
      for (const e of c.adj[v]) if (!bonds.includes(e.bond) && !dist.has(e.to)) { dist.set(e.to, dist.get(v)! + 1); queue.push(e.to); }
    }
    if (dist.has(f2)) return;
    const [c1, c2] = [s1[0].to, s2[0].to];
    const line = (f: number, g: number, s: number) => { const x = unit(sub(m.atoms[f].location, m.atoms[g].location)), y = unit(sub(m.atoms[s].location, m.atoms[f].location)); return !x || !y || dot(cross(x, y), cross(x, y)) < 0.01; };
    if (s1.length === 2 ? sameSide(m, f1, f2, c1, s1[1].to) !== -1 : line(f1, f2, c1)) return;
    if (s2.length === 2 ? sameSide(m, f2, f1, c2, s2[1].to) !== -1 : line(f2, f1, c2)) return;
    const side = sameSide(m, f1, f2, c1, c2);
    if (side) units.push({ kind: "double", foci: [f1, f2], chain, carriers: [c1, c2], cis: side > 0, bond: bonds[(bonds.length - 1) / 2] });
  });
  return units;
}

// An allene's axis as axial.ts reads it: depth +1 at a wedge's wide end and -1 at a hash's, on bonds from the end atoms;
// an end's hydrogen opposite its one drawn ligand, turned half a turn about the axis. Undefined where the drawing sets no
// handedness.
function axisOf(m: Mol, c: Chem, chain: number[]): Axis | undefined {
  const ends = [chain[0], chain[chain.length - 1]], inner = [chain[1], chain[chain.length - 2]];
  if (ends[0] === ends[1] || chain.some((x, k) => k && k < chain.length - 1 && c.adj[x].length !== 2)) return undefined;
  const z = new Map<number, number>();
  for (const b of m.bonds) if ((b.stereo === 1 || b.stereo === 6) && ends.includes(b.atoms[0])) z.set(b.atoms[1], (z.get(b.atoms[1]) ?? 0) + (b.stereo === 1 ? 1 : -1));
  const at = (i: number): V3 => [m.atoms[i].location[0], m.atoms[i].location[1], z.get(i) ?? 0], place = new Map<number, V3>(), h: Axis["h"] = [undefined, undefined];
  for (const [k, t] of ends.entries()) {
    const others = c.adj[t].filter((e) => e.to !== inner[k]).map((e) => e.to);
    if (others.length + c.h[t] !== 2 || !others.length) return undefined;
    for (const o of others) place.set(o, at(o));
    if (others.length === 1) {
      const p = at(others[0]), q = at(t), u = unit(sub(q, at(inner[k]))), v = sub(p, q);
      if (!u) return undefined;
      const along = dot(v, u);
      h[k] = [q[0] + 2 * along * u[0] - v[0], q[1] + 2 * along * u[1] - v[1], q[2] + 2 * along * u[2] - v[2]];
    }
  }
  if (![...place.keys()].some((i) => z.get(i))) return undefined;
  return { kind: "axis", foci: [chain[(chain.length - 1) / 2]], chain, place, h };
}

// ---- The hierarchical digraph ----

// A node: a real atom, a duplicate (from a ring closure or a multiple bond; it has only phantom atoms below it) or an
// implicit hydrogen. dist: a ring closure's distance from the root for rule 1b, that of the atom it duplicates. z is
// the atomic number for rule 1a (a mancude duplicate's may be a fraction), el the element's own; mass is 0 on a
// duplicate. aux: the auxiliary descriptor ("" none, "?" not decided; c and t are seqCis and seqTrans).
const ATOM = 0, RING = 1, BOND = 2, HYDROGEN = 3;
// memo: the node's substituents ranked by each rule set (see sorted).
type Node = { id: number; atom: number; up?: Node; bond: number; depth: number; dist: number; kind: number; z: number; el: number; massNo: number; mass: number; kids?: Node[]; aux: string; memo?: Map<Rules, Sorted> };
type Sorted = { list: Node[]; unique: boolean; pseudo: boolean; epoch?: number };
// A rule: its test on two nodes (atRoot: they are ligands of the root), whether only that test at the root counts (4b
// and 5, whose own exploration is their pair lists), and the rules that rank substituents while it explores.
type Rule = { node: (g: Digraph, a: Node, b: Node, atRoot: boolean) => number; rootOnly?: boolean; sorter: Rules };
// aux: the rules read auxiliary descriptors.
type Rules = { rules: Rule[]; aux: boolean };
// Gives up on a unit: too large a digraph, too much work, or branches that should match but do not.
const fail = (why: string): never => { throw new Error(`CIP: ${why}`); };
const H_MASS = atomMass("H")!;

// The work done for one structure so far.
type Spent = { nodes: number; calls: number };

class Digraph {
  readonly origin: Node;
  root: Node;
  readonly seen = new Set<number>();
  private count = 0;
  private calls = 0;
  private spent: Spent;
  private toward = new Map<Node, Node | undefined>();
  private epoch = 0;
  // Rule 6's reference atom (-1 when none is chosen): see centre.
  ref6 = -1;
  readonly c: Chem;
  constructor(c: Chem, atom: number, spent: Spent) {
    this.c = c;
    this.spent = spent;
    this.origin = this.root = this.make(atom, undefined, -1, ATOM, c.z[atom]);
    this.toward.set(this.origin, undefined);
  }
  private make(atom: number, up: Node | undefined, bond: number, kind: number, z: number, dist = 0): Node {
    if (++this.count > MOST_NODES || ++this.spent.nodes > ALL_NODES) fail("too many nodes");
    if (atom >= 0) this.seen.add(atom);
    const c = this.c, real = kind === ATOM;
    return { id: this.count, atom, up, bond, depth: up ? up.depth + 1 : 1, dist, kind, z, el: atom < 0 ? 1 : c.z[atom], massNo: real ? c.massNo[atom] : 0, mass: real ? c.mass[atom] : kind === HYDROGEN ? H_MASS : 0, aux: "" };
  }
  // The depth of the node on n's path from the root (n included) that is the atom, or 0.
  private onPath(n: Node, atom: number): number {
    for (let p: Node | undefined = n; p; p = p.up) if (p.atom === atom) return p.depth;
    return 0;
  }
  // A node's substituents as the digraph grows from the first root, made when first needed: a neighbour (a ring
  // closure as a duplicate), a duplicate for each extra order of a multiple bond (not at the root, nor of the root),
  // and the hydrogens.
  kids(n: Node): Node[] {
    if (n.kids) return n.kids;
    const out: Node[] = [], c = this.c, a = n.atom;
    n.kids = out;
    if (n.kind !== ATOM) return out;
    // An anion in a resonant mancude part has one duplicate on each bond, as its charge moves round the part.
    const dups = (to: number, bond: number, order: number) => {
      for (let k = c.q[a] < 0 && c.frac[a] !== undefined ? 0 : 1; k < order; k++) out.push(this.make(to, n, bond, BOND, c.frac[a] ?? c.z[to]));
    };
    for (const { to, bond, order } of c.adj[a]) {
      const at = this.onPath(n, to);
      if (!at) {
        out.push(this.make(to, n, bond, ATOM, c.z[to]));
        if (n !== this.origin) dups(to, bond, order);
      } else if (bond === n.bond) {
        if (to !== this.origin.atom) for (let k = 1; k < order; k++) out.push(this.make(to, n, bond, BOND, c.frac[a] ?? c.z[to]));
      } else {
        out.push(this.make(to, n, bond, RING, c.z[to], at));
        dups(to, bond, order);
      }
    }
    for (let k = 0; k < c.h[a]; k++) out.push(this.make(-1, n, -1, HYDROGEN, 1));
    return out;
  }
  // A node's substituents seen from the current root: when the digraph is rerooted at a node below the first root,
  // the nodes on the way back up have their parent as a substituent and lose the child that leads to the root.
  outs(n: Node): Node[] {
    if (this.root === this.origin || !this.toward.has(n)) return this.kids(n);
    const t = this.toward.get(n), out = n.up ? [n.up] : [];
    for (const k of this.kids(n)) if (k !== t) out.push(k);
    return out;
  }
  // A node with no substituents but the one it came from.
  terminal(n: Node): boolean { return n.kind !== ATOM || this.kids(n).length + (n.up ? 1 : 0) <= 1; }
  // Only the nodes on the way from the root to the first root see the digraph differently from a new root, so only
  // their ranked substituents are worked out again.
  reroot(n: Node) {
    if (n === this.root) return;
    for (const p of this.toward.keys()) p.memo = undefined;
    this.root = n;
    this.toward.clear();
    for (let p: Node | undefined = n, prev: Node | undefined; p; prev = p, p = p.up) { this.toward.set(p, prev); p.memo = undefined; }
  }
  // Auxiliary descriptors changed: rankings that read them are worked out again.
  changed() { this.epoch++; }

  // ---- Ranking ----

  // Ranks edges from node `from`, highest first (an insertion sort, so equal ligands keep their order). unique: no
  // two rank the same; pseudo: exactly one decision came from rule 5 (a pseudoasymmetric centre).
  rank(from: Node, edges: Node[], rs: Rules): Sorted {
    const list = [...edges];
    let unique = true, pseudo = 0;
    for (let i = 1; i < list.length; i++) for (let j = i; j > 0; j--) {
      const d = this.compare(from, list[j - 1], list[j], rs);
      if (d < -1 || d > 1) pseudo++;
      if (d < 0) [list[j - 1], list[j]] = [list[j], list[j - 1]];
      else { if (!d) unique = false; break; }
    }
    return { list, unique, pseudo: pseudo === 1 };
  }
  // A node's substituents ranked by a rule set, kept on the node until its view of the digraph changes.
  sorted(n: Node, rs: Rules): Sorted {
    const memo = (n.memo ??= new Map()), hit = memo.get(rs);
    if (hit && (!rs.aux || hit.epoch === this.epoch)) return hit;
    const s: Sorted = { ...this.rank(n, this.outs(n), rs), epoch: this.epoch };
    memo.set(rs, s);
    return s;
  }
  // Two ligands of `from` by each rule in turn, each explored through the whole digraph before the next.
  compare(from: Node, a: Node, b: Node, rs: Rules): number {
    for (const rule of rs.rules) {
      if (rule === R6 && this.ref6 < 0) break; // rule 6 decides nothing until centre chooses its reference
      const d = this.explore(rule, from, a, b);
      if (d) return d;
    }
    return 0;
  }
  // One rule through the digraph, sphere by sphere (P-92.1.4): the two nodes, then their substituent sets in order,
  // each set ranked by this rule alone and then in the order the rules so far give, which is also the order the
  // branches are explored in.
  explore(rule: Rule, from: Node, a: Node, b: Node): number {
    if (++this.calls > MOST_CALLS || ++this.spent.calls > ALL_CALLS) fail("too much work");
    let d = rule.node(this, a, b, from === this.root);
    if (d || rule.rootOnly) return d;
    const qa = [a], qb = [b];
    for (let p = 0; p < qa.length && p < qb.length; p++) {
      const xs = this.outs(qa[p]), ys = this.outs(qb[p]);
      const sx = this.shallow(xs, rule), sy = this.shallow(ys, rule);
      for (let k = 0; k < sx.length && k < sy.length; k++) if ((d = rule.node(this, sx[k], sy[k], false))) return d;
      if (xs.length !== ys.length) return xs.length > ys.length ? 1 : -1;
      const dx = this.sorted(qa[p], rule.sorter).list, dy = this.sorted(qb[p], rule.sorter).list;
      for (let k = 0; k < dx.length; k++) {
        if ((d = rule.node(this, dx[k], dy[k], false))) return d;
        qa.push(dx[k]);
        qb.push(dy[k]);
      }
    }
    return 0;
  }
  // Substituents ordered by each rule's own test on the nodes alone, highest first.
  private shallow(xs: Node[], rule: Rule): Node[] {
    const list = [...xs];
    for (let i = 1; i < list.length; i++) for (let j = i; j > 0; j--) {
      let d = 0;
      for (const r of rule.sorter.rules) if ((d = r.node(this, list[j - 1], list[j], false))) break;
      if (d < 0) [list[j - 1], list[j]] = [list[j], list[j - 1]];
      else break;
    }
    return list;
  }

  // ---- Rule 4b: like and unlike pairs, against a reference descriptor (P-92.5.2) ----

  // The reference descriptor of a branch: the one most often met at the first rank, sphere by sphere, where any are
  // met; both R and S when they are met equally.
  private references(n: Node): string[] {
    let level: Node[][] = [[n]];
    while (level.length) {
      for (const group of level) {
        let r = 0, s = 0;
        for (const x of group) { const d = ref(x.aux); if (d === "R") r++; else if (d === "S") s++; }
        if (r || s) return r > s ? ["R"] : s > r ? ["S"] : ["R", "S"];
      }
      const next: Node[][] = [];
      for (const group of level) {
        const parts = group.map((x) => this.groups(x, this.sorted(x, RULE4B.sorter).list.filter((y) => !this.terminal(y)), RULE4B.sorter));
        if (parts.some((p) => p.length !== parts[0].length)) fail("unequal groups");
        for (let i = 0; i < (parts[0]?.length ?? 0); i++) next.push(parts.flatMap((p) => p[i]));
      }
      level = next;
    }
    return [];
  }
  // Ranked nodes in runs that rank the same.
  groups(from: Node, list: Node[], rs: Rules): Node[][] {
    const out: Node[][] = [];
    list.forEach((x, k) => { if (!k || this.compare(from, list[k - 1], x, rs)) out.push([]); out[out.length - 1].push(x); });
    return out;
  }
  // The descriptors of a branch in the order a reference ranks it (like ones first), after the reference itself.
  pairList(n: Node, reference: string, rs: Rules): string[] {
    const out = [reference], queue = [n];
    for (let p = 0; p < queue.length; p++) {
      const d = ref(queue[p].aux);
      if (d) out.push(d);
      for (const x of this.sorted(queue[p], rs).list) if (!this.terminal(x)) queue.push(x);
    }
    return out;
  }
  rule4b(a: Node, b: Node): number {
    const ra = this.references(a), rb = this.references(b);
    if (!ra.length !== !rb.length) fail("unequal references");
    if (ra.length === 1 && rb.length === 1) {
      // Node by node in the order each reference ranks them: like the reference beats unlike (or none).
      const qa = [a], qb = [b], rsA = LIKE4B[ra[0]], rsB = LIKE4B[rb[0]];
      for (let p = 0; p < qa.length && p < qb.length; p++) {
        const la = ref(qa[p].aux) === ra[0], lb = ref(qb[p].aux) === rb[0];
        if (la !== lb) return la ? 1 : -1;
        for (const x of this.sorted(qa[p], rsA).list) if (!this.terminal(x)) qa.push(x);
        for (const x of this.sorted(qb[p], rsB).list) if (!this.terminal(x)) qb.push(x);
      }
      return 0;
    }
    // Both R and S met equally first in a branch: its descriptors are listed against each, the better list first.
    const la = ra.map((r) => this.pairList(a, r, LIKE4B[r])).sort((x, y) => likePairs(y, x)), lb = rb.map((r) => this.pairList(b, r, LIKE4B[r])).sort((x, y) => likePairs(y, x));
    for (let i = 0; i < la.length && i < lb.length; i++) { const d = likePairs(la[i], lb[i]); if (d) return d; }
    return 0;
  }
  // Rule 5 (P-92.5.3): R ranks above S. +2 or -2 when the decision makes the centre pseudoasymmetric.
  rule5(a: Node, b: Node): number {
    const r = likePairs(this.pairList(a, "R", LIKE5.R), this.pairList(b, "R", LIKE5.R)), s = likePairs(this.pairList(a, "S", LIKE5.S), this.pairList(b, "S", LIKE5.S));
    return r < 0 ? (s < 0 ? -1 : -2) : r > 0 ? (s > 0 ? 1 : 2) : 0;
  }

  // ---- Labels ----

  // A tetrahedral centre's label with node n as the root.
  centre(n: Node, u: Centre, rs: Rules): string {
    this.reroot(n);
    const edges = this.outs(n);
    if (edges.length < 3) return "";
    let s = this.rank(n, edges, rs);
    // Rule 6 (Hanson et al.'s proposal): where four ligands still tie in two sets (a a' b b', a a' a'' b), one of the
    // tied ones (the second ranked) is taken as the reference, which ranks above every node it does not duplicate,
    // and the ligands are ranked again. Where all four tie, a reference is taken twice, the first ranked and then the
    // second; if the two rankings differ by an odd permutation there is no label.
    if (!s.unique && edges.length === 4 && rs === ALL) {
      const groups = this.groups(n, s.list, rs).length, real = (x: Node) => (x.kind === ATOM ? x.atom : -1);
      const by = (ref: number, list: Node[]) => { this.ref6 = ref; this.changed(); try { return this.rank(n, list, rs); } finally { this.ref6 = -1; this.changed(); } };
      if (groups === 2 && real(s.list[1]) >= 0) s = by(real(s.list[1]), s.list);
      else if (groups === 1 && real(s.list[0]) >= 0) {
        const first = by(real(s.list[0]), s.list);
        if (real(first.list[1]) < 0) return "?";
        s = by(real(first.list[1]), first.list);
        if (parity(first.list.map((x) => x.id), s.list.map((x) => x.id))) return "?";
      }
    }
    if (!s.unique) return "?";
    const ranked = s.list.filter((x) => x.kind !== BOND && x.kind !== HYDROGEN).map((x) => x.atom);
    while (ranked.length < 4) ranked.push(-1);
    const odd = parity(u.around, ranked);
    return odd === undefined ? "?" : odd ? (s.pseudo ? "s" : "S") : s.pseudo ? "r" : "R";
  }
  // The node of a chain's far end, walking the chain's atoms from node n (one end). Undefined when the digraph does not
  // run along the chain from n.
  private along(n: Node, chain: number[]): Node | undefined {
    let p: Node | undefined = n;
    for (const atom of chain.slice(1)) p = p && [...(p.up ? [p.up] : []), ...this.kids(p)].find((x) => x.kind === ATOM && x.atom === atom);
    return p;
  }
  // A double bond's (or cumulene's) label with node n1 (one of its ends) as the root.
  double(n1: Node, u: Double, rs: Rules): string {
    const swap = n1.atom !== u.foci[0], chain = swap ? [...u.chain].reverse() : u.chain, [c1, c2] = swap ? [u.carriers[1], u.carriers[0]] : u.carriers;
    const n2 = this.along(n1, chain);
    if (!n2) return "?";
    this.reroot(n1);
    const e1 = this.outs(n1).filter((x) => x.atom !== chain[1]);
    const p1 = this.rank(n1, e1, rs);
    this.reroot(n2);
    const e2 = this.outs(n2).filter((x) => x.atom !== chain[chain.length - 2]);
    if (!e1.length || !e2.length) return "";
    const p2 = this.rank(n2, e2, rs);
    if (!p1.unique || !p2.unique) return "?";
    let cis = u.cis;
    if (e1.length > 1 && p1.list[0].atom !== c1) cis = !cis;
    if (e2.length > 1 && p2.list[0].atom !== c2) cis = !cis;
    const pseudo = p1.pseudo !== p2.pseudo;
    return cis ? (pseudo ? "c" : "Z") : pseudo ? "t" : "E";
  }
  // An allene's axial descriptor with node n (its middle atom) as the root, as Centres gives it: each end's ligands
  // ranked with the end as the root, then M or P by the handedness of the ends' ligands, higher first (P-93.5.1.3:
  // Ra is M); m or p where only one end's ranking is pseudoasymmetric.
  axis(n: Node, u: Axis, rs: Rules): string {
    const mid = (u.chain.length - 1) / 2, ends = [this.along(n, u.chain.slice(0, mid + 1).reverse()), this.along(n, u.chain.slice(mid))];
    const inner = [u.chain[1], u.chain[u.chain.length - 2]], ranked: Sorted[] = [];
    for (const [k, e] of ends.entries()) {
      if (!e) return "";
      this.reroot(e);
      const subs = this.outs(e).filter((x) => (x.kind === ATOM || x.kind === HYDROGEN) && x.atom !== inner[k]);
      if (!subs.length || subs.length > 2) return "";
      const s = this.rank(e, subs, rs);
      if (!s.unique) return "?";
      ranked.push(s);
    }
    const place = (x: Node | undefined, k: number) => (!x ? u.h[k] : x.kind === HYDROGEN ? u.h[k] : u.place.get(x.atom));
    const ps = ranked.flatMap((s, k) => [place(s.list[0], k), place(s.list[1], k)]);
    if (ps.some((p) => !p)) return "?";
    const hand = handedness(...(ps as [V3, V3, V3, V3])), pseudo = ranked[0].pseudo !== ranked[1].pseudo;
    return !hand ? "?" : hand === "R" ? (pseudo ? "m" : "M") : pseudo ? "p" : "P";
  }
  label(u: Unit, rs: Rules): string {
    this.reroot(this.origin);
    return u.kind === "centre" ? this.centre(this.origin, u, rs) : u.kind === "double" ? this.double(this.origin, u, rs) : "";
  }
  // Auxiliary descriptors (as Hanson et al. set them out): every other stereo unit met in this digraph is labelled as
  // the digraph has it, from the farthest in; units at one distance all see the labels of those farther out only.
  auxiliary(u: Unit, units: Unit[]) {
    this.reroot(this.origin);
    const found: [Node, Unit][] = [];
    for (const v of units) {
      if (v === u || !v.foci.some((f) => this.seen.has(f))) continue;
      // A double bond's descriptor sits on its end nearer the root.
      for (const n of this.nodesOf(v.foci[0])) {
        const far = v.kind === "double" ? this.along(n, v.chain) : undefined;
        found.push([far && far.depth < n.depth ? far : n, v]);
      }
    }
    found.sort((x, y) => y[0].depth - x[0].depth);
    const queue = new Map<Node, string>();
    const flush = () => { for (const [n, l] of queue) n.aux = l; queue.clear(); this.changed(); };
    let prev = Infinity;
    for (const [n, v] of found) {
      if (n.depth < prev) { flush(); prev = n.depth; }
      queue.set(n, v.kind === "centre" ? this.centre(n, v, ALL) : v.kind === "double" ? this.double(n, v, ALL) : this.axis(n, v, ALL));
    }
    flush();
  }
  // Every real node of an atom, from the first root out.
  private nodesOf(atom: number): Node[] {
    const out: Node[] = [];
    for (const queue = [this.origin]; queue.length;) {
      const n = queue.pop()!;
      if (n.atom === atom && n.kind === ATOM) out.push(n);
      queue.push(...this.kids(n));
    }
    return out.sort((x, y) => x.depth - y.depth || x.id - y.id);
  }
}

// R for R, M and seqCis; S for S, P and seqTrans; "" for the rest.
const ref = (d: string) => (d === "R" || d === "M" || d === "c" ? "R" : d === "S" || d === "P" || d === "t" ? "S" : "");
// Two pair lists of one length: like pairs (a descriptor like the list's reference) rank before unlike ones.
function likePairs(x: string[], y: string[]): number {
  if (x.length !== y.length) fail("unequal pair lists");
  for (let i = 1; i < x.length; i++) { const a = x[i] === x[0], b = y[i] === y[0]; if (a !== b) return a ? 1 : -1; }
  return 0;
}
// Whether permutation `to` of `from` is odd; undefined when they hold different ligands.
function parity(from: number[], to: number[]): boolean | undefined {
  const at = to.map((x) => from.indexOf(x));
  if (at.length !== from.length || at.some((x) => x < 0) || new Set(at).size !== at.length) return undefined;
  let odd = false;
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (at[i] > at[j]) odd = !odd;
  return odd;
}

// ---- The rules ----

const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
// Rule 3 ranks Z (seqcis) before E; rule 4a chiral units before pseudoasymmetric ones (a double bond's E or Z counts
// with these, its seqCis or seqTrans with the chiral ones) before none; rule 4c r before s.
const ORD3: Record<string, number> = { Z: 2, E: 1 }, ORD4A: Record<string, number> = { R: 2, S: 2, M: 2, P: 2, c: 2, t: 2, r: 1, s: 1, m: 1, p: 1, E: 1, Z: 1 }, ORD4C: Record<string, number> = { r: 2, m: 2, s: 1, p: 1 };
const rule = (node: Rule["node"], rootOnly = false): Rule => ({ node, rootOnly, sorter: { rules: [], aux: false } });
const R1A = rule((_, a, b) => sign(a.z - b.z));
// Rule 1b (P-92.1.4.2): a duplicate whose duplicated atom is nearer the root ranks higher. As Hanson et al. read it, it
// holds for ring closures only (and a ring closure ranks above any other node): a multiple bond's duplicates would make
// the label depend on which Kekulé form is drawn (the suite's VS005, VS007 and its mancude rule 5 cases).
const R1B = rule((_, a, b) => (a.kind === RING && b.kind === RING ? sign(b.dist - a.dist) : a.kind === RING ? 1 : b.kind === RING ? -1 : 0));
// Rule 2: higher mass first, where a mass number is given (a duplicate has none and weighs nothing).
const R2 = rule((_, a, b) => (!a.el || !b.el ? sign(a.el - b.el) : !a.massNo && !b.massNo ? 0 : sign(a.mass - b.mass) || 0));
const R3 = rule((_, a, b) => sign((ORD3[a.aux] ?? 0) - (ORD3[b.aux] ?? 0)));
const R4A = rule((_, a, b) => sign((ORD4A[a.aux] ?? 0) - (ORD4A[b.aux] ?? 0)));
const RULE4B = rule((g, a, b, atRoot) => (atRoot ? g.rule4b(a, b) : 0), true);
const R4C = rule((_, a, b) => sign((ORD4C[a.aux] ?? 0) - (ORD4C[b.aux] ?? 0)));
const R5 = rule((g, a, b, atRoot) => (atRoot ? g.rule5(a, b) : 0), true);
// Rule 6 (proposed by Hanson et al. for the most symmetric cages and spiranes): the reference atom chosen in centre
// ranks above any other node. It comes after rule 5, so a decision by it makes the centre pseudoasymmetric (2).
const R6 = rule((g, a, b) => (g.ref6 < 0 || (a.atom === g.ref6) === (b.atom === g.ref6) ? 0 : a.atom === g.ref6 ? 2 : -2));
const MAIN = [R1A, R1B, R2, R3, R4A, RULE4B, R4C, R5, R6];
MAIN.forEach((r, i) => { r.sorter = { rules: MAIN.slice(0, i + 1), aux: i > 2 }; });
const CONSTITUTIONAL: Rules = { rules: [R1A, R1B, R2], aux: false }, ALL: Rules = { rules: MAIN, aux: true };
// Below the root, rules 4b and 5 rank by likeness to a reference descriptor: both nodes need a descriptor, and the one
// like the reference ranks higher. Such a rule explores (and ranks) by itself alone.
const liking = (reference: string): Rule => {
  const r = rule((_, a, b) => { if (!a.aux || !b.aux) return 0; const x = ref(a.aux) === reference, y = ref(b.aux) === reference; return x === y ? 0 : x ? 1 : -1; });
  r.sorter = { rules: [r], aux: true };
  return r;
};
const LIKE4B: Record<string, Rules> = Object.fromEntries(["R", "S"].map((x) => [x, { rules: [...MAIN.slice(0, 5), liking(x)], aux: true }]));
const LIKE5: Record<string, Rules> = Object.fromEntries(["R", "S"].map((x) => [x, { rules: [...MAIN.slice(0, 7), liking(x)], aux: true }]));

// ---- Labelling ----

// The CIP labels of a structure (labels expanded into atoms), in its atom and bond order: R, S, r, s on atoms, E and
// Z on double bonds. Each unit is ranked by the constitutional rules (1a, 1b, 2) first; only a unit they cannot settle
// has the auxiliary descriptors of the units around it worked out for rules 3 to 5.
export function cipLabels(m: Mol): Cip {
  const out: Cip = { atoms: m.atoms.map(() => undefined), bonds: m.bonds.map(() => undefined) };
  if (m.atoms.length > MOST_ATOMS) return out;
  let c: Chem, units: Unit[];
  // A structure the rules cannot read (a bond to a missing atom, say) has no labels.
  try { c = chemOf(m); units = stereoUnits(m, c); } catch { return out; }
  const spent = { nodes: 0, calls: 0 };
  for (const u of units) {
    if (u.kind === "axis") continue;
    try {
      const g = new Digraph(c, u.foci[0], spent);
      u.label = g.label(u, CONSTITUTIONAL);
      if (u.label === "?") { g.auxiliary(u, units); u.label = g.label(u, ALL); }
    } catch { u.label = ""; }
  }
  for (const u of units) {
    if (u.kind === "centre" && /^[RSrs]$/.test(u.label ?? "")) out.atoms[u.foci[0]] = u.label;
    if (u.kind === "double" && /^[EZct]$/.test(u.label ?? "")) out.bonds[u.bond] = u.label === "c" ? "Z" : u.label === "t" ? "E" : u.label;
  }
  return out;
}
