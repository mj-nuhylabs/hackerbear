// Axial chirality: the (M) and (P) labels Show Stereochemistry gives allenes and hindered biaryls (atropisomers), as
// ChemDraw 25.0 and later does. Written from the 2013 IUPAC recommendations (P-93.5.1.3 and P-92.1.4): the axis is
// seen as an elongated tetrahedron whose two near ligands rank before its two far ones, its R or S is Ra or Sa, and
// Ra is M, Sa is P. Ligands are ranked by the CIP rules on the hierarchical digraph (rule 1a, then rule 2 for
// isotopes). Depth comes from the drawing's wedge and hash bonds, as ChemDraw reads them: at an allene, on the bonds
// from its end atoms; at a biaryl, on the ring bonds from an axis atom or on an ortho atom's bond to its substituent.
import { hydrogens, type Mol } from "./render.ts";
import { ELEMENTS } from "./labels.ts";
import { aromaticAtoms, rings } from "./rings.ts";

type V3 = [number, number, number];
const SYMBOLS = [...ELEMENTS];
// Atomic number; D and T are hydrogen.
const atomicNumber = (label: string) => (label === "D" || label === "T" ? 1 : SYMBOLS.indexOf(label) + 1);
// Rule 2: a ligand's mass, the isotope's when one is given (D is 2, T 3), else the element's natural mass, near enough to
// sort isotopes of one element (12C ranks below natural carbon, 13C above).
const NATURAL: Record<number, number> = { 1: 1.008, 6: 12.011, 7: 14.007, 8: 15.999, 9: 18.998, 16: 32.06, 17: 35.45, 35: 79.904, 53: 126.9 };
const massOf = (label: string, isotope?: number) => isotope ?? (label === "D" ? 2 : label === "T" ? 3 : NATURAL[atomicNumber(label)] ?? atomicNumber(label) * 2 + 0.5);

// The graph CIP ranking walks: each atom's neighbours (with bond order), hydrogens, atomic number and mass, whether it
// is aromatic, and its rings. A bond between two aromatic atoms in a ring counts as single; each aromatic atom has
// instead one duplicate whose atomic number (and mass) is the mean of its aromatic neighbours', as the rules give a
// mancude ring, so a ring ranks the same whichever Kekulé form is drawn.
type Graph = { near: { to: number; order: number }[][]; h: number[]; z: number[]; mass: number[]; arom: boolean[]; mancude: ([number, number] | undefined)[]; rings: number[][] };
function graphOf(m: Mol): Graph {
  const order = (type: number) => (type >= 1 && type <= 3 ? type : 1);
  const used = m.atoms.map(() => 0);
  for (const b of m.bonds) for (const i of b.atoms) used[i] += order(b.type);
  const h = m.atoms.map((a, i) => a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical === 1 ? 1 : a.radical ? 2 : 0));
  const arom = aromaticAtoms({ atoms: m.atoms.map((a, i) => ({ el: a.text ? "X" : a.label, charge: a.charge ?? 0, h: h[i] })), bonds: m.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: order(b.type) as 1 | 2 | 3 })) });
  const ringList = rings({ atoms: m.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: m.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) });
  const inRing = (i: number, j: number) => ringList.some((r) => r.some((x, k) => x === i && (r[(k + 1) % r.length] === j || r[(k + r.length - 1) % r.length] === j)));
  const near: Graph["near"] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    const [i, j] = b.atoms, o = arom[i] && arom[j] && inRing(i, j) ? 1 : order(b.type);
    near[i].push({ to: j, order: o }); near[j].push({ to: i, order: o });
  }
  const z = m.atoms.map((a) => atomicNumber(a.label)), mass = m.atoms.map((a) => massOf(a.label, a.isotope));
  const mancude = m.atoms.map((_, i) => {
    const ring = arom[i] ? near[i].filter((e) => arom[e.to] && inRing(i, e.to)).map((e) => e.to) : [];
    return ring.length ? [ring.reduce((t, j) => t + z[j], 0) / ring.length, ring.reduce((t, j) => t + mass[j], 0) / ring.length] as [number, number] : undefined;
  });
  return { near, h, z, mass, arom, mancude, rings: ringList };
}

// A node of the hierarchical digraph: a real atom, a duplicate (made by a multiple bond or a ring closure; it has only
// phantom substituents), a mancude ring's duplicate (key: its mean atomic number and mass) or a hydrogen. path: the
// atoms from the root to it, for ring closures.
type Node = { atom: number; dup: boolean; h?: true; key?: [number, number]; path: number[] };
const MOST_NODES = 4000, MOST_SPHERES = 30;

// Compares the branches from `root` through its neighbours `a` and `b` by the CIP rules: positive when a ranks
// higher, negative when b does, 0 when Octet cannot tell them apart (a tie, or more than it explores).
export function compareBranches(m: Mol, root: number, a: number, b: number, g = graphOf(m)): number {
  for (const rule of [0, 1]) {
    const key = (n: Node) => (n.h ? [1, 1.008][rule] : n.key ? n.key[rule] : rule ? g.mass[n.atom] : g.z[n.atom]);
    const sets = (start: number) => [[{ atom: start, dup: false, path: [root, start] } as Node]];
    let la = sets(a), lb = sets(b), count = 0;
    for (let sphere = 0; sphere < MOST_SPHERES && (la.length || lb.length); sphere++) {
      const ka = la.flatMap((s) => s.map(key)), kb = lb.flatMap((s) => s.map(key));
      for (let k = 0; k < Math.max(ka.length, kb.length); k++) if ((ka[k] ?? 0) !== (kb[k] ?? 0)) return (ka[k] ?? 0) - (kb[k] ?? 0);
      la = next(g, la, key);
      lb = next(g, lb, key);
      count += la.length + lb.length;
      if (count > MOST_NODES) return 0;
    }
  }
  return 0;
}
// The next sphere: each node's substituents as a set, in order of the sets above; nodes that rank the same so far go in
// order of their own substituents, highest first.
function next(g: Graph, level: Node[][], key: (n: Node) => number): Node[][] {
  const lex = (x: Node[], y: Node[]) => { for (let k = 0; k < Math.max(x.length, y.length); k++) { const d = (y[k] ? key(y[k]) : 0) - (x[k] ? key(x[k]) : 0); if (d) return d; } return 0; };
  return level.flatMap((s) => s.map((n) => ({ n, c: children(g, n, key) })).sort((x, y) => key(y.n) - key(x.n) || lex(x.c, y.c)).map((x) => x.c)).filter((c) => c.length);
}
// A node's substituents, highest first: its neighbours but the one it came from (a ring closure as a duplicate), a
// duplicate of the far atom for each extra order of a multiple bond (the bond it came in by too), an aromatic atom's
// mancude duplicate, and its hydrogens.
function children(g: Graph, n: Node, key: (n: Node) => number): Node[] {
  if (n.dup || n.h) return [];
  const from = n.path[n.path.length - 2], out: Node[] = [];
  for (const e of g.near[n.atom]) {
    const dup = (atom: number) => ({ atom, dup: true, path: [...n.path, atom] });
    if (e.to === from) { for (let k = 1; k < e.order; k++) out.push(dup(e.to)); continue; }
    out.push(n.path.includes(e.to) ? dup(e.to) : { atom: e.to, dup: false, path: [...n.path, e.to] });
    for (let k = 1; k < e.order; k++) out.push(dup(e.to));
  }
  const mancude = g.mancude[n.atom];
  if (mancude) out.push({ atom: n.atom, dup: true, key: mancude, path: n.path });
  for (let k = 0; k < g.h[n.atom]; k++) out.push({ atom: n.atom, dup: false, h: true, path: n.path });
  return out.sort((x, y) => key(y) - key(x));
}

// The handedness of four ligands ranked 1 to 4 around a centre: "R" when 1 → 2 → 3 turns clockwise with 4 away from
// the viewer, "S" when it turns anticlockwise, undefined when they lie flat. x right, y up, z towards the viewer.
export function handedness(p1: V3, p2: V3, p3: V3, p4: V3): "R" | "S" | undefined {
  const d = (p: V3): V3 => [p[0] - p4[0], p[1] - p4[1], p[2] - p4[2]], a = d(p1), b = d(p2), c = d(p3);
  const v = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  return Math.abs(v) < 1e-6 ? undefined : v < 0 ? "R" : "S";
}

// Each atom's depth from the wedge and hash bonds that start at the atoms in `from`: +1 at a wedge's wide end, -1 at
// a hash's.
function depths(m: Mol, from: Set<number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of m.bonds) if ((b.stereo === 1 || b.stereo === 6) && from.has(b.atoms[0])) out.set(b.atoms[1], (out.get(b.atoms[1]) ?? 0) + (b.stereo === 1 ? 1 : -1));
  return out;
}
const at = (m: Mol, i: number, z = 0): V3 => [m.atoms[i].location[0], m.atoms[i].location[1], z];

// One end of an axis: its atom, its two ligands ranked (higher first, a hydrogen as -1) and their places.
type End = { ligands: [number, number]; places: [V3, V3] };
// The end at atom `t` whose other ligands are `others` (one or two atoms; a missing one is a hydrogen), seen from
// `axis` (the atom across the axis). place: where each ligand is, in 3D. Undefined when the two rank the same.
function endOf(m: Mol, g: Graph, t: number, others: number[], axis: number, place: (i: number) => V3): End | undefined {
  if (others.length === 2) {
    const c = compareBranches(m, t, others[0], others[1], g);
    if (!c) return undefined;
    const [hi, lo] = c > 0 ? others : [others[1], others[0]];
    return { ligands: [hi, lo], places: [place(hi), place(lo)] };
  }
  if (others.length !== 1 || g.h[t] !== 1) return undefined;
  // A hydrogen ranks below any other ligand. Its place: the other ligand's, turned half a turn about the axis.
  const o = others[0], p = place(o), c = at(m, t), u = unit(sub(c, at(m, axis))), v = sub(p, c), along = dot(v, u);
  const h: V3 = [c[0] + 2 * along * u[0] - v[0], c[1] + 2 * along * u[1] - v[1], c[2] + 2 * along * u[2] - v[2]];
  return g.z[o] === 1 && !m.atoms[o].isotope ? undefined : { ligands: [o, -1], places: [p, h] };
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// M or P for an axis with ends `near` and `far` (either way round gives the same answer).
const helicity = (near: End, far: End) => ({ R: "M", S: "P", undefined: undefined })[String(handedness(near.places[0], near.places[1], far.places[0], far.places[1])) as "R" | "S" | "undefined"];

// The (M) and (P) labels of a structure (labels expanded): on the middle atom of each allene (and of each cumulene
// with an even number of double bonds), and on the axis bond of each hindered biaryl. In the drawing's atom and bond
// order; undefined where there is none.
export function axialLabels(m: Mol): { atoms: (string | undefined)[]; bonds: (string | undefined)[] } {
  const atoms: (string | undefined)[] = m.atoms.map(() => undefined), bonds: (string | undefined)[] = m.bonds.map(() => undefined);
  if (!m.bonds.some((b) => b.stereo === 1 || b.stereo === 6)) return { atoms, bonds };
  const g = graphOf(m), near = (i: number) => g.near[i].map((e) => e.to);
  // Cumulenes: chains of atoms with two double bonds and nothing else.
  const cumulated = (i: number) => g.near[i].length === 2 && g.near[i].every((e) => e.order === 2);
  const seen = new Set<number>();
  m.atoms.forEach((_, i) => {
    if (!cumulated(i) || seen.has(i)) return;
    const chain = [i];
    seen.add(i);
    for (const dir of [0, 1]) {
      let prev = i, cur = g.near[i][dir].to;
      while (cumulated(cur) && !seen.has(cur)) { seen.add(cur); dir ? chain.push(cur) : chain.unshift(cur); const next = near(cur).find((x) => x !== prev)!; prev = cur; cur = next; }
      dir ? chain.push(cur) : chain.unshift(cur);
    }
    // An odd number of cumulated atoms (an even number of double bonds) makes an axis; the ends are the chain's ends.
    const [t1, t2] = [chain[0], chain[chain.length - 1]];
    if (chain.length % 2 === 0 || t1 === t2 || cumulated(t1) || cumulated(t2)) return;
    const z = depths(m, new Set([t1, t2])), place = (k: number) => at(m, k, z.get(k) ?? 0);
    const e1 = endOf(m, g, t1, near(t1).filter((x) => x !== chain[1]), chain[1], place);
    const e2 = endOf(m, g, t2, near(t2).filter((x) => x !== chain[chain.length - 2]), chain[chain.length - 2], place);
    if (e1 && e2) atoms[chain[(chain.length - 1) / 2]] = helicity(e1, e2);
  });
  // Hindered biaryls, as ChemDraw finds them: a single bond out of any ring (or in a ring of 7) between two aromatic
  // ring atoms, each with only its two ring bonds besides, and at least three of the four ortho atoms substituted.
  m.bonds.forEach((b, k) => {
    const [a, c] = b.atoms;
    if (b.type !== 1 || !g.arom[a] || !g.arom[c] || near(a).length !== 3 || near(c).length !== 3) return;
    const inRings = g.rings.filter((r) => r.includes(a) && r.includes(c) && r.some((x, j) => (x === a && (r[(j + 1) % r.length] === c || r[(j + r.length - 1) % r.length] === c))));
    if (inRings.length && !inRings.some((r) => r.length === 7)) return;
    const orthoA = near(a).filter((x) => x !== c), orthoC = near(c).filter((x) => x !== a);
    if ([...orthoA, ...orthoC].filter((o) => near(o).length === 3).length < 3) return;
    // Depth: a wedge from an axis atom to an ortho atom, or from an ortho atom to its substituent, puts that ortho
    // atom towards the viewer (a hash, away). The other ortho atom of the same ring turns the other way.
    const zs = depths(m, new Set([a, c])), zo = depths(m, new Set([...orthoA, ...orthoC]));
    const tilt = new Map<number, number>();
    for (const [ring, axis] of [[orthoA, a], [orthoC, c]] as const) {
      const own = ring.map((o) => (zs.get(o) ?? 0) + near(o).filter((s) => s !== axis).reduce((t, s) => t + (zo.get(s) ?? 0), 0));
      const d = Math.sign(own[0] - own[1]);
      ring.forEach((o, j) => tilt.set(o, j === 0 ? d : -d));
    }
    const place = (o: number) => at(m, o, tilt.get(o) ?? 0);
    const e1 = endOf(m, g, a, orthoA, c, place), e2 = endOf(m, g, c, orthoC, a, place);
    if (e1 && e2) bonds[k] = helicity(e1, e2);
  });
  return { atoms, bonds };
}
